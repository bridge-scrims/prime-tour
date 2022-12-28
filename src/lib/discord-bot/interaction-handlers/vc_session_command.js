const { 
    LocalizedSlashCommandBuilder, LocalizedSlashCommandSubcommandBuilder 
} = require('../tools/localized_builders');

const { 
    SlashCommandStringOption, EmbedBuilder, SlashCommandIntegerOption, 
    SlashCommandChannelOption, SlashCommandBooleanOption, SlashCommandUserOption, InteractionType 
} = require('discord.js');

const PendingVoiceChannelBasedSession = require('../tools/vc_session');
const VoiceBasedSessionsManager = require('../tools/vc_sessions');
const LocalizedError = require('../../tools/localized_error');
const { Colors } = require('../../tools/constants');

const SQLStatementCreator = require('../../postgresql/statements');
const DBType = require('../../database/type');


const OPTIONS = {
    Session: "session",
    SessionType: "session_type",
    SessionChannel: "channel",
    DiscardSession: "discard",
    SessionCreator: "creator"
}

const SUBCOMMAND_HANDLERS = {
    "status": onSessionStatusCommand,
    "start": onSessionStartCommand,
    "stop": onSessionStopCommand
}

/** @param {import('../../types').ScrimsInteraction} interaction */
async function onSessionsCommand(interaction) {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) return onAutocomplete(interaction);
    const handler = SUBCOMMAND_HANDLERS[interaction.subCommandName]
    if (!handler) throw new Error(`${interaction.path} has no handler!`)
    await handler(interaction)
}

/** @param {import('../types').ScrimsAutocompleteInteraction} interaction */
async function onAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true)
    if (focused.name === OPTIONS.SessionType) {
        await interaction.respond(
            interaction.database.sessionTypes.cache.values()
                .filter(v => hasSessionPermissions(interaction, v))
                .filter(v => v.titleName.toLowerCase().includes(focused.value.toLowerCase()))
                .map(v => ({ name: v.titleName, value: v.id_type }))
                .slice(0, 25)
        )
    }else if (focused.name === OPTIONS.Session) {
        await interaction.respond(
            (await interaction.database.sessions.sqlFetch())
                .concat(PendingVoiceChannelBasedSession.values())
                .filter(v => hasSessionPermissions(interaction, v.type))
                .filter(v => v.id_session.toLowerCase().includes(focused.value.toLowerCase()))
                .map(v => ({ name: `${v.id_session} (${v.type?.titleName})`, value: v.id_session }))
                .slice(0, 25)                
        )
    }
}

/** 
 * @param {import('../../types').ScrimsInteraction} interaction
 * @param {?DBType} type
 */
function hasSessionPermissions(interaction, type) {
    return interaction.userHasPermissions(VoiceBasedSessionsManager.getCommandPermissions(type));
}

/** @param {import('../../types').ScrimsChatInputCommandInteraction} interaction */
async function onSessionStatusCommand(interaction) {
    const creator = interaction.options.getUser(OPTIONS.SessionCreator, false)
    const channel_id = interaction.options.get(OPTIONS.SessionChannel)?.value
    const id_type = interaction.options.getInteger(OPTIONS.SessionType, false)
    const id_session = interaction.options.getString(OPTIONS.Session, false)
    if (id_session) {
        const session = await interaction.database.sessions.find({ id_session })
        if (!session) throw new LocalizedError("commands.vc_sessions.no_session")
        if (!hasSessionPermissions(interaction, session.type)) 
            throw new LocalizedError("commands.vc_sessions.no_permissions", "manage", session.type?.titleName)
        const participants = await interaction.database.sessionParticipants.sqlFetch({ id_session })
        await interaction.editReply(session.toMessage(interaction.i18n, participants))
    }else if (channel_id || (interaction?.member?.voice?.channelId && !id_type)) {
        const session = PendingVoiceChannelBasedSession.find(channel_id ?? interaction.member.voice.channelId)
        if (!session) throw new LocalizedError("commands.vc_sessions.no_session")
        if (!hasSessionPermissions(interaction, session.type)) 
            throw new LocalizedError("commands.vc_sessions.no_permissions", "manage", session.type?.titleName)
        await interaction.editReply(session.toMessage(interaction.i18n))
    }else {
        const id_creator = creator?.user_id ?? interaction.user.id
        const selector = SQLStatementCreator.AND({ id_creator }, (id_type ? { id_type } : {}))
        const sessions = (await interaction.database.sessions.sqlFetch(selector))
            .concat(PendingVoiceChannelBasedSession.values().filter(v => (!id_type || v.id_type === id_type) && v.id_creator === id_creator))
            .filter(v => hasSessionPermissions(interaction, v.type))
            .sort((a, b) => (a.ended_at ?? a.started_at) - (b.ended_at ?? b.started_at))
        if (sessions.length === 0) throw new LocalizedError("commands.vc_sessions.no_sessions")
        const participants = await interaction.database.sessionParticipants.fetchArrayMap(
            SQLStatementCreator.OR(sessions.map(({ id_session }) => ({ id_session }))), ["id_session"]
        )
        const embed = new EmbedBuilder()
            .setTitle("Sessions")
            .setColor(Colors.LightBrightGreen)
            .addFields(
                ...sessions
                    .slice(0, 25)
                    .map(session => ({ 
                        name: session.id, 
                        value: session.getDetails(interaction.i18n, participants[session.id_session] ?? []) 
                    }))
            )
        await interaction.editReply({ embeds: [embed] })
    }
}

