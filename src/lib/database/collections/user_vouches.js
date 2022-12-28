const { SelectMenuBuilder } = require('discord.js');

const MessageOptionsBuilder = require('../../tools/payload_builder');
const LocalizedError = require('../../tools/localized_error');
const ScrimsMessageBuilder = require('../../tools/responses');
const I18n = require('../../tools/internationalization');
const TextUtil = require('../../tools/text_util');

const UserProfile = require('../user_profile');
const Position = require('../position');


class ScrimsUserPositionVouchCollection {

    constructor(database, userId, positionResolvable) {

        Object.defineProperty(this, "client", { value: database })

        /** 
         * @readonly
         * @protected
         * @type {import('../../postgresql/database')} 
         */
        this.client

        /** 
         * @readonly
         * @type {string} 
         */
        this.userId = userId
        
        /** 
         * @protected
         * @type {import('../vouch')[]} 
         */
        this.vouches

        /** 
         * @readonly
         * @type {?number} 
         */
        this.id_position = null

        if (positionResolvable) {
            const pos = this.client.positions.cache.find(Position.resolve(positionResolvable))
            if (pos) this.id_position = pos.id_position
        }

    }

    get user() {
        const profile = this.client.users.cache.find(this.userId)
        return profile || UserProfile.resolve(this.bot.users.resolve(this.userId));
    }

    get bot() {
        return this.client.bot;
    }

    get position() {
        return this.client.positions.cache.find(this.id_position);
    }

    get size() {
        return this.get().length;
    }

    get ovw() {
        return this.get().reduce((pv, cv) => pv + cv.worth, 0) 
    }

    get() {
        return this.vouches.filter(v => !v.isExpired());
    }

    getExpired() {
        return this.vouches.filter(v => v.executor_id && v.isPositive() && v.isExpired());
    }

    getExposed() {
        return this.get().filter(v => !v.executor_id || v.isPositive());
    }

    getPositive() {
        return this.get().filter(v => v.executor_id && v.isPositive());
    }

    getNegative() {
        return this.get().filter(v => v.executor_id && !v.isPositive());
    }

    getCovered() {
        const exposed = this.getExposed()
        return this.get().filter(v => !exposed.includes(v))
    }

    /**
     * @param {import('../vouch')[]|Object.<string, import('../vouch')[]>} [vouches] 
     */
    set(vouches) {
        if (vouches instanceof Array) vouches = vouches.filter(v => v.user_id === this.userId);
        else vouches = (vouches?.[this.userId] ?? []);

        this.vouches = vouches.filter(v => v.id_position === this.id_position).sort((a, b) => b.given_at - a.given_at)
        return this;
    }

    getSelector() {
        return { user_id: this.userId, id_position: this.id_position }
    }

    read() {
        return this.set(this.client.vouches.cache.get(this.getSelector()));
    }

    async fetch() {
        return this.set(await this.client.vouches.sqlFetch(this.getSelector()));
    }

    /**
     * @param {I18n} i18n 
     * @param {'covered' | 'exposed' | 'all'} vouchTypes
     * @param {string} [guildId]
     * @param {boolean} withIndex
     */
    toMessage(i18n, vouchTypes, guildId, withIndex = false) {
        const vouches = []
        if (vouchTypes === 'all') vouches.push(...this.vouches)
        if (vouchTypes === 'covered') vouches.push(...this.getCovered())
        if (vouchTypes === 'exposed') vouches.push(...this.getExposed())
        
        const color = ScrimsMessageBuilder.hsv2rgb(((120 / vouches.length) * vouches.filter(v => v.isPositive()).length) || 0, 1, 1)
        if (this.getExpired().length > 0 && vouchTypes === 'exposed') vouches.push(i18n.getObject("vouches.expired", this.getExpired().length))

        if (vouches.length === 0) return new MessageOptionsBuilder(
            new LocalizedError("vouches.none", `${this.user}`, this.position?.name).toMessagePayload(i18n)
        );
        
        const councilRole = this.position?.getCouncil()?.getConnectedRoles(guildId)?.[0]
        const getField = (v, i) => v?.toEmbedField?.(i18n, councilRole, (withIndex ? (i+1) : null)) ?? v
        return new MessageOptionsBuilder()
            .createMultipleEmbeds(vouches, (vouches) => (
                i18n.getEmbed("vouches.embed_summary", { title: [this.position?.titleName] })
                    .setFields(...vouches.map(getField))
                    .setAuthor({ iconURL: this.user.avatarURL(), name: `${this.user.tag} (${this.userId})` })
                    .setColor(color)
            ))
    }

    /**
     * @param {I18n} i18n 
     * @param {string} [guildId]
     */
    toRemoveMessage(i18n, guildId) {
        const message = this.toMessage(i18n, 'all', guildId, true)
        const options = this.vouches
            .map((v, i) => ({ label: TextUtil.limitText(v.asString(i18n, i+1).replace(/\*/g, ''), 100, '...'), value: v.id_vouch }))
        
        Array.from(new Array(Math.ceil(options.length/25)).keys())
            .map((_, i) => options.slice(i*25, (i+1)*25))
            .map((options, i) => new SelectMenuBuilder().setCustomId(`REMOVE_VOUCH/${this.userId}/${i}`).setPlaceholder('Select to Remove').addOptions(options))
            .slice(0, 5).forEach(v => message.addActions(v))
        return message;
    }

}

module.exports = ScrimsUserPositionVouchCollection;