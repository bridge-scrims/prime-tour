const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder, InteractionType, ButtonStyle, SlashCommandStringOption, User } = require('discord.js');
const LocalizedError = require('../lib/tools/localized_error');
const { default: parseDuration } = require("parse-duration");
const Ticket = require('../lib/scrims/ticket');
const TicketManager = require('./tickets');

const Options = {
    Action: "action",
    Reason: "reason",
    Timeout: "timeout",
    User: "user",
    Role: "role"
}

const subCommands = {
    permissions: onTicketPermissionsCommand,
    closeResponse: onTicketCloseResponse,
    delete: onTicketDeleteCommand,
    close: onTicketCloseCommand
}

/** @param {import('../lib/types').ScrimsInteraction} interaction */
async function onTicketCommand(interaction) {

	const handler = subCommands[interaction.subCommandName]
	if (!handler) throw new Error(`Subcommand with name '${interaction.subCommandName}' does not have a handler!`)

    const { ticket, ticketManager } = await TicketManager.findTicket(interaction)

    if (interaction.subCommandName !== "closeResponse" && !interaction.userHasPermissions(ticketManager.permissions))
        throw new LocalizedError("tickets.unauthorized_manage", ticket.type.name)

    await handler(interaction, ticketManager, ticket)
    
}

/** @type {Object.<string, [boolean, import('discord.js').PermissionResolvable[]]} */
const ActionPermissions = {
    added: [true, ["ViewChannel", "SendMessages", "ReadMessageHistory"]],
    removed: [false, ["ViewChannel", "SendMessages", "ReadMessageHistory"]],
    muted: [false, ["SendMessages"]],
    unmuted: [true, ["SendMessages"]]
}

/**
 * @param {import('../lib/types').ScrimsChatInputCommandInteraction} interaction 
 * @param {TicketManager} ticketManager 
 * @param {Ticket} ticket 
 */
async function onTicketPermissionsCommand(interaction, ticketManager, ticket) {
    
    const action = interaction.options.getString(Options.Action, true)
    const [allow, permissions] = ActionPermissions[action]

    const user = interaction.options.getUser(Options.User)
    const role = interaction.options.getRole(Options.Role)

    /** @type {import('discord.js').TextChannel} */
    const channel = interaction.channel
    const target = user ?? role ?? interaction.guild.roles.everyone
    const currentPerms = channel.permissionsFor(target.id, true)

    const hasPermissions = (currentPerms && permissions.every(v => currentPerms.has(v, true)))
    const correctState = allow ? hasPermissions : !hasPermissions
    if (correctState) throw new LocalizedError("tickets.permissions_already_correct", `${target}`)
    await channel.permissionOverwrites.edit(target.id, Object.fromEntries(permissions.map(perm => [perm, allow])))
    await interaction.reply({ content: interaction.i18n.get("tickets.permissions_updated", `${interaction.user}`, `${target}`), allowedMentions: { parse: [] } })

}

/**
 * @param {import('../lib/types').ScrimsChatInputCommandInteraction} interaction 
 * @param {TicketManager} ticketManager 
 * @param {Ticket} ticket 
 */
async function onTicketDeleteCommand(interaction, ticketManager, ticket) {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) 
        return onTicketReasonAutocomplete(interaction, ticketManager);
    const reason = interaction.options.getString(Options.Reason)
    await ticketManager.closeTicket(ticket, interaction.user, interaction.user, "had this ticket deleted", reason)
}

/** 
 * @param {import('../lib/types').ScrimsAutocompleteInteraction} interaction 
 * @param {TicketManager} ticketManager 
 */
async function onTicketReasonAutocomplete(interaction, ticketManager) {
    const focused = interaction.options.getFocused()
    await interaction.respond(
        ticketManager.commonCloseReasons
            .filter(reason => reason.toLowerCase().includes(focused.toLowerCase())).slice(0, 25)
            .map(reason => ({ name: reason, value: reason }))
    )
}

/**
 * @param {import('../lib/types').ScrimsChatInputCommandInteraction} interaction 
 * @param {TicketManager} ticketManager 
 * @param {Ticket} ticket 
 */
async function onTicketCloseCommand(interaction, ticketManager, ticket) {

    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) return onTicketReasonAutocomplete(interaction, ticketManager);

    const reason = interaction.options.getString(Options.Reason)
    const timeout = interaction.options.getString(Options.Timeout)

    if (ticket.user_id === interaction.user.id) {
        // Creator wants to close the ticket, so close it
        await interaction.reply({ content: `Ticket closing...` })
        return ticketManager.closeTicket(ticket, interaction.user, interaction.user, `closed this ticket`, reason)
    }

    if (timeout) { 
        const duration = parseDuration(timeout)
        if (!duration || duration <= 0 || duration > (30*24*60*60*1000)) throw new LocalizedError("tickets.invalid_timeout");
        
        const message = await interaction.reply({ ...getCloseRequestMessage(ticket, interaction.user, reason, duration), fetchReply: true })
        const closeCall = () => ticketManager.closeTicket(ticket, interaction.user, interaction.user, `had this ticket deleted automatically after ${timeout}`, reason).catch(console.error)
        ticketManager.closeRequestTimeouts[message.id] = setTimeout(closeCall, duration)
        const existing = ticketManager.closeRequests[ticket.id_ticket] ?? []
        ticketManager.closeRequests[ticket.id_ticket] = [message.id, ...existing]
    }else {
        await interaction.reply(getCloseRequestMessage(ticket, interaction.user, reason))
    }

}

