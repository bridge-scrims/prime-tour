const { ApplicationCommand, Collection, Events, ContextMenuCommandBuilder, SlashCommandBuilder } = require('discord.js');
const BotCommandHandler = require('./interaction-handlers/commands');

class BotCommandInstaller {

    constructor(bot) {

        Object.defineProperty(this, "bot", { value: bot })

        /** 
         * @readonly
         * @type {import("./bot")} 
         */
        this.bot

        /** @type {BotCommandHandler} */
        this.handler = new BotCommandHandler(this)

        /** @type {(SlashCommandBuilder|ContextMenuCommandBuilder)[]} **/
        this.appCommandBuilders = []

        /** @type {Collection<string, ApplicationCommand<{ guild: GuildResolvable }>>} **/
        this.appCommands = []

        /** @type {Object.<string, import('../types').BotCommandConfig>} */
        this.configurations = {}

        /** @type {import('../types').BotCommandResolvable[]} */
        this.botCommands = []

        this.bot.on(Events.GuildCreate, _ => this.update().catch(console.error))
        // this.on(Events.GuildCreate, guild => this.commands.updateGuildCommandsPermissions(guild).catch(console.error))

    }

    async initialize() {
        this.install()
        this.bot.off(Events.InteractionCreate, this.handler.handler)
        this.bot.on(Events.InteractionCreate, this.handler.handler)
        this.appCommands = await this.bot.application.commands.fetch({ withLocalizations: true })
        await this.update()
    }

    setBotCommandDefaultPermission(botCommand, scrimsPermissions, guilds) {
        const guildPermissions = guilds.map(guild => this.getCommandPermissionsGuildCommandPermissions(guild, scrimsPermissions))
        const defaultPermission = guildPermissions.some(perms => perms.length > 10) || guildPermissions.every(perms => perms.length === 0)
        botCommand.setDefaultPermission(defaultPermission)
    }

    async update() {
        await this.updateCommands()
        // await this.updateCommandsPermissions()
    }

    /** @param {import('../types').BotCommandResolvable} botCommand */
    add(botCommand) {
        this.botCommands.push(botCommand)
    }

    /** @protected */
    install() {
        this.botCommands.forEach(cmd => {
            if (typeof cmd === "function") cmd = cmd(this.bot)
            this._install(cmd);
        })
        this.botCommands = []
    }

    /** 
     * @protected
     * @param {import('../types').BotCommand} 
     */
    _install({ command, handler, config }) {
        
        if (typeof command !== "string") {

            const options = command.options
        
            // Important so that we can tell if the command changed or not
            if (options) options.filter(option => (!option.type)).forEach(option => option.type = 1)
            if (options) options.filter(option => option.options === undefined).forEach(option => option.options = [])

            this.appCommandBuilders.push(command)

        }

        const id = command?.name ?? command

        this.handler.addHandler(id, handler)
        this.configurations[id] = config ?? {}

    }

    getCommandBuilder(name) {
        return this.appCommandBuilders.find(v => v.name === name) ?? null;
    }

    getBotCommandConfiguration(name) {
        return this.configurations[name];
    }

    async updateCommands() {

        // UPDATING
        await Promise.all(this.appCommands.map(appCmd => this.updateAppCommand(appCmd)))
        await Promise.all(this.appCommandBuilders.map(builder => this.addAppCommand(builder, this.appCommands)))

        for (const guild of this.bot.guilds.cache.values()) {
            const commands = await guild.commands.fetch({ withLocalizations: true })
            await Promise.all(commands.map(appCmd => this.updateAppCommand(appCmd, guild.id)))
            await Promise.all(this.appCommandBuilders.map(builder => this.addAppCommand(builder, commands, guild.id)))
        }

        // RELOADING
        this.appCommands = await this.bot.application.commands.fetch({ withLocalizations: true })
        
    }

    /** @param {string[]} guilds */
    isAllGuilds(guilds) {
        if (this.bot.guilds.cache.size === guilds.length)
            if (this.bot.guilds.cache.every(v => guilds.includes(v.id)))
                 return true;
    }

