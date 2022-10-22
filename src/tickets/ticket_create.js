const { EmbedBuilder } = require("discord.js");

const ExchangeHandler = require("../lib/discord-bot/interaction-handlers/exchange");
const SequencedAsyncFunction = require("../lib/tools/sequenced_async");
const MessageOptionsBuilder = require("../lib/tools/payload_builder");
const Ticket = require("../lib/scrims/ticket");
const TicketManager = require("./tickets");

class TicketCreateHandler extends ExchangeHandler {

    /**
     * @param {string} title
     * @param {TicketManager} ticketManager
     * @param {ExchangeHandler.EphemeralExchangeInputField}
     */
    constructor(title, ticketManager, fields) {

        super(
            title, title, fields,
            (...args) => this.getExchangeReponse(...args),
            (...args) => this.verifyCreation(...args),
            (...args) => this.createTicket(...args)
        )

        /** @type {TicketManager} */
        this.tickets = ticketManager

        /** @readonly */
        this.createTicket = SequencedAsyncFunction((...args) => this._createTicket(...args))

    }

    /** @param {ExchangeHandler.RecallExchangeInteraction} interaction */
    async verifyCreation(interaction) {
        await this.tickets.verifyTicketRequest(interaction.user, interaction.guildId)
        return true;
    }

    /**
     * @protected
     * @param {ExchangeHandler.RecallExchangeInteraction} interaction 
     */
    async _createTicket(interaction) {
        await this.verifyCreation(interaction)
        const channel = await this.createTicketChannel(interaction)
        try {
            const ticket = await interaction.database.tickets.create(
                new Ticket(interaction.database)
                    .setUser(interaction.user)
                    .setType(this.tickets.type)
                    .setGuild(interaction.guild)
                    .setStatus("open")
                    .setChannel(channel)
            )

            const messages = await this.buildTicketMessages(interaction)
            await Promise.all(messages.map(m => channel.send(m)))    

            if (this.tickets.transcriber) 
                await this.tickets.transcriber.createMessage(
                    ticket.id_ticket, interaction.id, interaction.user, 
                    `Created a ${ticket.type.titleName}: \n${interaction.state.getEmbedFields().map(v => `\n***${v.name}***\n${v.value}`).join("")}`
                ).catch(console.error)
        }catch (error) {
            await channel.delete().catch(console.error)
            throw error;
        }
    }

    /**
     * @param {ExchangeHandler.RecallExchangeInteraction} interaction 
     */
    async buildTicketMessages(interaction) {
        return [
            new MessageOptionsBuilder()
                .addEmbeds(
                    new EmbedBuilder()
                        .setDescription(`👋 **Welcome** ${interaction.user} to your ${this.tickets.type} ticket channel.`)
                        .setFields(interaction.state.getEmbedFields())
                        .setTitle(`Ticket Channel`)
                        .setColor('#FFFFFF')
                )
        ]
    }

    /**
     * @param {EmbedBuilder} embed 
     * @param {ExchangeHandler.RecallExchangeInteraction} interaction
     */
    getExchangeReponse(embed, interaction) {
        if (interaction.state.index === -1) 
            return new MessageOptionsBuilder().setContent(`Creation process was forcibly aborted.`)
        return new MessageOptionsBuilder().addEmbeds(
            embed.setTitle(`Ticket Create Confirmation`).setColor("#FFFFFF")
        );
    }

    /** 
     * @param {ExchangeHandler.RecallExchangeInteraction} interaction
     * @param {import("discord.js").GuildChannelCreateOptions} [channelOptions]
     */
    async createTicketChannel(interaction, channelOptions) {
        return this.tickets.createChannel(interaction.member, { parent: interaction.channel?.parentId, ...channelOptions })
    }

}

module.exports = TicketCreateHandler