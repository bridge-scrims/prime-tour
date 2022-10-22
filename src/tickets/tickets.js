const { Events, Message, ChannelType, PermissionFlagsBits, GuildChannel, GuildMember } = require("discord.js");

const DynamicallyConfiguredObjectCollection = require("../lib/tools/dynamic_configuration");
const StatusChannel = require("../lib/discord-bot/tools/status_channel");
const SQLStatementCreator = require("../lib/postgresql/statements");
const LocalizedError = require("../lib/tools/localized_error");
const AsyncFunctionBuffer = require("../lib/tools/buffer");
const TicketTranscriber = require("./ticket_transcriber");
const UserProfile = require("../lib/scrims/user_profile");
const Ticket = require("../lib/scrims/ticket");

const CLOSE_REASONS = {
    CreatorLeft: "closed this ticket because of the person leaving the server",
    ChannelMissing: "closed this ticket because of the channel no longer existing",
    ChannelDeletedAudited: "deleted the ticket channel",
    ChannelDeletedUnaudited: "closed this ticket after someone deleted the channel"
}

const CHANNEL_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.ReadMessageHistory
]

/**
 * @todo More information in transcript (close requests, permission updates, ...)
 */

/**
 * @typedef TicketManagerConfig
 * @property {import("../lib/types").ScrimsPermissions} [permissions] The permissions needed to do stuff like delete this ticket.
 * @property {import("../lib/types").PositionResolvable} [blackListed] The position that indicates if a user is blacklisted from creating these tickets.
 * @property {TicketTranscriber.TicketTranscriberOptions|false} [transcript] The transcript configuration that should be used or false for no transcripts.
 * @property {string[]} [commonCloseReasons] Close reasons that should be provided as autocomplete.
 * @property {number} [cooldown] Number of seconds before another ticket can be created.
 */

class TicketManager {

    /** @type {Object.<string, TicketManager>} */
    static ticketManagers = {}

    /** @param {string} ticketTypeName */
    static getManager(ticketTypeName) {
        return this.ticketManagers[ticketTypeName];
    }

    /** @param {import('../lib/types').ScrimsInteraction} interaction */
    static async findTicket(interaction) {
        const ticket = await interaction.database.tickets.find({ channel_id: interaction.channelId })
        if (!ticket) throw new LocalizedError("tickets.none")
        const ticketManager = TicketManager.getManager(ticket.type?.name)
        if (!ticketManager) throw new Error(`No manager for ticket with type '${ticket.type?.name}'!`)
        return { ticket, ticketManager };
    }

    /** 
     * @param {import("../lib/discord-bot/bot")} bot 
     * @param {string} typeName
     * @param {TicketManagerConfig}
     */
    constructor(bot, typeName, { permissions, blackListed, transcript, commonCloseReasons, cooldown } = {}) {
        
        Object.defineProperty(this, "bot", { value: bot })

        /** 
         * @readonly
         * @type {import("../lib/discord-bot/bot")} 
         */
        this.bot

        this.type = typeName

        /** @type {import("../lib/types").ScrimsPermissions} */
        this.permissions = permissions ?? { requiredPermissions: ["Administrator"] }

        this.blackListedPosition = blackListed ?? null

        this.cooldown = cooldown ?? null

        /** @type {string[]} */
        this.commonCloseReasons = commonCloseReasons ?? []

        /** 
         * @readonly
         * @type {DynamicallyConfiguredObjectCollection<?StatusChannel>}
         */
        this.statusChannels = new DynamicallyConfiguredObjectCollection(
            this.database, `tickets_${typeName}_status_channel`, 
            (...a) => this._createStatusChannel(...a), 
            (...a) => this._removeStatusChannel(...a)
        )

        /** @type {Object.<string, NodeJS.Timeout} */
        this.closeRequestTimeouts = {}

        /** @type {Object.<string, Array.<string>>} */
        this.closeRequests = {}

        /** @type {TicketTranscriber|undefined} */
        this.transcriber

        if (transcript) this.transcriber = new TicketTranscriber(this.database, transcript)
        this.closeBuffer = new AsyncFunctionBuffer((...args) => this._closeTicket(...args))
        
        this.bot.on('databaseConnected', () => this.onConnected())
        this.bot.on('initialized', () => this.onStartup())

        TicketManager.ticketManagers[typeName] = this
        
    }

    get database() {
        return this.bot.database;
    }

    onConnected() {
        this.addListeners()
    }

    onStartup() {
        this.deleteGhostTickets().catch(console.error)
        setInterval(() => this.deleteGhostTickets().catch(console.error), 5*60*1000)
    }

    /** @param {Ticket} ticket */
    ticketShouldExist(ticket) {
        return !ticket.discordGuild?.members?.me || (ticket.channel);
    }

    async deleteGhostTickets() {
        const existingTickets = this.database.tickets.cache.filter(ticket => ticket.type?.name === this.type && ticket.status?.name !== 'deleted')
        for (const ticket of existingTickets) {
            if (!this.ticketShouldExist(ticket)) {
                await this.closeTicket(ticket, null, this.bot.user, CLOSE_REASONS.ChannelMissing).catch(console.error)
            }
        }
    }

