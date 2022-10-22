const MessageOptionsBuilder = require('../../tools/payload_builder');
const { LocalizedSlashCommandBuilder } = require('../tools/localized_builders');

/** @param {import('../../types').BotCommandInteraction} interaction */
async function onKillCommand(interaction) {
	await interaction.return(new MessageOptionsBuilder().setContent('👋 **Goodbye**').setEphemeral(true)).catch(console.error)
	console.log(`Kill command used by ${interaction.user.tag} to terminate this process!`)
	await interaction.client.destroy()
    process.exitCode = 1
    process.exit(1) // Exit with error code 1 so it restarts
}

/** @type {import('../types').BotCommand} */
module.exports = {
    command: new LocalizedSlashCommandBuilder().setNameAndDescription('commands.kill'),
    handler: onKillCommand,
    config: {
        permissions: { positionLevel: "owner", allowedUsers: ["568427070020124672"] }
    }
}