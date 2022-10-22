const TableRow = require("../postgresql/row");

const ScrimsGuild = require("./guild");
const ScrimsType = require("./type");

const NONE = 'None'

class ScrimsGuildEntry extends TableRow {

    constructor(client, entryData) {

        super(client, entryData);

        /** @type {string} */
        this.guild_id

        /** @type {number} */
        this.id_type

        /** @type {?string} */
        this.client_id
 
        /** @type {string} */
        this.value

    }

    get discordGuild() {
        if (!this.bot) return null;
        return this.bot.guilds.resolve(this.guild_id);
    }

    /** @param {?string} client_id */
    setClient(client_id) {
        this.client_id = client_id
        return this;
    }

    get guild() {
        return this.client.guilds.cache.find(this.guild_id);
    }

    /**
     * @param {string|Object.<string, any>|ScrimsGuild|import("discord.js").BaseGuild} guildResolvable 
     */
    setGuild(guildResolvable) {
        guildResolvable = guildResolvable?.id ?? guildResolvable
        this._setForeignObjectKeys(this.client.guilds, ['guild_id'], ['guild_id'], guildResolvable)
        return this;
    }

    get type() {
        return this.client.guildEntryTypes.cache.find(this.id_type);
    }

    /**
     * @param {number|string|Object.<string, any>|ScrimsType} statusResolvable 
     */
    setType(typeResolvable) {
        if (typeof typeResolvable === "string") typeResolvable = { name: typeResolvable }
        this._setForeignObjectKeys(this.client.guildEntryTypes, ['id_type'], ['id_type'], typeResolvable)
        return this;
    }

    /**
     * @param {string} value 
     */
    setValue(value) {
        this.value = value
        return this;
    }

    /** 
     * @override
     * @param {Object.<string, any>} guildEntryData 
     */
    update(guildEntryData) {
        const client_id = (guildEntryData.client_id === NONE ? null : guildEntryData.client_id)
        super.update({ ...guildEntryData, client_id })
        this.setGuild(guildEntryData.guild)
        this.setType(guildEntryData.type)
        return this;
    }

    /** @override */
    toSQLData() {
        const data = super.toSQLData()
        if (data.client_id === null) data.client_id = NONE
        return data;
    }

}

module.exports = ScrimsGuildEntry;