/**
 * @param {import('../lib/types').ScrimsComponentInteraction} interaction 
 * @param {TicketManager} ticketManager 
 * @param {Ticket} ticket 
 */
async function onTicketCloseResponse(interaction, ticketManager, ticket) {

    const [_, requesterId, action] = interaction.args
    const requester = interaction.client.users.cache.get(requesterId)

    const fields = interaction.message.embeds[0]?.fields
    const reason = fields ? fields.find(field => field.name === 'Reason')?.value?.replace(/```/g, '') : null

    if (action === "FORCE" && interaction.userHasPermissions(ticketManager.permissions)) {
        await interaction.message.edit({ content: `Ticket closing...`, embeds: [], components: [] })
        await ticketManager.closeTicket(ticket, requester ?? interaction.user, interaction.user, `force closed this ticket using the request from @${requester?.username ?? "unknown-user"}`, reason)
    }

    if (interaction.user.id !== ticket.user_id)
        throw new LocalizedError("tickets.creator_only", `${ticket.user}`)

    if (action === "DENY") {
        await interaction.message.edit({ content: `*Close request from <@${requesterId}> denied.*`, embeds: [], components: [] })
        await interaction.message.reply(`<@${requesterId}> your close request was denied by ${interaction.user}.`)
    }

    if (action === "ACCEPT") {
        await interaction.message.edit({ content: `Ticket closing...`, embeds: [], components: [] })
        await ticketManager.closeTicket(ticket, requester, interaction.user, `accepted the close request from @${requester?.tag ?? "unknown-user"}`, reason)
    }

}

/**
 * @param {Ticket} ticket 
 * @param {User} requester 
 */
function getCloseRequestMessage(ticket, requester, reason, timeout) {
    
    const timeoutText = (timeout ? ` If you do not respond with **<t:${Math.floor((Date.now() + timeout)/1000)}:R> this ticket will close anyway**.` : "")
    const embed = new EmbedBuilder()
        .setColor(ticket.COLORS.Discord)
        .setTitle("Can we close this?")
        .setDescription(`${requester} would like to close this ticket. Please let us know, if you feel the same way, with the buttons below.${timeoutText}`)
    if (reason) embed.addFields({ name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: false })
    
    const actions = new ActionRowBuilder()
        .addComponents([
            new ButtonBuilder()
                .setCustomId(`ticket/closeResponse/${requester.id}/ACCEPT`)
                .setLabel("Close This")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`ticket/closeResponse/${requester.id}/DENY`)
                .setLabel("We aren't Done Here")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`ticket/closeResponse/${requester.id}/FORCE`)
                .setLabel("Force Close")
                .setStyle(ButtonStyle.Danger)
        ])

    return { content: `${ticket.user}`, embeds: [embed], components: [actions] };

}

function buildTicketPermissionsSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setName("permissions")
        .setDescription("Manage the permissions of a ticket channel with this command.")
        .addStringOption(option => (
            option
                .setName(Options.Action)
                .setDescription("What would you like to do about the ticket channel permissions?")
                .setRequired(true)
                .addChoices(
                    { name: "Add User/Role", value: "added" }, 
                    { name: "Remove User/Role", value: "removed" },
                    { name: "Mute User/Role/Everyone (if no user or role is provided everyone will be muted)", value: "muted" }, 
                    { name: "Unmute User/Role/Everyone (if no user or role is provided everyone will be unmuted)", value: "unmuted" }, 
                )
        ))
        .addUserOption(option => (
            option
                .setName(Options.User)
                .setDescription("The user you would like to do the action with.")
                .setRequired(false)
        ))
        .addRoleOption(option => (
            option
                .setName(Options.Role)
                .setDescription("The role you would like to do the action with.")
                .setRequired(false)
        ))
}

function buildCloseReasonOption() {
    return new SlashCommandStringOption()
        .setName(Options.Reason)
        .setDescription('The reason for this request.')
        .setAutocomplete(true)
        .setRequired(false)
}

function buildTicketCloseSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setName("close")
        .setDescription("Use this command to request a ticket be deleted.")
        .addStringOption(buildCloseReasonOption())
        .addStringOption(option => (
            option
                .setName(Options.Timeout)
                .setDescription('Time until this ticket should auto close (e.g. 1d 20hours 3min).')
                .setRequired(false)
        ))
}

function buildTicketDeleteSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setName("delete")
        .setDescription("Use this command to delete a ticket.")
        .addStringOption(buildCloseReasonOption())
}

/** @returns {import('../lib/types').BotCommand} */
function buildTicketCommand() {
    return {
        command: (
            new SlashCommandBuilder()
                .setName("ticket")
                .setDescription("All commands related to tickets.")
                .addSubcommand(buildTicketPermissionsSubcommand())
                .addSubcommand(buildTicketDeleteSubcommand())
                .addSubcommand(buildTicketCloseSubcommand())
        ),
        config: { forceGuild: true },
        handler: onTicketCommand
    } 
}

module.exports = {
    command: buildTicketCommand(),
    getCloseRequestMessage,
    onTicketCloseCommand,
    onTicketCloseResponse,
    onTicketCommand,
    onTicketDeleteCommand,
    onTicketPermissionsCommand,
    onTicketReasonAutocomplete,
    Options,
    ActionPermissions
}