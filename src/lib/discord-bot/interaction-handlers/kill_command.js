const MessageOptionsBuilder = require('../../tools/payload_builder');
const { LocalizedSlashCommandBuilder } = require('../tools/localized_builders');

const Options = {
    ExitCode: 'exit_code'
}

/** @param {import('../../types').ScrimsChatInputCommandInteraction} interaction */
async function onKillCommand(interaction) {
	await interaction.return(new MessageOptionsBuilder().setContent('👋 **Goodbye**').setEphemeral(true)).catch(console.error)
	console.log(`Kill command used by ${interaction.user.tag} to terminate this process!`)
	await interaction.client.destroy()
    process.exit(interaction.options.get(Options.ExitCode)?.value ?? 1)
}

/** @type {import('../types').BotCommand} */
module.exports = {
    command: new LocalizedSlashCommandBuilder()
        .setNameAndDescription('commands.kill')
        .addIntegerOption(
            o => o
                .setRequired(false)
                .setName(Options.ExitCode)
                .setNameAndDescription('commands.kill.exit_option')
        ),
    handler: onKillCommand,
    config: {
        permissions: { positionLevel: "owner", allowedUsers: ["568427070020124672"] }
    }
}