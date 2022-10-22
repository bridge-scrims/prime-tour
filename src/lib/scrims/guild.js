const { CDN } = require('@discordjs/rest');
const TableRow = require("../postgresql/row");

const CDN_BUILDER = new CDN()

class ScrimsGuild extends TableRow {

    /**
     * @param {import("discord.js").Guild} guild 
     */
    static fromDiscordGuild(guild) {
        return new ScrimsGuild(guild.client.database, { guild_id: guild.id, name: guild.name, icon: (guild.icon ?? null) });
    }

    constructor(client, guildData) {

        super(client, guildData);

        /** @type {string} */
        this.guild_id

        /** @type {string} */
        this.name

        /** @type {string} */
        this.icon

    }

    get discordGuild() {
        if (!this.guild_id || !this.bot) return null;
        return this.bot.guilds.resolve(this.guild_id);
    }

    iconURL() {
        if (!this.icon) return null;
        return CDN_BUILDER.icon(this.guild_id, this.icon);
    }

}

module.exports = ScrimsGuild;