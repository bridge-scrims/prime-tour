const { Interaction, CommandInteraction, MessageComponentInteraction, InteractionType, DiscordAPIError, MessageFlags, ModalBuilder } = require("discord.js");
const LocalizedError = require("../../tools/localized_error");
const I18n = require("../../tools/internationalization");
const UserProfile = require("../../scrims/user_profile");
const UserError = require("../../tools/user_error");
const { DatabaseError } = require("pg");

class CommandHandler {

    constructor(installer) {

        /** @type {import("../command_installer.js")} */
        this.installer = installer

        this.handler = (interaction) => this.handleInteraction(interaction).catch(console.error)
        this.handlers = {}

    }

    get bot() {
        return this.installer.bot;
    }

    get database() {
        return this.bot.database;
    }

    addHandler(id, handler) {
        this.handlers[id] = handler
    }

    /** @param {Interaction} interaction */
    async expandInteraction(interaction) {
        
        interaction.CONSTANTS = this.bot.CONSTANTS
        interaction.COLORS = this.bot.COLORS
        interaction.database = this.database
        interaction.i18n = I18n.getInstance(interaction.locale)

        if (interaction.type === InteractionType.MessageComponent || interaction.type === InteractionType.ModalSubmit) this.expandComponentInteraction(interaction)
        if (interaction.options) interaction.subCommandName = interaction.options.getSubcommand(false) ?? null
        
        interaction.path = `${interaction.commandName}`
        if (interaction.subCommandName) interaction.path += `/${interaction.subCommandName}`

        interaction.commandConfig = this.installer.getBotCommandConfiguration(interaction.commandName) ?? null

        interaction.return = async (payload) => {
            if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
                await interaction.respond(payload)
            }else if (payload instanceof ModalBuilder) {
                if (interaction.type !== InteractionType.ModalSubmit)
                    if (!interaction.replied && !interaction.deferred)
                        await interaction.showModal(payload)
            }else {
                const forceEphemeral = payload.ephemeral
                const isEphemeral = interaction?.message?.flags?.has(MessageFlags.Ephemeral)
                if (interaction.deferred && !interaction.replied && !isEphemeral && forceEphemeral) return interaction.followUp(payload)
                if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
                if (isEphemeral) return interaction.update(payload);
                return interaction.reply(payload);
            }
        }

        if (interaction.commandName === "CANCEL" && interaction.type === InteractionType.MessageComponent) 
            throw new LocalizedError('operation_cancelled')

        await this.bot.profileUpdater?.verifyProfile(interaction.user)
        interaction.userProfile = this.database.users.cache.find({ user_id: interaction.user.id }) || UserProfile.resolve(interaction.user)
        interaction.userPermissions = await this.bot.permissions.fetchUserPermissions(interaction.user.id)
        this.bot.permissions.expandUser(interaction.user, interaction.userPermissions)  

        interaction.userHasPermissions = (permissions) => this.bot.permissions.hasPermission(interaction.user.id, interaction.userPermissions, interaction.member, permissions)
        interaction.userHasPosition = (position) => this.bot.permissions.hasPosition(interaction.user.id, interaction.userPermissions, position)

        if (interaction.member) {
            this.bot.permissions.expandMember(interaction.member, interaction.userPermissions)
        }
        
        if (!this.isPermitted(interaction)) throw new LocalizedError('command_handler.missing_permissions')
            
        if (interaction?.commandConfig?.forceGuild && !interaction.guild)
            throw new LocalizedError('command_handler.guild_only')

    }

    /** @param {Interaction} interaction */
    getHandler(interaction) {
        const handler = this.handlers[interaction.commandName]
        if (handler) return handler;
        if (interaction.type === InteractionType.MessageComponent) throw new LocalizedError('command_handler.no_host')
        throw new LocalizedError('command_handler.missing_handler')
    }

    /** @param {Interaction} interaction */
    async handleInteraction(interaction) {
        try {

            await this.expandInteraction(interaction)

            if (interaction.type !== InteractionType.ApplicationCommandAutocomplete) {
                const ephemeral = interaction?.commandConfig?.ephemeralDefer
                if (ephemeral !== undefined) await interaction.deferReply({ ephemeral })
                else if (interaction?.commandConfig?.deferUpdate) await interaction.deferUpdate()
            }
            
            const handler = this.getHandler(interaction)
            await handler(interaction)

        }catch(error) {
            if (![10062].includes(error.code)) {
                if (!(error instanceof UserError) && !(error instanceof LocalizedError))
                    console.error(`Unexpected error while handling a command!`, error)

                if (interaction.type !== InteractionType.ApplicationCommandAutocomplete) {
                    const payload = this.getErrorPayload(interaction.i18n, error)
                    await interaction.return(payload).catch(() => null)
                }
            }
        }
    }

    /**
     * @param {I18n} i18n 
     * @param {Error} error
     */
    getErrorPayload(i18n, error) {
        if (error instanceof DiscordAPIError) error = new LocalizedError("unexpected_error.discord") 
        if (error instanceof DatabaseError) error = new LocalizedError("unexpected_error.database") 
        if (error instanceof LocalizedError) return error.toMessagePayload(i18n);
        if (error instanceof UserError) return error.toMessage();
        return (new LocalizedError("unexpected_error.unknown")).toMessagePayload(i18n);
    }

    expandComponentInteraction(interaction) {
        interaction.args = interaction.customId.split("/") ?? []
        interaction.commandName = interaction.args.shift() ?? null 
        interaction.subCommandName = interaction.args[0] ?? null 
    }

    isPermitted(interaction) {
        if (!interaction?.commandConfig?.permissions) return true;
        return interaction.userHasPermissions(interaction?.commandConfig?.permissions);
    }

    /**
     * @param {ModalBuilder} modal 
     * @param {MessageComponentInteraction|CommandInteraction} interaction 
     * @param {TextInputBuilder[]} fields 
     */
    async sendModal(modal, interaction, fields=[]) {
        const inputs = modal.components.map(v => v.components[0]).flat()
        fields.forEach(field => {
            const input = inputs.filter(value => value.customId === field.customId)[0]
            if (input) {
                input.value = field.value
            }
        })
        await interaction.showModal(modal)
    }

}

module.exports = CommandHandler;