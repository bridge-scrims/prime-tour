const { User } = require("discord.js");
const TableRow = require("../postgresql/row");
const TextUtil = require("../tools/text_util");
const ScrimsSession = require("./session");

class ScrimsSessionParticipant extends TableRow {

    constructor(client, participantData) {

        super(client, participantData)

        /** @type {string} */
        this.id_session

        /** @type {string} */
        this.user_id

        /** @type {number} */
        this.joined_at

        /** @type {number} */
        this.participation_time

    }

    get session() {
        return this.client.sessions.cache.find(this.id_session);
    }

    /** @param {string|Object.<string, any>|ScrimsSession} sessionResolvable */
    setSession(sessionResolvable) {
        this._setForeignObjectKeys(this.client.sessions, ['id_session'], ['id_session'], sessionResolvable)
        return this;
    }

    get userProfile() {
        return this.client.users.cache.find(this.user_id);
    }

    /** 
     * @param {string|import('./user_profile')|User} user 
     */
    setUser(user) {
        this.user_id = user?.user_id ?? user?.id ?? user
        return this;
    }

    getUserMention(format=true) {
        if (!this.userProfile) return (format ? "*unknown*" : "unknown");
        return this.userProfile.getMention(...arguments);
    }

    /** @param {number} [joined_at] If undefined will use current timestamp */
    setJoinPoint(joined_at) {
        this.joined_at = (joined_at === undefined) ? Math.floor(Date.now()/1000) : joined_at
        return this;
    }

    /** @param {number} participation_time */
    setParticipationTime(participation_time) {
        this.participation_time = participation_time
        return this;
    }

    /** 
     * @override
     * @param {Object.<string, any>} participantData 
     */
    update(participantData) {
        super.update(participantData)
        this.setSession(participantData.session)
        return this;
    }

    toString() {
        return `• ${this.userProfile}**:**  ${TextUtil.stringifyTimeDelta(this.participation_time)}`
    }

}

module.exports = ScrimsSessionParticipant;