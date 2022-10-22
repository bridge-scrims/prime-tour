const { 
    LocalizedSlashCommandBuilder, LocalizedSlashCommandSubcommandBuilder 
} = require("./lib/discord-bot/tools/localized_builders");
const { PermissionFlagsBits, OverwriteType } = require("discord.js");

const categoryLimitSafeCreate = require("./lib/discord-bot/tools/category_expander");
const LocalizedError = require("./lib/tools/localized_error");
const TimeUtil = require("./lib/tools/time_util");


const Options = {
    Round: "round",
    Length: "length"
}

const CHANNEL_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.ReadMessageHistory
]

/** @param {import("./lib/types").ScrimsChatInputCommandInteraction & import('./bot').Base} interaction */
async function startTourneyCommand(interaction) {
    if (!interaction.userHasPermissions({ positionLevel: 'staff' })) 
        throw new LocalizedError('command_handler.missing_permissions')

    const round = interaction.options.getInteger(Options.Round)
    const duration = interaction.options.getInteger(Options.Length)
    const end = TimeUtil.getTime(Date.now(), 'America/Los_Angeles')
        .add(duration, 'days').set('hour', 23).set('minute', 59).set('second', 0)
    const tourney = await interaction.client.bracket.getTournament()

    const resolveParticipant = (id) => tourney.participants[id];
    const participantUserId = (id) => resolveParticipant(id).misc;
    const participantName = (id) => resolveParticipant(id).name;

    const matches = Object.values(tourney.matches).filter(m => m.round === round && m.player1_id && m.player2_id)
    const existing = (await interaction.client.database.matches.sqlFetch()).map(m => m.match_id)
    const newMatches = matches.filter(m => !existing.includes(m.id) && resolveParticipant(m.player1_id) && resolveParticipant(m.player2_id))

    const parent = interaction.client.getConfigValue(interaction.guildId, 'tourney_match_category', interaction.channel?.parentId) || null
    const channels = await categoryLimitSafeCreate(
        interaction.guild, parent,
        newMatches.map(m => ({ 
            name: `${participantName(m.player1_id)}-vs-${participantName(m.player2_id)}`
                .toLowerCase().replace(/[^a-zA-Z0-9]/g, '').substring(0, 32),
            permissionOverwrites: [m.player1_id, m.player2_id]
                .map(p => ({ id: participantUserId(p), allow: CHANNEL_PERMISSIONS, type: OverwriteType.Member }))
                .concat({ id: interaction.guildId, deny: CHANNEL_PERMISSIONS })
        }))
    )

    try {
        const matches = await interaction.client.database.matches.call(
            'add', [
                JSON.stringify(newMatches.filter((_, i) => channels[i]).map((m, i) => [m.id, channels[i].id, 
                resolveParticipant(m.player1_id).misc, resolveParticipant(m.player2_id).misc])),
                interaction.guildId
            ]
        )
        await Promise.all(
            matches.map(
                (m, i) => channels[i]?.send(m.getIntroMessage(interaction.i18n, round, Math.floor(end.valueOf()/1000)))
                    ?.catch(err => console.warn(`Unable to send message in ${channels[i]?.id}: ${err}!`))
            )
        )
    }catch (err) {
        console.error('Tourney Start Aborted', err)
        await interaction.editReply('An error occured, forcing me to abort.').catch(() => null)
        await Promise.all(channels.map(v => v?.delete()?.catch(() => null)))
        return interaction.editReply('Successfully aborted.').catch(() => null)
    }

    await interaction.editReply(`${channels.filter(v => v).length}/${channels.length} channels created.\n**Round ${round} was started!**`)
}

/** @type {import("./lib/types").BotCommand} */
module.exports = {
    command: new LocalizedSlashCommandBuilder()
        .addSubcommand(
            new LocalizedSlashCommandSubcommandBuilder()
                .setNameAndDescription('commands.tourney.start')
                .addIntegerOption(
                    o => o
                        .setName(Options.Round)
                        .setMinValue(1).setMaxValue(100).setRequired(true)
                        .setNameAndDescription('commands.tourney.round_option')
                )
                .addIntegerOption(
                    o => o
                        .setName(Options.Length)
                        .setMinValue(1).setMaxValue(100).setRequired(true)
                        .setNameAndDescription('commands.tourney.length_option')
                )
        )
        .addSubcommand(
            new LocalizedSlashCommandSubcommandBuilder()
                .setNameAndDescription('commands.tourney.score')
                .addIntegerOption(
                    o => o
                        .setRequired(true)
                        .setNameAndDescription('commands.tourney.game_score_option', 1)
                )
                .addIntegerOption(
                    o => o
                        .setRequired(true)
                        .setNameAndDescription('commands.tourney.game_score_option', 2)
                )
                .addIntegerOption(
                    o => o
                        .setRequired(true)
                        .setNameAndDescription('commands.tourney.game_score_option', 3)
                )
                .addIntegerOption(
                    o => o
                        .setRequired(true)
                        .setNameAndDescription('commands.tourney.game_score_option', 4)
                )
        ).setNameAndDescription("commands.tourney"),
    config: { 
        permissions: { allowedPermissions: ['Administrator'] }, 
        forceGuild: true, defer: 'ephemeral_reply' 
    },
    handler: startTourneyCommand
}