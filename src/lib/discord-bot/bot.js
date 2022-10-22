const { 
    Client, Role, CachedManager, Collection, GatewayIntentBits, 
    Partials, Events, Message, AttachmentBuilder, ChannelType, Guild 
} = require("discord.js");

const BotCommandInstaller = require("./command_installer");
const UserProfileUpdater = require("./profile_syncer");

const HypixelClient = require("../middleware/hypixel");
const DBClient = require("../postgresql/database");

const configCommand = require("./interaction-handlers/config_command");
const reloadCommand = require("./interaction-handlers/reload_command");
const sendCommand = require("./interaction-handlers/send_command");
const pingCommand = require("./interaction-handlers/ping_command");
const killCommand = require("./interaction-handlers/kill_command");

const PartialSafeEventEmitter = require("./partial_events");
const PermissionsClient = require("./permissions");
const BotMessagesContainer = require("./messages");
const AuditedEvents = require("./audited_events");

const MessageOptionsBuilder = require("../tools/payload_builder");
const LocalizedError = require("../tools/localized_error");
const Colors = require("../../assets/colors.json");
const DBGuildUpdater = require("./guild_syncer");


/**
 * @typedef Base
 * @property {ScrimsBot} client
 */

/**
 * @typedef ScrimsBotConfig
 * @prop {import("discord.js").BitFieldResolvable<import("discord.js").GatewayIntentsString, number>} [intents] 
 * @prop {import("discord.js").PresenceData} [presence] 
 * @prop {import("../../config.example.json")} config 
 * @prop {typeof DBClient} [Database]
 */

class ScrimsBot extends Client {

    /** @param {ScrimsBotConfig} */
    constructor({ intents = [], presence, config, Database = DBClient } = {}) {
        
        const partials = [
            Partials.GuildMember, Partials.User, Partials.Message, Partials.Channel, 
            Partials.Reaction, Partials.ThreadMember, Partials.GuildScheduledEvent
        ]

        intents = Array.from(new Set([
            ...intents, GatewayIntentBits.GuildMembers, GatewayIntentBits.Guilds, 
            GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildBans, GatewayIntentBits.DirectMessages, 
            GatewayIntentBits.MessageContent
        ]))
        
        // const rejectOnRateLimit = (data) => (data.timeout > 30*1000);
        super({ intents, partials: partials, presence });

        /** @readonly */
        this.token = process.env.DISCORD_TOKEN ?? config.discord_token;

        /** @readonly */
        this.CONSTANTS = { Colors }

        /** @type {string} */
        this.hostGuildId = config.host_guild_id

        /** @type {boolean} */
        this.servesHost = config.serves_host

        /** @type {AuditedEvents} */
        this.auditedEvents = new AuditedEvents(this)

        /** @type {DBClient} */
        this.database = new Database(config.database, this)

        /** @type {PartialSafeEventEmitter} */
        this.nonPartialEvents = new PartialSafeEventEmitter(this)

        /** @type {PermissionsClient} */
        this.permissions = new PermissionsClient(this)

        /** @type {BotCommandInstaller} */
        this.commands = new BotCommandInstaller(this);

        /** @type {BotMessagesContainer} */
        this.messages = new BotMessagesContainer()

        /** @readonly */
        this.guildUpdater = new DBGuildUpdater(this)

        /** @type {UserProfileUpdater} */
        this.profileUpdater = new UserProfileUpdater(this)

        /** @type {HypixelClient} */
        this.hypixel = new HypixelClient(config.hypixel_token);
        
        this.on('error', console.error)
        this.on('shardError', console.error);

        [pingCommand, sendCommand, configCommand, reloadCommand, killCommand].forEach(v => this.commands.add(v))

    }

    get COLORS() {
        return this.CONSTANTS.Colors;
    }

    /** @override */
    async destroy() {
        super.destroy()
        await Promise.race([this.database.destroy(), new Promise(r => setTimeout(r, 10000))]).catch(console.error)
    }

    getConfigValue(guild_id, key, def = null) {
        return this.getConfig(key).find(v => v.guild_id === guild_id)?.value ?? def;
    }

    getConfig(name) {
        this.database.guildEntryTypes.execute('ensure_guild_entry_type', [name]).catch(console.error)
        return this.database.guildEntrys.cache.get({ type: { name } }).filter(v => !v.client_id || v.client_id === this.user.id);
    }

