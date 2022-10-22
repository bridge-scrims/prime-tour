const TicketMessageAttachment = require("../lib/scrims/ticket_message_attachment");
const { EmbedBuilder, Message, AttachmentBuilder, Guild } = require("discord.js");
const ScrimsTicketMessage = require("../lib/scrims/ticket_message");
const TicketMessage = require("../lib/scrims/ticket_message");
const DBAttachment = require("../lib/scrims/attachment");
const TextUtil = require("../lib/tools/text_util");
const Ticket = require("../lib/scrims/ticket");

/**
 * @typedef TicketTranscriberOptions
 * @property {boolean} [dmUsers]
 */

class TicketTranscriber {

    /**
     * @param {import("../../postgresql/database")} database 
     * @param {TicketTranscriberOptions}
     */
    constructor(database, { dmUsers } = {}) {

        Object.defineProperty(this, "client", { value: database })

        /** 
         * @readonly
         * @type {import("../lib/postgresql/database")} 
         */
        this.client 

        this.dmUsers = dmUsers ?? false

    }
    
    async transcribe(ticketId, message) {

        if (!this.client.ticketMessages) return;
        if (message instanceof Message) {
            message.mentions.users.forEach(mentionedUser => message.content = message.content.replaceAll(`<@${mentionedUser.id}>`, `@${mentionedUser.tag}`))
            
            const notAddedAttachments = message.attachments.filter(value => !this.client.attachments.cache.find({ attachment_id: value.id }))
            if (this.client.bot) await Promise.allSettled(notAddedAttachments.map(v => this.client.bot.lockAttachment(v.url)))
            await Promise.all(
                notAddedAttachments.map(value => this.client.attachments.create(DBAttachment.fromMessageAttachment(this.client, value)).catch(console.error))
            )

            await Promise.all(
                message.attachments.filter(value => !this.client.ticketMessageAttachments.cache.find({ id_ticket: ticketId, attachment_id: value.id }))
                    .map(value => (
                        this.client.ticketMessageAttachments.create(
                            new TicketMessageAttachment(this.client)
                                .setTicket(ticketId).setMessage(message).setAttachment(value)
                        ).catch(console.error)
                    ))
            )

            if (!message.content && message.embeds?.length === 1) {
                message.content = message.embeds[0]?.title || message.embeds[0]?.author?.name || ''
            }
        }

        await this.client.ticketMessages.create(
            new TicketMessage(this.client)
                .setTicket(ticketId).setMessage(message).setContent(message.content)
                .setReferenceId(message?.reference?.messageId ?? null)
                .setAuthor(message.author).setCreatedPoint()
        )

    }

    async createMessage(ticketId, messageId, author, content) {
        await this.client.ticketMessages.create(
            new TicketMessage(this.client)
                .setTicket(ticketId).setMessage(messageId).setContent(content)
                .setAuthor(author).setCreatedPoint()
        )
    }

    /** @param {string} text */
    translateFormating(text) {
        const replace = (discord, html) => {
            Array.from(text.matchAll(new RegExp(`${discord}(.+?)${discord}`, "g")))
                .forEach(([m, c]) => text = text.replace(m, `<${html}>${c}</${html}>`))
        }
        replace("```", "p")
        replace("\\*\\*", "b")
        replace("\\*", "i")
        return text;
    }

