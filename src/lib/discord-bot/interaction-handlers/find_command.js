const { escapeBold } = require('discord.js')
const { LocalizedSlashCommandBuilder } = require('../tools/localized_builders')
const MessageOptionsBuilder = require('../../tools/payload_builder')
const LocalizedError = require('../../tools/localized_error')
const UserProfile = require('../../scrims/user_profile')
const TextUtil = require('../../tools/text_util')

const Options = {
    Resolvable: "user_resolvable",
    CaseSensitive: "case_sensitive"
}

/**
 * @param {import('../../types').ScrimsChatInputCommandInteraction} interaction
 */
async function onCommand(interaction) {
	const resolvable = interaction.options.getString(Options.Resolvable)
    const caseSensitive = interaction.options.getBoolean(Options.CaseSensitive) || true

    const operator = (caseSensitive ? 'LIKE' : 'ILIKE')
	const databaseProfiles = await interaction.database.users.query(
        `SELECT * FROM ${interaction.database.users}`,
        `WHERE (username || '#' || lpad(discriminator::text, 4, '0')) ${operator} $1`,
        `OR (username ${operator} $1) OR (user_id = $1)`,
        `ORDER BY (username || '#' || discriminator) ASC LIMIT 100`,
        [resolvable]
    )

	const memberProfiles = []
	if (interaction.guild) {
		memberProfiles.push(
            ...interaction.guild.members.cache.filter(
			    (m) => (caseSensitive ? (m.displayName === resolvable) : (m.displayName.toLowerCase() === resolvable.toLowerCase()))
            ).map(m => UserProfile.resolve(m))
        )
	}

	if ((memberProfiles.length + databaseProfiles.length) === 0) throw new LocalizedError("commands.find.none")

	const permissions = await interaction.client.permissions.fetchData()
	const profiles = databaseProfiles
		.sort(UserProfile.sortByPermissions(permissions))
		.concat(memberProfiles.sort(UserProfile.sortByPermissions(permissions)))
		.filter(user => user?.tag)

	if (profiles.length <= 5) {
        await interaction.editReply(
            new MessageOptionsBuilder()
                .setContent(profiles.map(p => p.getMember(interaction.guild)).filter(v => v).join(" "))
                .addEmbeds(...profiles.map(p => p.toEmbed(permissions, interaction.guild)))
                .removeMentions()
        )
    }else {
        await interaction.editReply(
            new MessageOptionsBuilder()
                .addEmbeds(
                    e => e
                        .setTitle('Multiple Results')
                        .setDescription(TextUtil.reduceArray(profiles.map(p => `• **${escapeBold(p.tag)}** (${p.user_id})`), 3500))
                )
        )
    }
}

/** @type {import('../../types').BotCommand} */
module.exports = {
    command: new LocalizedSlashCommandBuilder()
        .setNameAndDescription('commands.find')
        .addStringOption(
            (o) => o
                .setNameAndDescription('commands.find.user_option')
                .setName(Options.Resolvable)
                .setRequired(true)
        )
        .addBooleanOption(
            (o) => o
                .setNameAndDescription('commands.find.case_option')
                .setName(Options.CaseSensitive)
                .setRequired(false)
        ),
    handler: onCommand,
    config: {
        permissions: { positionLevel: "support" },
        forceGuild: false, defer: 'reply'
    }
}