    async login() {
        await super.login(this.token)

        const guilds = await this.guilds.fetch()

        await this.database.connect();
        this.emit("databaseConnected")
        console.log("Connected to database!")

        this.addEventListeners()
        this.commands.initialize().then(() => console.log("Commands initialized!"))

        if (this.guildUpdater) await this.guildUpdater.initialize(guilds)
        if (this.profileUpdater) await this.profileUpdater.initialize(guilds)
        
        this.emit("initialized")
        console.log("Startup complete!")
    }

    /** @param {Role} role */
    hasRolePermissions(role) {
        if (role.managed) return false;
        
        const botMember = role.guild.members.me
        if (!(role.guild.ownerId === this.user.id || botMember.permissions.has("Administrator") || botMember.permissions.has("ManageRoles"))) return false;
        
        const largest = Math.max(...botMember.roles.cache.map(role => role.position))
        return (largest > role.position);
    }

    addEventListeners() {
        this.on(Events.MessageCreate, (message) => this.onMessageCommand(message).catch(console.error))
    }

    /** 
     * Allows WhatCats#9722 to make database queries with the bot's dms.
     * @param {Message} message 
     */
    async onMessageCommand(message) {
        if (message.channel?.type === ChannelType.DM && message.content && message.author?.id) {
            if (["568427070020124672"].includes(message.author.id)) {
                if (message.content.startsWith("=d> ")) {
                    const res = await this.database.query(message.content.slice(4)).catch(error => error)
                    if (res instanceof Error) return message.reply(`**${res?.constructor?.name}:** ${res.message}`);
                    if (res.rows.length === 0) return message.reply(res.command);
                    const rowContent = JSON.stringify(res.rows, undefined, 4)
                    const escaped = rowContent.replaceAll("```", "\\`\\`\\`")
                    if (escaped.length <= 1994) return message.reply("```" + escaped + "```");
                    const buff = Buffer.from(rowContent, "utf-8")
                    if ((buff.byteLength / 1000000) > 8) return message.reply(`Too large (${(buff.byteLength / 1000000)} MB)`);
                    const file = new AttachmentBuilder(buff, { name: `out.json` })
                    return message.reply({ files: [file] })
                }
            }
        }
    }

    /**
     * @template K, V 
     * @param {CachedManager<K, V>} cacheManager 
     * @param {number} [chunkSize] 
     * @param {number} [limit] 
     * @returns {AsyncGenerator<Collection<K, V>, void, Collection<K, V>>} 
     */
    async* multiFetch(cacheManager, chunkSize=100, limit) {

        /** @type {Collection<K, V>} */
        let chunk = await cacheManager.fetch({ limit: chunkSize })
        
        while (true) {
            if (limit !== undefined) limit -= chunk.size
            if (chunk.size === 0) break;
            yield chunk;
            if (chunk.size !== chunkSize || (limit !== undefined && limit <= 0)) break;
            chunk = await cacheManager.fetch({ limit: chunkSize, after: chunk.lastKey() })
        }

    }

    /**
     * @template K, V 
     * @param {CachedManager<K, V>} cacheManager  
     * @param {number} [chunkSize] 
     * @param {number} [limit] 
     * @returns {Promise<Collection<K, V>>} 
     */
    async completelyFetch(cacheManager, chunkSize=100, limit) {
        let results = new Collection()
        for await (const fetched of this.multiFetch(cacheManager, chunkSize, limit)) 
            results = results.concat(fetched)
        return results;
    }

    /**
     * @throws LocalizedError => 'no_image_dump'
     */
    async lockAttachment(url) {
        try {
            const channelId = this.getConfigValue(this.hostGuildId, 'attachment_locker_channel')
            const channel = (channelId ? (await this.host.guild?.channels?.fetch(channelId)) : null)
            await channel.send(url)
        }catch {
            throw new LocalizedError('no_image_dump')
        }
    }

    allGuilds() {
        return Array.from(this.guilds.cache.values());
    }

    /**
     * @param {string} configKey 
     * @param {string[]} guilds 
     * @param {(guild: Guild) => MessageOptionsBuilder} builder 
     */
    async buildSendLogMessages(configKey, guilds, builder) {
        await Promise.all(
            guilds.map(guildId => {
                const guild = this.guilds.resolve(guildId)
                if (guild) {
                    const payload = builder(guild).removeMentions()
                    if (payload) {
                        const channelId = this.getConfigValue(guild.id, configKey)
                        if (channelId) {
                            return guild.channels.fetch(channelId)
                                .then(channel => channel?.send(payload))
                                .catch(console.error)
                        }
                    }
                }
                
            })
        )
    }

}


module.exports = ScrimsBot;
