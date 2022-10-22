const { Guild, RoleResolvable } = require("discord.js");
const TableRow = require("../postgresql/row");

const ScrimsPosition = require("./position");
const ScrimsGuild = require("./guild");

class ScrimsPositionRole extends TableRow {

    static sortByLevel(a, b) {
        const getPosition = (e) => (e.position ?? { id_position: e.id_position });
        return ScrimsPosition.sortByLevel(getPosition(a), getPosition(b));
    }
    
    constructor(client, positionRoleData) {

        super(client, positionRoleData)

        /** @type {number} */
        this.id_position

        /** @type {ScrimsPosition} */
        this.position

        /** @type {string} */
        this.role_id

        /** @type {string} */
        this.guild_id

    }

    get discordGuild() {
        if (!this.bot) return null;
        return this.bot.guilds.resolve(this.guild_id);
    }

    get role() {
        if (!this.role_id || !this.discordGuild) return null;
        return this.discordGuild.roles.resolve(this.role_id);
    }

    get position() {
        return this.client.positions.cache.find(this.id_position);
    }

    /**
     * @param {string|number|Object.<string, any>|ScrimsPosition} positionResolvable 
     */
    setPosition(positionResolvable) {
        if (typeof positionResolvable === "string") positionResolvable = { name: positionResolvable }
        this._setForeignObjectKeys(this.client.positions, ['id_position'], ['id_position'], positionResolvable)
        return this;
    }

    /**
     * @param {RoleResolvable} roleResolvable 
     */
    setRole(roleResolvable) {
        this.role_id = roleResolvable?.id ?? roleResolvable
        return this;
    }

    get guild() {
        return this.client.guilds?.cache?.find(this.guild_id);
    }

    /**
     * @param {string|Object.<string, any>|ScrimsGuild|Guild} guildResolvable 
     */
    setGuild(guildResolvable) {
        if (guildResolvable instanceof Guild) guildResolvable = guildResolvable.id
        this._setForeignObjectKeys(this.client.guilds, ['guild_id'], ['guild_id'], guildResolvable)
        return this;
    }

    /** 
     * @override
     * @param {Object.<string, any>} guildEntryData 
     */
    update(positionRoleData) {
        super.update(positionRoleData)
        this.setGuild(positionRoleData.guild)
        this.setPosition(positionRoleData.position)
        return this;
    }

}

module.exports = ScrimsPositionRole;