    addListeners() {
        if (this.transcriber) {
            this.bot.on(Events.MessageCreate, message => this.onMessageCreate(message).catch(console.error))
            this.bot.on(Events.MessageUpdate, (oldMessage, newMessage) => this.onMessageUpdate(oldMessage, newMessage).catch(console.error))
        }
        this.bot.on(Events.MessageDelete, message => this.onMessageDelete(message).catch(console.error))
        this.bot.on(Events.MessageBulkDelete, messages => this.onMessageDeleteBulk(messages).catch(console.error))
        this.bot.on(Events.GuildMemberRemove, member => this.onMemberRemove(member).catch(console.error))
        this.bot.auditedEvents.on(Events.ChannelDelete, channel => this.onChannelDelete(channel).catch(console.error))
        this.database.tickets.cache.on('change', t => this.updateStatusChannel(t.guild_id).catch(console.error))
    }

    cancelCloseTimeout(messageId) {

        if (messageId in this.closeRequestTimeouts) {
            clearTimeout(this.closeRequestTimeouts[messageId])
            delete this.closeRequestTimeouts[messageId]
        }

        if (messageId in this.closeRequests) {
            this.closeRequests[messageId].forEach(v => this.cancelCloseTimeout(v))
            delete this.closeRequests[messageId]
        }

    }

    async updateStatusChannel(guildId) {
        const channel = this.statusChannels.get(guildId)
        if (channel) await this._updateStatusChannel(channel)
    }

    /** 
     * @protected
     * @type {DynamicallyConfiguredObjectCollection.removeCall<?StatusChannel>}
     */
    async _removeStatusChannel(channel) {
        if (channel) channel.destroy()
    }

    /** 
     * @protected
     * @type {DynamicallyConfiguredObjectCollection.createCall<?StatusChannel>} 
     */
    async _createStatusChannel({ value }, existing) {
        const channel = await this.bot.channels.fetch(value).catch(console.error)
        if (channel?.id === existing?.id || (!channel && !existing)) return null;
        const status = (channel) ? new StatusChannel(channel) : null;
        if (status) this._updateStatusChannel(status).catch(console.error)
        return status;
    }

    /** 
     * @protected 
     * @param {StatusChannel} channel
     */
    async _updateStatusChannel(channel) {
        const selector = { guild_id: channel.guildId, type: { name: this.type } }
        const totalTickets = await this.database.tickets.count(selector)
        const finishedTickets = await this.database.tickets.count({ ...selector, status: { name: "deleted" } })
        const status = `${finishedTickets}/${totalTickets} Tickets`
        await channel.update(status)
    }

    getTicketCategory(guildId) {
        return this.bot.getConfigValue(guildId, `tickets_${this.type}_category`);
    }

    /** 
     * @param {GuildMember} member
     * @param {import("discord.js").GuildChannelCreateOptions} [channelOptions]
     */
    async createChannel(member, channelOptions = {}) {
        const parent = this.getTicketCategory(member.guild.id, this.type) ?? null
        if (parent) channelOptions.parent = parent
        if (!channelOptions.name) channelOptions.name = `${this.type}-${member.user.username}`
        if (!channelOptions.type) channelOptions.type = ChannelType.GuildText
        const allowed = this.bot.permissions.getPermissionRoles(member.guild.id, this.permissions).concat(member.id)
        channelOptions.permissionOverwrites = [ 
            { id: member.guild.roles.everyone.id, deny: CHANNEL_PERMISSIONS },
            ...(allowed.map(id => ({ id, allow: CHANNEL_PERMISSIONS }))),
            ...(channelOptions.permissionOverwrites ?? []) 
        ]
        return member.guild.channels.create(channelOptions);
    }

    async fetchTicket(channel_id) {
        const ticket = await this.database.tickets.sqlFind({ channel_id, type: { name: this.type } })
        return ticket;
    } 

    getTicket(channel_id) {
        const ticket = this.database.tickets.cache.find({ channel_id, type: { name: this.type } })
        return ticket;
    } 

    /** @param {Message} message */
    async onMessageCreate(message) {
        const ticket = this.getTicket(message.channel.id) || this.getTicket(message.channel?.parent?.id)
        if (!ticket) return false;

        if (message.author.id === this.bot.user?.id) return false;
        if (!message.content && message.attachments.size === 0) return false;
        if (!message.content) message.content = "";
        
        await this.transcriber.transcribe(ticket.id_ticket, message)
            .catch(error => console.error(`Unable to log ticket message because of ${error}!`, ticket.id_ticket, message.id))
    }

    async onMessageUpdate(oldMessage, newMessage) {
        const changed = (oldMessage.content != newMessage.content)
        if (changed) return this.onMessageCreate(newMessage);
    }

