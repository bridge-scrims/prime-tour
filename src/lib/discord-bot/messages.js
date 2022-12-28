const LocalizedError = require('../tools/localized_error');
const { MessageOptions } = require('discord.js');
const fs = require('fs/promises');
const path = require('path');

const ASSETS = path.join('src', 'assets');

/**
 * @callback MessageBuilder
 * @argument {import('./types').GuildProfileMember} member
 * @returns {Promise<MessageOptions>|MessageOptions>}
 */

class BotMessagesContainer {

    constructor() {

        /** @type {Object.<string, MessageBuilder>} */
        this.messageBuilders = {}

        /** @type {Object.<string, {payload: MessageOptions, permissions?: import("./types").ScrimsPermissions}>} */
        this.messages = {}

    }

    async load() {
        this.messages = await fs.readFile(path.join(ASSETS, "messages.json"), { encoding: 'utf8' }).catch(error => {
            if (!error?.errno === -4058) throw error;
        }).then(v => JSON.parse(v))
    }

    /**
     * @param {string} id 
     * @param {MessageBuilder} builder 
     */
    addBuilder(id, builder) {
        this.messageBuilders[id] = builder
    }

    /**
     * @param {import('./permissions').PermissibleMember} member
     */
    async getIdentifiers(member) {
        const idsFromBuilders = await Promise.all(Object.entries(this.messageBuilders).map(([id, builder]) => this.__callBuilder(builder, member, id)))
        const idsFromFile = Object.entries(this.messages).filter(([_, message]) => member.hasPermission(message.permissions ?? {})).map(([k, _]) => k)
        return idsFromFile.concat(idsFromBuilders).filter(v => v);
    }

    /** @private */
    async __callBuilder(builder, member, passthrough) {
        try {
            await builder(member)
        }catch {
            return null;
        }
        return passthrough;
    }

    /**
     * @param {string} id 
     * @param {import('./permissions').PermissibleMember} member
     */
    async get(id, member) {
        if (id in this.messageBuilders) return this.messageBuilders[id](member);
        if (id in this.messages) {
            if (!member.hasPermission(this.messages[id].permissions ?? {})) throw new LocalizedError("missing_message_permissions");
            return this.messages[id].payload;
        }
        return null;
    }

}

module.exports = BotMessagesContainer;