    getGuilds({ forceInstallHostGuild, avoidHost } = {}) {
        const guilds = Array.from(this.bot.guilds.cache.map(guild => guild.id))
        return guilds.filter(id => ((forceInstallHostGuild || this.bot.servesHost) && !avoidHost) || (id !== this.bot.hostGuildId))
    }

    async updateAppCommand(appCmd, guildId) {

        const config = this.getBotCommandConfiguration(appCmd.name)
        const guilds = config?.guilds || this.getGuilds(config)
        const builder = this.getCommandBuilder(appCmd.name)

        if (appCmd) {
            if (builder && ((!guildId && this.isAllGuilds(guilds)) || guilds.includes(guildId)) && !(this.isAllGuilds(guilds) && guildId)) {
                // Important so that we can tell if the command changed or not
                if (appCmd.options) appCmd.options.filter(option => option.options === undefined).forEach(option => option.options = [])
                if (!appCmd.equals(builder))
                    // update command
                    await this.bot.application.commands.edit(appCmd.id, builder, guildId)
                        .catch(error => console.error(`Unable to edit app command with id ${appCmd.id}!`, builder, error))
            }else {
                await this.bot.application.commands.delete(appCmd.id, guildId)
                .catch(error => console.error(`Unable to delete app command with id ${appCmd.id}!`, error))
            }
        }

    }

    async addAppCommand(builder, commands, guildId) {

        const config = this.getBotCommandConfiguration(builder.name)
        const guilds = config.guilds || this.getGuilds(config)

        if (this.isAllGuilds(guilds) && guildId) return false;
        if (!((this.isAllGuilds(guilds) && !guildId) || guilds.includes(guildId))) return false;
        if (commands.find(cmd => cmd.name === builder.name)) return false;

        await this.bot.application.commands.create(builder, guildId)
            .catch(error => console.error(`Unable to create app command!`, builder, error))

    }
    
    async updateCommandsPermissions() {
        const guilds = await this.bot.guilds.fetch()
        for (const guild of guilds.values()) await this.updateGuildCommandsPermissions(guild)
    }

    async updateGuildCommandsPermissions(guild) {
        await Promise.all(this.appCommands.map(appCmd => this.updateCommandPermissions(guild, appCmd))).catch(console.error)
    }

    getCommandPermissionsGuildCommandPermissions(guild, perms = {}) {

        return [];
        
        // eslint-disable-next-line no-unreachable
        const positions = this.bot.permissions.getCommandAllowedPositions(perms)
        if (positions.length === 0) return [];

        const roles = positions.map(position => this.bot.permissions.getGuildPositionRoles(guild.id, position)).flat()
        
        if (roles.length === 0) return [{ id: guild.id, permission: true, type: 'ROLE' }];
        return roles.map(roleId => ({ id: roleId, permission: true, type: 'ROLE' }))

    }

    async updateCommandPermissions(guild, appCmd) {

        const config = this.getBotCommandConfiguration(appCmd.name)
        const permissions = this.getCommandPermissionsGuildCommandPermissions(guild, config.permissions)

        const existingPerms = await appCmd.permissions.fetch({ command: appCmd.id, guild: guild.id }).catch(() => null)

        // Permissions have not changed so just leave it
        if (!existingPerms && permissions.length === 0) return true;
        if ((JSON.stringify(existingPerms) == JSON.stringify(permissions))) return true;
        
        // Can not block the command client side, since discord only allows up to 10 permissions
        if (appCmd.defaultPermission || permissions.length === 0 || permissions.length > 10) {

            await appCmd.permissions.set({ command: appCmd.id, guild: guild.id, permissions: [] })
                .catch(error => console.error(`Unable to set permissions for command ${appCmd.name}/${appCmd.id}/${guild.id} to none!`, error))
            
            return false; 

        }

        // Set command permissions
        await appCmd.permissions.set({ command: appCmd.id, guild: guild.id, permissions })
            .catch(error => console.error(`Unable to set permissions for command ${appCmd.name}/${appCmd.id}/${guild.id}!`, permissions, error))

    }

}

module.exports = BotCommandInstaller;