    async onMessageDelete(message) {
        this.cancelCloseTimeout(message.id)
        if (this.transcriber) {
            const ticket = this.getTicket(message.channel.id)
            if (!ticket) return false;
    
            await this.database.ticketMessages.update({ id_ticket: ticket.id_ticket, message_id: message.id }, { deleted: Math.round(Date.now() / 1000) })
                .catch(error => console.error(`Unable to log ticket message deletion because of ${error}!`, ticket.id_ticket, message.id))
        }
    }

    async onMessageDeleteBulk(messages) {
        await Promise.all(messages.map(msg => this.onMessageDelete(msg)))
    }

    buildTicketSelectStatement(guild_id, user_id) {
        return { guild_id, user_id, type: { name: this.type } };
    }

    /**
     * @param {import("../lib/discord-bot/permissions").PermissibleUser} user 
     */
    async verifyTicketRequest(user, guild_id) {

        if (this.blackListedPosition) {
            const blacklisted = user.hasPosition(this.blackListedPosition)
            if (blacklisted) throw new LocalizedError("tickets.blacklisted", blacklisted?.getDuration?.());
        }

        const ticketSelect = this.buildTicketSelectStatement(guild_id, user.id)
        const existing = await this.database.tickets.sqlFetch(
            SQLStatementCreator.AND(ticketSelect, SQLStatementCreator.NOT({ status: { name: "deleted" } }))
        )

        existing
            .filter(ticket => !this.ticketShouldExist(ticket))
            .forEach(ticket => this.closeTicket(ticket, null, this.bot.user, CLOSE_REASONS.ChannelMissing).catch(console.error))

        const stillExisting = existing.find(ticket => this.ticketShouldExist(ticket))
        if (stillExisting) throw new LocalizedError("tickets.existing", `${stillExisting.channel}`);

        const previousTicket = await this.database.tickets.sqlFind(
            SQLStatementCreator.AND(ticketSelect, SQLStatementCreator.NOT({ deleted_at: null })), { order_by: "deleted_at DESC" }
        )
        if (previousTicket && this.cooldown && (Date.now()/1000 - previousTicket.deleted_at) < this.cooldown)
            throw new LocalizedError("tickets.cooldown", previousTicket.deleted_at + this.cooldown);

        return true;

    }

    /** @param {GuildChannel} channel */
    async onChannelDelete(channel) {
        if (this.statusChannels.get(channel.guild.id)?.id === channel.id) {
            this.statusChannels.remove(channel.guild.id)
        }

        const ticket = await this.database.tickets.sqlFind({ channel_id: channel.id, type: { name: this.type } }).catch(console.error)
        if (ticket) {
            if (channel.executor) await this.closeTicket(ticket, channel.executor, channel.executor, CLOSE_REASONS.ChannelDeletedAudited).catch(console.error)
            else await this.closeTicket(ticket, null, this.bot.user, CLOSE_REASONS.ChannelDeletedUnaudited).catch(console.error)
        }
    }

    /** @param {Ticket} ticket */
    async closeTicket(ticket, ticketCloser, executor, content, reason) {
        this.cancelCloseTimeout(ticket.id_ticket)
        await this.closeBuffer.run(ticket, ticketCloser, executor, content, reason)
    }

    /** 
     * @protected
     * @param {Ticket} ticket
     */
    async _closeTicket(ticket, ticketCloser, executor, content, reason) {

        this.cancelCloseTimeout(ticket.id_ticket)
        const oldStatus = ticket.status?.name
        if (oldStatus !== 'deleted') {

            ticket.setStatus('deleted')
            try {
                if (this.transcriber) {
                    if (reason) content += `\nReason: ${reason}`
                    if (content && executor)
                        await this.transcriber.createMessage(ticket.id_ticket, "CLOSE", executor, `*${content}*`)
                    if (reason && ticketCloser)
                        await this.transcriber.createMessage(ticket.id_ticket, "_CLOSE_REASON", ticketCloser, reason)
                    else if (content && executor)
                        await this.transcriber.createMessage(ticket.id_ticket, "_CLOSE_REASON", executor, content)
                }
                
                ticket.setCloser(ticketCloser)
                this.database.ipc.notify('ticket_deleted', { guild_id: ticket.guild_id, ticket, executor: UserProfile.fromUser(executor) })
                if (this.transcriber && ticket.discordGuild) await this.transcriber.send(ticket.discordGuild, ticket)
            }catch (error) {
                ticket.setStatus(oldStatus)
                throw error;
            }

            await this.database.tickets.update(ticket, { 
                status: { name: "deleted" }, 
                deleted_at: Math.floor(Date.now()/1000), 
                closer_id: ticketCloser.id ?? null
            })
        }

        if (ticket.channel) await ticket.channel.delete().catch(() => null)

    }

    /** @param {import("discord.js").PartialGuildMember} member */
    async onMemberRemove(member) {
        const tickets = this.database.tickets.cache.get({ user_id: member.id, type: { name: this.type } })
        await Promise.allSettled(tickets.map(
            ticket => this.closeTicket(ticket, this.bot.user, this.bot.user, CLOSE_REASONS.CreatorLeft)
                .catch(error => console.error(`Error while automatically closing ticket ${ticket.id_ticket}!`, error))
        ))
    }

}

module.exports = TicketManager;