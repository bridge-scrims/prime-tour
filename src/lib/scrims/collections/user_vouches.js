const I18n = require('../../tools/internationalization');
const LocalizedError = require('../../tools/localized_error');
const MessageOptionsBuilder = require('../../tools/payload_builder');
const ScrimsMessageBuilder = require('../../tools/responses');
const UserProfile = require('../user_profile');
const ScrimsPosition = require('../position');

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
            const pos = this.client.positions.cache.find(ScrimsPosition.resolve(positionResolvable))
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
        return this.vouches.length;
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
        return this.get().filter(v => v.isPositive());
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
     * @param {boolean} exposed
     * @param {string} [guildId]
     */
    toMessage(i18n, exposed, guildId) {
        const vouches = (exposed ? this.getCovered() : this.getExposed())
        if (this.getExpired().length > 0) vouches.push(i18n.getObject("vouches.expired", this.getExpired().length))

        if (vouches.length === 0) return new MessageOptionsBuilder(
            new LocalizedError("vouches.none", `${this.user}`, this.position?.name).toMessagePayload(i18n)
        );
 
        const color = ScrimsMessageBuilder.hsv2rgb(((120 / this.getExposed().length) * this.getPositive().length) || 0, 1, 1)
        const councilRole = this.position?.getCouncil()?.getConnectedRoles(guildId)?.[0]
        const getField = (v) => v?.toEmbedField?.(i18n, councilRole) ?? v
        return new MessageOptionsBuilder()
            .createMultipleEmbeds(vouches, (vouches) => (
                i18n.getEmbed("vouches.embed_summary", { title: [this.position?.titleName] })
                    .setFields(...vouches.map(getField))
                    .setAuthor({ iconURL: this.user.avatarURL(), name: `${this.user.tag} (${this.userId})` })
                    .setColor(color)
            ))
    }

}

module.exports = ScrimsUserPositionVouchCollection