    /**
     * @param {Ticket} ticket 
     * @param {TicketMessage[]} ticketMessages 
     */
    getHTMLContent(ticket, ticketMessages) {
        // Prevent html injections by using HTML Symbol Entities for '<' and '>' (VERY IMPORTANT)
        const escape = (value) => value?.replaceAll("<", "&lt;")?.replaceAll(">", "&gt;");

        const title = escape(`${ticket.type?.titleName ?? ticket.id_type} Ticket Transcript`)
        const previewMessage = ticketMessages.find(v => v.message_id.endsWith("PREVIEW"))
        const closeMessage = ticketMessages.find(v => v.message_id.endsWith("CLOSE_REASON"))
        const closeReason = (closeMessage ? ` (${(closeMessage?.edits?.slice(-1)?.[0] ?? closeMessage).content})` : "")
        
        // Removes hidded messages (messages that should not be shown as messages)
        ticketMessages = ticketMessages.filter(v => !v.message_id.startsWith("_"))
        
        const previewContent = (
            `<!--` + escape(
                `\n»»———————  ${title}  ———————««`
                + `\n• Created by: ${ticket.userProfile?.tag ?? ticket.user?.tag ?? ticket.user_id} (${new Date(ticket.created_at*1000).toDateString()})`
                + (previewMessage ? `\n• ${previewMessage.author?.tag} | ${(previewMessage?.edits?.slice(-1)?.[0] ?? previewMessage).content}` : "")
                + `\n• Closed by: ${ticket.closerProfile?.tag || ticket.closer?.tag || ticket.closer_id || this.client.bot?.user?.tag || 'Unknown Closer'}${closeReason}`
                + `\n• Duration: ${TextUtil.stringifyTimeDelta(Date.now()/1000 - ticket.created_at, true)}`
                + `\n• Total Messages: ${ticketMessages.length}`
            ) + `\n-->`
        )   

        const getMessageExtra = (message) => message.edits ? `<div class="extra edited">(edited)</div>` : (message.deleted ? `<div class="extra deleted">(deleted)</div>` : ``)
        const getMessageAttachments = (message) => message.attachments.length > 0 ? `<div class="attachment">\nAttachments: ${message.attachments.map(attachment => `<a href="${escape(attachment.url)}" target="_blank" rel="noopener noreferrer">${escape(attachment.filename) ?? escape(attachment.discord_id)}</a>`).join(' | ')}</div>` : '';

        // Will make everything look pretty
        const style = (
            `body{ margin: 20px; }`
            + `p{ margin-bottom: 0.5rem; }`
            + `.extra{ font-size: 10px }`
            + `.attachment{ font-size: 13px }`
            + `.deleted{ color: #FF0000 }`
            + `.edited{ color: #909090 }`
            + `.table{ width: auto; }`
            + `th{ background: #A14F50; color: #FFFFFF }`
            + `td{ white-space: nowrap; }`
            + `td.last{ white-space: pre-wrap; width: 100%; }`
            + `h1{ color: #A14F50; margin-bottom: 16px; }`
        )

        // Adds all the data dynamically using the browsers timezone
        const script = (
            `$( document ).ready(() => onReady());`
            + `function onReady() { `
                + `const tableBody = $("#transcript-table-body");`
                + `const clientOptions = Intl.DateTimeFormat().resolvedOptions();`
                + `function getDate(timestamp) { return (new Date(timestamp*1000)).toLocaleString(clientOptions.locale, { timeZone: clientOptions.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }) };`
                + `function getTime(timestamp) { return (new Date(timestamp*1000)).toLocaleString(clientOptions.locale, { timeZone: clientOptions.timeZone, hour: "numeric", minute: "numeric" }) };`
                + `function insertMessage(creation, author, message) { `
                    + `tableBody.append(\``
                        + `<tr>`
                            + `<td>\${getDate(creation)}</td>`
                            + `<td>\${getTime(creation)}</td>`
                            + `<td>\${author}</td>`
                            + `<td class="last">\${message}</td>`
                        + `</tr>` 
                    + `\`);`
                + ` }\n`
                + ticketMessages.map(
                    message => (
                        `insertMessage(`
                            + `${message.created_at}, \`${(message.authorProfile?.tag ?? message.author?.tag ?? message.author_id).replaceAll("`", "")}\`, `
                            + `\`${(this.translateFormating(escape((message?.edits?.slice(-1)?.[0] ?? message).content).replaceAll('\n', '\\n')).replaceAll("`", "\\`"))}${getMessageAttachments(message)}${getMessageExtra(message)}\``
                        + `);`
                    )
                ).join("\n")
            + `\n}`
        )

        // Includes bootstrap & jquery bcs noice
        const head = (
            `<meta charset="UTF-8">`
            + `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.0.0/dist/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">`
            + `<script src="https://code.jquery.com/jquery-3.2.1.slim.min.js" integrity="sha384-KJ3o2DKtIkvYIK3UENzmM7KCkRr/rE9/Qpg6aAZGJwFDMVNA/GpGFF93hXpG5KkN" crossorigin="anonymous"></script>`
            + `<script src="https://cdn.jsdelivr.net/npm/popper.js@1.12.9/dist/umd/popper.min.js" integrity="sha384-ApNbgh9B+Y1QKtv3Rn7W3mgPxhU9K/ScQsAP7hUibX39j7fakFPskvXusvfa0b4Q" crossorigin="anonymous"></script>`
            + `<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.0.0/dist/js/bootstrap.min.js" integrity="sha384-JZR6Spejh4U02d8jOt6vLEHfe/JQGiRRSQQxSfFWpi1MquVdAyjUar5+76PVCmYl" crossorigin="anonymous"></script>`
            + `<title>${title}</title>`
            + `<script>${script}</script>`
            + `<style>${style}</style>`
        )

        // Create a template to insert all the data into
        const body = (
            `<h1>${title}</h1>`
            + `<table class="table table-striped">`
                + `<thead>`
                    + `<tr>`
                        + `<th scope="col">Date</th>`
                        + `<th scope="col">Time</th>`
                        + `<th scope="col">Author</th>`
                        + `<th scope="col">Message Content</th>`
                    + `</tr>`
                + `</thead>`
                + `<tbody id="transcript-table-body"></tbody>`
            + `</table>`
        )

        // Wrap everything together and return it
        return (
            `<!DOCTYPE html>${previewContent}`
                + `<html>`
                    + `<head>${head}</head>`
                    + `<body>${body}</body>`
                + `</html>`
        );
    }

