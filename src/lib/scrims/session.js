const ScrimsSessionParticipant = require("./session_participant");
const MessageOptionsBuilder = require("../tools/payload_builder");
const I18n = require("../tools/internationalization");
const TextUtil = require("../tools/text_util");
const TableRow = require("../postgresql/row");
const ScrimsType = require("./type");
const { User } = require("discord.js");

class ScrimsSession extends TableRow {

    constructor(client, sessionData) {

        super(client, sessionData)

        /** @type {string} */
        this.id_session
        if (!this.id_session) this.setId()

        /** @type {number} */
        this.id_type

        /** @type {string} */
        this.creator_id

        /** @type {number} */
        this.started_at

        /** @type {number} */
        this.ended_at

    }

    /** @param {string} [id_session] if falsely will use a random uuid */
    setId(id_session) {
        this.id_session = id_session ?? this.client.generateUUID()
        return this;
    }

    get type() {
        return this.client.sessionTypes.cache.find(this.id_type);
    }

    /** @param {number|string|Object.<string, any>|ScrimsType} typeResolvable */
    setType(typeResolvable) {
        if (typeof typeResolvable === "string") typeResolvable = { name: typeResolvable }
        this._setForeignObjectKeys(this.client.sessionTypes, ['id_type'], ['id_type'], typeResolvable)
        return this;
    }

    get creatorProfile() {
        return this.client.users.cache.find(this.creator_id);
    }

    /** 
     * @param {string|import('./user_profile')|User} creator 
     */
    setCreator(creator) {
        this.creator_id = creator?.user_id ?? creator?.id ?? creator
        return this;
    }

    getCreatorMention(format=true) {
        if (!this.creatorProfile) return (format ? "*unknown*" : "unknown");
        return this.creatorProfile.getMention(...arguments);
    }

    /**
     * @param {number} [started_at] If undefined will use current timestamp 
     */
    setStartPoint(started_at) {
        this.started_at = started_at ?? Math.floor(Date.now()/1000)
        return this;
    }

    /**
     * @param {number} [ended_at] If undefined will use current timestamp 
     */
    setEndPoint(ended_at) {
        this.ended_at = ended_at ?? Math.floor(Date.now()/1000)
        return this;
    }

    /** 
     * @override
     * @param {Object.<string, any>} sessionData 
     */
    update(sessionData) {
        super.update(sessionData)
        this.setType(sessionData.type)
        return this;
    }

    getDuration() {
        if (!this.started_at || !this.ended_at) return `*unknown*`;
        return TextUtil.stringifyTimeDelta(this.ended_at - this.started_at);
    }

    getStart() {
        if (!this.started_at) return `*unknown*`;
        return `<t:${this.started_at}:f>`;
    }

    getEnd() {
        if (!this.ended_at) return `*unknown*`;
        return `<t:${this.ended_at}:f>`;
    }

    /**
     * @param {I18n} i18n
     */
    toEmbed(i18n) {
        return i18n.getEmbed(
            "sessions.summary", { 
                title: [this.type?.titleName ?? this.id_type], 
                description: [
                    this.id_session, `${this.creatorProfile}`, this.getStart(), 
                    this.getEnd(), this.getDuration() 
                ] 
            }
        ).setColor(this.COLORS.BasketBallOrange)
    }

    /**
     * @param {I18n} i18n 
     * @param {ScrimsSessionParticipant[]} participants 
     */
    toMessage(i18n, participants) {
        const participation = ((participants.length > 0) ? participants.map(p => p.toString()) : [i18n.get("sessions.no_participation")])
        return new MessageOptionsBuilder()
            .addEmbeds(
                this.toEmbed(i18n),
                i18n.getEmbed("sessions.participation")
                    .setDescription(TextUtil.reduceArray(participation, 3500))
                    .setColor(this.COLORS.NiceBlue)
            )
    }

    /**
     * @param {I18n} i18n 
     * @param {ScrimsSessionParticipant[]} participants 
     */
    getDetails(i18n, participants) {
        return i18n.get(
            "sessions.details", this.type?.titleName ?? this.id_type, `${this.creatorProfile}`, 
            this.getStart(), this.getDuration(), participants.length
        )
    }

}

module.exports = ScrimsSession;