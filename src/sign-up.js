const MojangClient = require("./lib/middleware/mojang");
const TableRow = require("./lib/postgresql/row");
const MessageOptionsBuilder = require("./lib/tools/payload_builder");
const TimeUtil = require("./lib/tools/time_util");

class PrimeTourSignUp extends TableRow {

    constructor(client, signupData) {

        super(client, signupData)

        /** @type {string} */
        this.user_id

        /** @type {string} */
        this.mc_uuid

        /** @type {string} */
        this.timezone

        /** @type {string} */
        this.joined

    }

    /** @param {string|import('./lib/scrims/user_profile')|import('discord.js').User|null} user */
    setUser(user) {
        this.closer_id = user?.user_id ?? user?.id ?? user
        return this;
    }

    get user() {
        if (!this.bot) return null;
        return this.bot.users.resolve(this.user_id);
    }

    get userProfile() {
        return this.client.users.cache.find(this.user_id);
    }

    /** @param {string} uuid */
    setMCUUID(uuid) {
        this.mc_uuid = uuid
        return this;
    }

    /** @param {string} timezone */
    setTimezone(timezone) {
        this.timezone = timezone
        return this;
    }

    /** @param {string} joined */
    setJoined(joined) {
        this.joined = joined
        return this;
    }

    async getMCUsername() {
        return MojangClient.fetchName(this.mc_uuid)
    }

    getUTCOffset() {
        return TimeUtil.stringifyOffset(this.timezone);
    }

    mcHeadURL() {
        return `https://mc-heads.net/head/${this.mc_uuid}/left`;
    }

    async asMessage() {
        const mcName = await this.getMCUsername().catch(() => null) || '*Unknown*'
        return new MessageOptionsBuilder()
            .addEmbeds(
                e => e
                    .setTitle('You are Signed-Up!')
                    .setColor(this.COLORS.BrightSeaGreen)
                    .setDescription('You will be mentioned about any information regarding the tournament.')
                    .setThumbnail(this.mcHeadURL())
                    .addFields(
                        { name: 'Discord', value: `${this.user}`, inline: true },
                        { name: 'Minecraft', value: `${mcName}`, inline: true },
                        { name: 'Timezone', value: `UTC ${this.getUTCOffset()}`, inline: true }
                    )
            ).setEphemeral(true)
    }

}

module.exports = PrimeTourSignUp;