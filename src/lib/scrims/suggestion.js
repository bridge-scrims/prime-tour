const { Guild, EmbedBuilder, User } = require("discord.js");
const ScrimsMessageBuilder = require("../tools/responses");
const ScrimsGuild = require("../scrims/guild");
const TableRow = require("../postgresql/row");

class ScrimsSuggestion extends TableRow {

    constructor(client, suggestionData) {

        super(client, suggestionData)

        /** @type {string} */
        this.id_suggestion
        if (!this.id_suggestion) this.setId()
        
        /** @type {string} */
        this.guild_id

        /** @type {string} */
        this.channel_id

        /** @type {string} */
        this.message_id

        /** @type {string} */
        this.suggestion

        /** @type {number} */
        this.created_at

        /** @type {string} */
        this.creator_id

        /** @type {?number} */
        this.epic

        /** @type {?string} */
        this.image_url

    }

    get discordGuild() {
        if (!this.bot) return null;
        return this.bot.guilds.resolve(this.guild_id);
    }

    /** @returns {import("discord.js").TextBasedChannel} */
    get channel() {
        if (!this.discordGuild || !this.channel_id) return null;
        return this.discordGuild.channels.resolve(this.channel_id);
    }

    get message() {
        if (!this.channel || !this.message_id) return null;
        return this.channel.messages.resolve(this.message_id);
    }

    async fetchMessage() {
        if (!this.channel || !this.message_id) return null;
        return this.channel.messages.fetch(this.message_id);
    }

    isCacheExpired(now) {
        return ((now - this.created_at) > (5*24*60*60)) && super.isCacheExpired(now);
    }

    /**
     * @param {string} [id_ticket] if falsley will use a random uuid
     */
    setId(id_ticket) {
        this.id_ticket = id_ticket ?? this.client.generateUUID()
        return this;
    }

    /** 
     * @param {import('discord.js').ChannelResolvable} channelResolvable 
     */
    setChannel(channelResolvable) {
        this.channel_id = channelResolvable?.id ?? channelResolvable
        return this;
    }

    /**
     * @param {import('discord.js').MessageResolvable} messageResolvable 
     */
    setMessage(messageResolvable) {
        this.message_id = messageResolvable?.id ?? messageResolvable
        return this;
    }

    /**
     * @param {string} suggestion
     */
    setSuggestion(suggestion) {
        this.suggestion = suggestion
        return this;
    }

    /**
     * @param {number} [created_at] if falsley will use current time 
     */
    setCreation(created_at) {
        this.created_at = created_at ?? Math.floor(Date.now()/1000)
        return this;
    }

    get guild() {
        return this.client.guilds.cache.find(this.guild_id);
    }

    /**
     * @param {string|Object.<string, any>|ScrimsGuild|Guild} guildResolvable 
     */
    setGuild(guildResolvable) {
        if (guildResolvable instanceof Guild) guildResolvable = guildResolvable.id
        this._setForeignObjectKeys(this.client.guilds, ['guild_id'], ['guild_id'], guildResolvable)
        return this;
    }

    get creatorProfile() {
        return this.client.users.cache.find(this.creator_id);
    }

    get creator() {
        if (!this.bot || !this.creator_id) return null;
        return this.bot.users.resolve(this.creator_id);
    }

    /** 
     * @param {string|import('./user_profile')|User} creator 
     */
    setCreator(creator) {
        this.creator_id = creator?.user_id ?? creator?.id ?? creator
        return this;
    }

    /**
     * @param {number} [epic] if falsley will use current time 
     */
    setEpic(epic) {
        this.epic = epic ?? Math.floor(Date.now()/1000)
        return this;
    }

    /** 
     * @param {?string} url 
     */
    setImageURL(url) {
        this.image_url = url
        return this;
    }

    /** Where hue = 120 is green and hue = 0 is red and hue < 0 means purple */
    toEmbed(hue = 60) {
        return new EmbedBuilder()
            .setAuthor(this.creatorProfile?.toEmbedAuthor() ?? null)
            .setColor((hue < 0 ? this.COLORS.Barney : ScrimsMessageBuilder.hsv2rgb(hue, 1, 1)))
            .setDescription(this.suggestion)
            .setImage(this.image_url)
    }

    toEmbedField() {
        const info = `**Created by ${this.creatorProfile} on <t:${this.created_at}:F>**`
        const msg = this.suggestion.substring(0, 1024 - info.length - 30) ?? `Unknown Content`
        return ({
            name: 'Suggestion',
            value: `${info}\n\`\`\`\n${msg}`
                + `${(msg.length !== this.suggestion.length) ? "\n..." : ""}\`\`\``, 
            inline: false
        })
    }

    /** 
     * @override
     * @param {Object.<string, any>} suggestionData 
     */
    update(suggestionData) {
        super.update(suggestionData);
        this.setGuild(suggestionData.guild)
        return this;
    }

}

module.exports = ScrimsSuggestion;