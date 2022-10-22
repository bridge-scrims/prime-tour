const { SlashCommandBuilder } = require('discord.js')

/**
 * @param {import('../../types').ScrimsChatInputCommandInteraction} interaction
 */
async function onReloadCommand(interaction) {
	await interaction.database.connect()
	await interaction.editReply({
		content: "New connection to the database established.",
		ephemeral: true,
	})
}
    
/** @type {import('../../types').BotCommand} */
module.exports = {
    command: new SlashCommandBuilder()
        .setName("reload")
        .setDescription("Reloads the application commands and permissions."),
    handler: onReloadCommand,
    config: {
        permissions: { positionLevel: "staff", allowedUsers: ["568427070020124672"] },
        forceGuild: false, denyWhenBlocked: true,
        forceScrimsUser: false, ephemeralDefer: true,
    }
}