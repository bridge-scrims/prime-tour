const { AuditLogEvent, Events, Client } = require("discord.js");
const EventEmitter = require("events");

class AuditedEventEmitter extends EventEmitter {

    constructor(bot) {
        super();

        Object.defineProperty(this, "bot", { value: bot })

        /** 
         * @readonly
         * @type {Client} 
         */
        this.bot

        this.__addListeners()
    }

    __addListeners() {
        this.bot.on(Events.GuildBanAdd, ban => this.onBanAdd(ban).catch(console.error))
        this.bot.on(Events.GuildBanRemove, ban => this.onBanRemove(ban).catch(console.error))
        this.bot.on(Events.MessageDelete, message => this.onMessageDelete(message).catch(console.error))
        this.bot.on(Events.ChannelDelete, channel => this.onChannelDelete(channel).catch(console.error))
        this.bot.on(Events.ChannelCreate, channel => this.onChannelCreate(channel).catch(console.error))
        this.bot.on(Events.GuildMemberUpdate, (oldMember, newMember) => this.onMemberUpdate(oldMember, newMember).catch(console.error))
    }

    async findExecutor(object, type, validater) {
        if (object.guild) {
            const fetchedLogs = await object.guild.fetchAuditLogs({ limit: 3, type })
                .catch(error => console.error(`Unable to fetch audit logs because of ${error}!`))
    
            if (fetchedLogs) {
                object.executor = fetchedLogs.entries
                    .filter(log => validater(object, log))
                    .sort((a, b) =>  b.createdTimestamp - a.createdTimestamp)
                    .first()?.executor ?? null
            }
        }
    }

    async onMemberUpdate(oldMember, newMember) {
        if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
            const validater = (member, log) => (member.id === log.target.id);
            await this.findExecutor(newMember, AuditLogEvent.MemberRoleUpdate, validater)
            this.emit("guildMemberRolesUpdate", oldMember, newMember, newMember.executor)
        }
    }

    async onBanAdd(ban) {
        const validater = (ban, log) => (ban?.user?.id === log.target.id);
        await this.findExecutor(ban, AuditLogEvent.MemberBanAdd, validater)
        this.emit(Events.GuildBanAdd, ban)
    }
    
    async onBanRemove(ban) {
        const validater = (ban, log) => (ban?.user?.id === log.target.id);
        await this.findExecutor(ban, AuditLogEvent.MemberBanRemove, validater)
        this.emit(Events.GuildBanRemove, ban)
    }
    
    async onMessageDelete(message) {
        const validater = (message, log) => ((message.partial || log.target.id == message.author.id) && (log.extra.channel.id == message.channelId))
        await this.findExecutor(message, AuditLogEvent.MessageDelete, validater)
        this.emit(Events.MessageDelete, message)
    }
    
    async onChannelDelete(channel) {
        const validater = (channel, log) => (channel.id === log.target.id);
        await this.findExecutor(channel, AuditLogEvent.ChannelDelete, validater)
        this.emit(Events.ChannelDelete, channel)
    }
    
    async onChannelCreate(channel) {
        const validater = (channel, log) => (channel.id === log.target.id);
        await this.findExecutor(channel, AuditLogEvent.ChannelCreate, validater)
        this.emit(Events.ChannelCreate, channel)
    }

}

module.exports = AuditedEventEmitter;