/** @param {import('../../types').ScrimsChatInputCommandInteraction} interaction */
function getOptionalTypeManager(interaction, action) {
    const id_type = interaction.options.getInteger(OPTIONS.SessionType, false)
    const types = interaction.database.sessionTypes.cache.values()
        .filter(v => (!id_type || v.id_type === id_type) && hasSessionPermissions(interaction, v))
    if (types.length > 1) throw new LocalizedError("commands.vc_sessions.unknown_type")
    if (types.length === 0) throw new LocalizedError("commands.vc_sessions.no_permissions", action, "these kind")
    const manager = VoiceBasedSessionsManager.getManager(types[0].name)
    if (!manager) throw new Error(`No manager for session type ${types[0].name}!`)
    return manager;
}

/** @param {import('../../types').ScrimsChatInputCommandInteraction} interaction */
function getOptionalChannelId(interaction) {
    const channel = interaction.options.getChannel(OPTIONS.SessionChannel, false) ?? interaction?.member?.voice?.channel
    if (!channel) throw new LocalizedError("commands.vc_sessions.no_vc")
    if (!channel?.isVoiceBased()) throw new LocalizedError("commands.vc_sessions.invalid_vc")
    return channel;
}

/** @param {import('../../types').ScrimsChatInputCommandInteraction} interaction */
async function onSessionStartCommand(interaction) {
    const channel = getOptionalChannelId(interaction)
    const manager = getOptionalTypeManager(interaction, "start")
    if (manager.exists(channel.id)) throw new LocalizedError("commands.vc_sessions.already_session", `${channel}`)
    const session = manager.start(channel, interaction.scrimsUser)
    await interaction.editReply({ content: interaction.i18n.get("commands.vc_sessions.started_session", session?.type?.titleName ?? session?.id_type) })
}

/** @param {import('../../types').ScrimsChatInputCommandInteraction} interaction */
async function onSessionStopCommand(interaction) {
    const discard = interaction.options.getBoolean(OPTIONS.DiscardSession, false) ?? false
    const channel = getOptionalChannelId(interaction)
    const manager = getOptionalTypeManager(interaction, "stop")
    if (!manager.exists(channel.id)) throw new LocalizedError("commands.vc_sessions.stop_no_session", `${channel}`)
    const session = await manager.end(channel.id, interaction.scrimsUser, discard)
    await interaction.editReply({ content: interaction.i18n.get("commands.vc_sessions.ended_session", session?.type?.titleName ?? session?.id_type) })
}

function buildSessionOption() {
    return new SlashCommandStringOption()
        .setAutocomplete(true)
        .setRequired(false)
        .setNameAndDescription("commands.vc_sessions.session_option")
        .setName(OPTIONS.Session)
}

function buildSessionTypeOption() {
    return new SlashCommandIntegerOption()
        .setAutocomplete(true)
        .setRequired(false)
        .setNameAndDescription("commands.vc_sessions.session_type_option")
        .setName(OPTIONS.SessionType)
}

function buildSessionChannelOption() {
    return new SlashCommandChannelOption()
        .setRequired(false)
        .setNameAndDescription("commands.vc_sessions.channel_option")
        .setName(OPTIONS.SessionChannel)
}

function buildSessionDiscardOption() {
    return new SlashCommandBooleanOption()
        .setRequired(false)
        .setNameAndDescription("commands.vc_sessions.discard_option")
        .setName(OPTIONS.DiscardSession)
}

function buildSessionCreatorOption() {
    return new SlashCommandUserOption()
        .setRequired(false)
        .setNameAndDescription("commands.vc_sessions.creator_option")
        .setName(OPTIONS.SessionCreator)
}

function buildSessionsStatusSubcommand() {
    return new LocalizedSlashCommandSubcommandBuilder()
        .setNameAndDescription("commands.vc_sessions.status")
        .addChannelOption(buildSessionChannelOption())
        .addStringOption(buildSessionOption())
        .addIntegerOption(buildSessionTypeOption())
        .addUserOption(buildSessionCreatorOption())
}

function buildSessionsStartSubcommand() {
    return new LocalizedSlashCommandSubcommandBuilder()
        .setNameAndDescription("commands.vc_sessions.start")
        .addChannelOption(buildSessionChannelOption())
        .addIntegerOption(buildSessionTypeOption())
}

function buildSessionsStopSubcommand() {
    return new LocalizedSlashCommandSubcommandBuilder()
        .setNameAndDescription("commands.vc_sessions.stop")
        .addBooleanOption(buildSessionDiscardOption())
        .addChannelOption(buildSessionChannelOption())
        .addIntegerOption(buildSessionTypeOption())
}

/** @returns {import('../../types').BotCommand} */
function buildSessionsCommand() {
    return {
        command: new LocalizedSlashCommandBuilder()
            .setNameAndDescription("commands.vc_sessions")
            .addSubcommand(buildSessionsStatusSubcommand())
            .addSubcommand(buildSessionsStartSubcommand())
            .addSubcommand(buildSessionsStopSubcommand()),
        handler: onSessionsCommand,
        config: {
            permissions: VoiceBasedSessionsManager.getCommandPermissions(),
            defer: 'ephemeral_reply', forceGuild: true, forceScrimsUser: true
        }
    }
}

module.exports = buildSessionsCommand