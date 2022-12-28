const ScrimsGameParticipantCollection = require("./collections/game_participants")
const ScrimsGameParticipant = require("./game_participant")
const I18n = require("../tools/internationalization")
const TableRow = require("../postgresql/row")
const ScrimsType = require("./type")

class ScrimsGame extends TableRow {

    constructor(client, gameData) {

        super(client, gameData)

        /** @type {number} */
        this.id_game

        /** @type {number} */
        this.id_type

    }

    /** @override */
    isCacheExpired(now) {
        return ((this.id_game + 30*24*60*60) < now) && (!now || super.isCacheExpired(now));
    }

    get started_at() {
        if (!this.id_game) return undefined;
        return Math.floor(this.id_game/1000);
    }

    /**
     * @param {number} [id] If falsely will use the current timestamp.
     */
    setId(id) {
        this.id_game = id ?? Date.now()
        return this
    }

    /**
     * @param {string|ScrimsType} typeResolvable 
     */
    setType(typeResolvable) {
        if (typeof typeResolvable === "string") typeResolvable = { name: typeResolvable }
        this._setForeignObjectKeys(this.client.gameTypes, ['id_type'], ['id_type'], typeResolvable)
        return this
    }   

    get type() {
        return this.client.gameTypes.cache.find(this.id_type);
    }

    async fetchParticipants() {
        return (new ScrimsGameParticipantCollection(this)).fetch();
    }

    /**
     * @param {ScrimsGameParticipant[]|Object.<string, ScrimsGameParticipant[]>|ScrimsGameParticipantCollection} [participants] 
     */
    getParticipants(participants) {
        if (participants instanceof ScrimsGameParticipantCollection) return participants;
        return (new ScrimsGameParticipantCollection(this)).set(participants);
    }

    readParticipants() {
        return (new ScrimsGameParticipantCollection(this)).read();
    }

    /** 
     * @override
     * @param {Object.<string, any>} gameData 
     */
    update(gameData) {   
        super.update(gameData)
        this.setType(gameData.type)
        return this
    }

    /**
     * @param {I18n} i18n
     * @param {ScrimsGameParticipant[]|Object.<string, ScrimsGameParticipant[]>|ScrimsGameParticipantCollection} [participants]
     * @returns {import("discord.js").EmbedField}
     */
    toEmbedField(i18n, participants) {
        return {
            name: `<t:${this.started_at}:R>`,
            inline: true,
            value: Object.values(this.getParticipants(participants).getTeams())
                .map(v => v.map(u => `${u.user}`).join(" ")).join(`\n**══ ${i18n.get("vs")} ══**\n`) || i18n.get("games.no_participants")
        }
    }

}

module.exports = ScrimsGame