    /** @param {Ticket} ticket */
    async getTicketMessages(ticket) {
        const messageAttachments = this.client.ticketMessageAttachments?.fetchArrayMap({ id_ticket: ticket.id_ticket }, ['message_id']) ?? {}
        const allMessages = await this.client.ticketMessages?.sqlFetch({ id_ticket: ticket.id_ticket }) ?? []
        await this.generateMessages(ticket, allMessages.map(v => v.message_id)).then(v => allMessages.push(...v))
        if (ticket.discordGuild) allMessages.forEach(m => m.content = this.parseMentions(ticket.discordGuild, m.content))
        allMessages.sort((a, b) => a.created_at - b.created_at).forEach((v, idx, arr) => {
            const existing = arr.filter(msg => msg.message_id === v.message_id)[0]
            if (existing && existing !== v) {
                existing.edits = [ ...(existing.edits ?? []), v ]
                delete allMessages[idx]
            }
        })
        allMessages.forEach(msg => msg.attachments = (messageAttachments[msg.message_id] ?? []).map(value => value.attachment))
        return allMessages.sort((a, b) => a.created_at - b.created_at).filter(v => v);
    }

    /**
     * @param {Guild} guild
     * @param {string} content 
     */
    parseMentions(guild, content) {
        const resolveReplace = (m, id, manager, replacer) => {
            const resolved = manager.resolve(id)
            if (resolved) content = content.replace(m, replacer(resolved))
        }
        Array.from(content.matchAll(/<@(\d+)>/g)).forEach(([m, id]) => resolveReplace(m, id, guild.client.users, v => `@${v.tag}`))
        Array.from(content.matchAll(/<#(\d+)>/g)).forEach(([m, id]) => resolveReplace(m, id, guild.client.channels, v => `#${v.name}`))
        Array.from(content.matchAll(/<@&(\d+)>/g)).forEach(([m, id]) => resolveReplace(m, id, guild.roles, v => `@&${v.name}`))
        return content;
    }   

    /**
     * @param {Ticket} ticket 
     * @param {string[]} existing 
     */
    async generateMessages(ticket, existing) {
        const generated = []
        try {
            const channel = await ticket.fetchChannel()
            for await (const messages of channel.client.multiFetch(channel.messages)) {
                messages.filter(v => !(existing.includes(v.id))).forEach(msg => generated.push(ScrimsTicketMessage.fromMessage(msg).setTicket(ticket)))
            }
        }catch {
            return generated;
        }
        return generated;  
    }

    /** @param {Ticket} ticket */
    getUserMessageEmbed(ticket) {
        return new EmbedBuilder()
            .setColor(ticket.COLORS.ScrimsRed)
            .setTitle(`${ticket.type?.titleName} Ticket Transcript`)
            .setDescription(
                `Your ${ticket.type?.name} ticket from <t:${ticket.created_at}:f> was closed. `
                + `Attached to this message you will find the message log of your ${ticket.type?.name} channel. `
                + `Hopefully we were able to help you. Have a nice day :cat2:`
            ).setFooter({ text: ticket.discordGuild?.name, iconURL: ticket.discordGuild?.iconURL({ dynamic: true }) })
    }

    /** @param {Ticket} ticket */
    getLogMessageEmbed(ticket) {
        return new EmbedBuilder()
            .setColor(ticket.COLORS.White)
            .setTitle(`${ticket.type?.titleName} Ticket Transcript`)
            .setDescription(`**ID:** ${ticket.id_ticket}`)
            .addFields(
                { name: "Created By", value: `${ticket.user || ticket.user_id}`, inline: true },
                { name: "Closed By", value: `${ticket.closer || ticket.closer_id || this.client.bot?.user || 'Unknown User'}`, inline: true },
                { name: "Duration", value: `${TextUtil.stringifyTimeDelta(Date.now()/1000 - ticket.created_at)}`, inline: true }
            ).setFooter({ text: ticket.discordGuild?.name, iconURL: ticket.discordGuild?.iconURL({ dynamic: true }) })
    }

    /** 
     * @param {Guild} guild 
     * @param {Ticket} ticket 
     */
    async send(guild, ticket) {
        const ticketMessages = await this.getTicketMessages(ticket)
        const transcriptContent = this.getHTMLContent(ticket, ticketMessages)

        const buff = Buffer.from(transcriptContent, "utf-8");
        const file = new AttachmentBuilder(buff, { 
            name: `${ticket.type?.titleName}_Transcript_${ticket.id_ticket.replace(/-/g, '')}.html`, 
            description: `The ticket transcript of a ${guild.name} ${ticket.type?.titleName} Ticket.` 
        });

        const channelId = this.client.guildEntrys.cache.find({ guild_id: guild.id, type: { name: `tickets_${ticket.type?.name}_transcript_channel` } })?.value
        if (channelId) {
            const channel = await guild.channels.fetch(channelId).catch(() => null)
            if (channel) await channel?.send({ embeds: [this.getLogMessageEmbed(ticket)], files: [file] }).catch(console.error)
        }
        
        if (this.dmUsers && ticket.user_id) {
            const user = await guild.client.users.fetch(ticket.user_id).catch(() => null)
            if (user) await user.send({ embeds: [this.getUserMessageEmbed(ticket)], files: [file] }).catch(console.error)
        }
    }

}

module.exports = TicketTranscriber;