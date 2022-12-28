const { SlashCommandBuilder } = require("discord.js")

/**
 * @param {import('../../types').ScrimsChatInputCommandInteraction} interaction
 */
async function onPingCommand(interaction) {
	await interaction.editReply({ content: "pong" })
}

/** @type {import('../../types').BotCommand} */
module.exports = {
    command: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Used to test the bots connection."),
    handler: onPingCommand,
    config: {
        forceGuild: false, forceScrimsUser: false, defer: 'ephemeral_reply'
    }
}