const { userMention, time, TimestampStyles } = require("discord.js");
const TableRow = require("./lib/postgresql/row");
const I18n = require("./lib/tools/internationalization");

class PrimeTourMatch extends TableRow {

    constructor(client, matchData) {

        super(client, matchData)

        /** @type {number} */
        this.match_id

        /** @type {string} */
        this.channel_id

        /** @type {string} */
        this.guild_id

        /** @type {string} */
        this.user1_id

        /** @type {string} */
        this.user2_id

    }

    /** @param {string} match_id */
    setMatchId(match_id) {
        this.match_id = match_id
        return this;
    }

    /** @returns {?import('discord.js').TextChannel} */
    get channel() {
        if (!this.guild) return null;
        return this.guild.channels.resolve(this.channel_id)
    }

    /** @returns {Promise<?import('discord.js').TextChannel>} */
    async fetchChannel() {
        if (!this.guild) return null;
        return this.guild.channels.fetch(this.channel_id)
    }

    /** @param {string|import('discord.js').TextChannel} channel */
    setChannel(channel) {
        this.channel_id = channel?.id ?? channel
        return this;
    }

    get guild() {
        if (!this.bot) return null;
        return this.bot.guilds.resolve(this.guild_id)
    }

    /** @param {string|import('discord.js').BaseGuild} guild */
    setGuild(guild) {
        this.guild_id = guild?.id ?? guild
        return this;
    }

    get user1() {
        if (!this.bot) return null;
        return this.bot.users.resolve(this.user1_id);
    }

    /** @param {string|import('./lib/scrims/user_profile')|import('discord.js').User|null} user */
    setUser1(user) {
        this.user1_id = user?.user_id ?? user?.id ?? user
        return this;
    }

    get user2() {
        if (!this.bot) return null;
        return this.bot.users.resolve(this.user2_id);
    }

    /** @param {string|import('./lib/scrims/user_profile')|import('discord.js').User|null} user */
    setUser2(user) {
        this.user2_id = user?.user_id ?? user?.id ?? user
        return this;
    }

    userIds() {
        return [this.user1_id, this.user2_id];
    }

    /** 
     * @param {I18n} i18n 
     * @param {number} round
     * @param {number} end timestamp in seconds
     */
    getIntroMessage(i18n, round, end) {
        return i18n.getMessageOptions(
            'prime_tour.match_intro', `${round}`, time(end, TimestampStyles.LongDateTime),
            '<#1026925224555462696>', '<#1026925224555462696>'
        ).editContent(c => `${this.userIds().map(userMention).join(' ')}\n${c}`)
    }

}

module.exports = PrimeTourMatch;