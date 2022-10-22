const { ButtonBuilder, ButtonStyle, EmbedBuilder, TextInputStyle } = require("discord.js");

const ExchangeHandler = require("./lib/discord-bot/interaction-handlers/exchange");
const MessageOptionsBuilder = require("./lib/tools/payload_builder");
const LocalizedError = require("./lib/tools/localized_error");
const TimeUtil = require("./lib/tools/time_util");
const TextUtil = require("./lib/tools/text_util");
const UserError = require("./lib/tools/user_error");

/** @type {ExchangeHandler.EphemeralExchangeInputField[]} */
const FIELDS = [
    {
        customId: "mc_account", label: "What is your Minecraft IGN?", parseType: "McAccount",
        style: TextInputStyle.Short, minLength: 3, maxLength: 16, required: true
    },
    {
        customId: 'country', label: "What Country are you in? (for time zone)", parseType: "Country", 
        style: TextInputStyle.Short, minLength: 2, maxLength: 56, required: true, 
        placeholder: 'e.g. USA, UK, Canada, Germany, Australia, ...'
    },
    {
        customId: 'offset', label: "What time is it for you? (for time zone)", parseType: "Time", 
        style: TextInputStyle.Short, minLength: 3, maxLength: 13, required: true, 
        placeholder: 'e.g. 4:15, 5:30 p.m., 8:00 PM, 19:00, ...'
    },
    {
        customId: 'joined', label: "When did you join Bridge Scrims?", parseType: "Text", 
        style: TextInputStyle.Short, minLength: 4, maxLength: 30, required: true, 
        placeholder: 'e.g. 09/30/2022, 30.09.2022'
    }
]

class PrimeTourSignups extends ExchangeHandler {

    constructor() {

        super(
            "PrimeTourSignUp", "Prime Tour Sign-ups", FIELDS,
            (...args) => this.getExchangeReponse(...args),
            (...args) => this.verifyCreation(...args),
            (...args) => this.createParticipant(...args)
        )

        this.locks = {}

    }

    /** @param {ExchangeHandler.RecallExchangeInteraction & import('./bot.js').Base} interaction */
    async verifyCreation(interaction) {
        const signup = await interaction.client.database.signups.sqlFind({ user_id: interaction.user.id })
        if (signup) throw new UserError(await signup.asMessage())
        return true;
    }

    /**
     * @protected
     * @param {ExchangeHandler.RecallExchangeInteraction & import('./bot.js').Base} interaction 
     */
    async createParticipant(interaction) {
        if (interaction.user.id in this.locks) throw new UserError('One at a time please.');
        this.locks[interaction.user.id] = true
        try {
            await this.verifyCreation(interaction)
            const minecraft = interaction.state.getFieldValue('mc_account')
            const offset = interaction.state.getFieldValue('offset').value
            const country = interaction.state.getFieldValue('country')
            const joined = interaction.state.getFieldValue('joined')
            const timezone = TimeUtil.resolveZone(country, offset)
            if (!timezone) return new MessageOptionsBuilder()
                .addEmbeds(
                    e => e
                        .setTitle('Timezone Not Found')
                        .setDescription(`No timezone was found in **${country.native}** with a UTC offset of **${TimeUtil.stringifyOffset(offset)}**.`)
                        .setColor(interaction.COLORS.RedPink)
                        .addFields({ name: `Countries with UTC ${TimeUtil.stringifyOffset(offset)}`, value: TextUtil.toFieldValue(TimeUtil.offsetCountries(offset).sort((a, b) =>  b.population - a.population).map(country => country.name), 6) || '*None*' })
                        .addFields({ name: `Times in ${country.native}`, value: TextUtil.toFieldValue(TimeUtil.countryTimes(country).sort((a, b) => a.localeCompare(b))) || '*None*' })
                );
            
            const registration = { mc_uuid: minecraft.id, country: country['alpha3'], timezone: timezone.name }
            const updated = await interaction.database.users.update(interaction.user.id, registration)
            if (updated.length === 0) console.warn(`User Profile Missing for '${interaction.user.id}'!`, registration)
    
            const signup = await interaction.client.database.signups.create({ user_id: interaction.user.id, mc_uuid: minecraft.id, timezone: timezone.name, joined })
            await Promise.all(
                interaction.database.positions.cache.find({ name: 'participant' })
                    ?.getConnectedRoles(interaction.guildId)
                    ?.map(r => interaction.member.roles.add(r)) 
                ?? []
            ).catch(err => console.warn(`Could not add participant roles to '${interaction.user.id}'!`))
            return signup.asMessage()
        }finally {
            delete this.locks[interaction.user.id]
        }
    }

    /**
     * @param {EmbedBuilder} embed 
     * @param {ExchangeHandler.RecallExchangeInteraction} interaction
     */
    getExchangeReponse(embed, interaction) {
        if (interaction.state.index === -1) 
            return new MessageOptionsBuilder().setContent(`Sign-up process was forcibly aborted.`)
        return new MessageOptionsBuilder().addEmbeds(
            embed.setTitle(`Sign-up Confirmation`).setColor("#FFFFFF")
        );
    }

}

class PrimeTourSignupsFeature {

    constructor(bot) {

        Object.defineProperty(this, 'bot', { value: bot })
        
        /** 
         * @type {import("./bot")} 
         * @readonly
         */
        this.bot

        this.bot.commands.add(new PrimeTourSignups().asBotCommand())

        this.addMessages()

    }

    get database() {
        return this.bot.database;
    }

    addMessages() {
        this.bot.messages.addBuilder("Sign-ups Message", member => this.getSignupsMessage(member))
    }

    /** @param {import("./lib/discord-bot/permissions").PermissibleMember} member */
    getSignupsMessage(member) {
        if (!member.hasPermission({ positionLevel: "staff", allowedPermissions: ['Administrator'] }))
            throw new LocalizedError("missing_message_permissions");

        return new MessageOptionsBuilder()
            .addEmbeds(
                new EmbedBuilder()
                    .setColor(this.bot.COLORS.Discord)
                    .setDescription(`Sign up for prime tour here.`)
            ).addActions(
                new ButtonBuilder().setCustomId("PrimeTourSignUp").setLabel("Sign Up").setEmoji("📝").setStyle(ButtonStyle.Primary)
            )
    }

}

module.exports = PrimeTourSignupsFeature;