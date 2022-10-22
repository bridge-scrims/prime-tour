const { Attachment } = require("discord.js");
const TableRow = require("../postgresql/row");

const ScrimsAttachment = require("./attachment");
const ScrimsTicket = require("./ticket");

class ScrimsTicketMessageAttachment extends TableRow {

    constructor(client, messageAttachmentData) {

        super(client, messageAttachmentData)

        /** @type {string} */
        this.id_ticket

        /** @type {string} */
        this.message_id

        /** @type {string} */
        this.attachment_id


    }

    isCacheExpired(now) {
        return (!this.ticket || this.ticket.status.name === "deleted") && (!now || super.isCacheExpired(now));
    }

    /**
     * @param {string|Object.<string, any>|ScrimsTicket} ticketResolvable 
     */
    setTicket(ticketResolvable) {
        this._setForeignObjectKeys(this.client.tickets, ['id_ticket'], ['id_ticket'], ticketResolvable)
        return this;
    }

    get ticket() {
        return this.client.tickets.cache.find(this.id_ticket);
    }

    /**
     * @param {string} message_id 
     */
    setMessageId(message_id) {
        this.message_id = message_id
        return this;
    }

    /** @param {import("discord.js").MessageResolvable} */
    setMessage(messageResolvable) {
        this.message_id = messageResolvable?.id ?? messageResolvable
        return this;
    }

    get attachment() {
        return this.client.attachments.cache.find(this.attachment_id);
    }

    /**
     * @param {string|Object.<string, any>|ScrimsAttachment|Attachment} attachmentResolvable 
     */
    setAttachment(attachmentResolvable) {
        if (attachmentResolvable instanceof Attachment) attachmentResolvable = attachmentResolvable.id
        this._setForeignObjectKeys(this.client.attachments, ['attachment_id'], ['attachment_id'], attachmentResolvable)
        return this;
    }

    get attachmentURL() {
        return this.attachment?.url;
    }

    get discordGuild() {
        if (!this.ticket?.discordGuild) return null;
        return this.ticket.discordGuild;
    }

    get guild_id() {
        if (!this.ticket?.guild_id) return null;
        return this.ticket.guild_id;
    }

    get channel() {
        if (!this.ticket?.channel) return null;
        return this.ticket.channel;
    }

    get message() {
        if (!this.channel || !this.message_id) return null;
        return this.channel.messages.resolve(this.message_id);
    }

    /** 
     * @override
     * @param {Object.<string, any>} messageAttachmentData 
     */
    update(messageAttachmentData) {
        super.update(messageAttachmentData)
        this.setTicket(messageAttachmentData.ticket)
        this.setAttachment(messageAttachmentData.attachment)
        return this;
    }

}

module.exports = ScrimsTicketMessageAttachment;