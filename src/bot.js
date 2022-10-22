const { GatewayIntentBits, ActivityType } = require("discord.js");
const DBClient = require("./lib/postgresql/database");
const ScrimsBot = require("./lib/discord-bot/bot");
const PrimeTourSignupsFeature = require("./sign-ups");
const ChallongeBracketClient = require("./lib/middleware/challonge");
const DBTable = require("./lib/postgresql/table");
const PrimeTourSignUp = require("./sign-up");

/**
 * @typedef Base
 * @property {PrimeTourBot} client
 */

class PrimeTourBot extends ScrimsBot {

    constructor(config) {

        const intents = [ 
            GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates, 
            GatewayIntentBits.GuildPresences
        ]
        const presence = { status: "online", activities: [{ name: 'your sign-ups', type: ActivityType.Watching }]}

        super({ intents, presence, config, Database: PrimeTourBotDatabase });

        /** @type {PrimeTourBotDatabase} */
        this.database

        this.servesHost = true
        this.bracket = new ChallongeBracketClient(config.challonge_token, 11841727)
        this.signups = new PrimeTourSignupsFeature(this, config)

    }
    
}

class PrimeTourBotDatabase extends DBClient {

    constructor(...args) {
        super(...args);

        this._addTable("signups", new DBTable(this, 'scrims_prime_tour_2_signup', { lifeTime: -1 }, PrimeTourSignUp))

        /** @type {DBTable<PrimeTourSignUp>} */
        this.signups
        
    }

    /**
     * @override
     * @protected
     */
    _addTable(key, table) {
        // Only initialize certain tables
        if (['guild', 'user', 'position'].some(v => table.name.includes(v))) 
            return super._addTable(...arguments);
        this[key] = table
    }

}

module.exports = PrimeTourBot;
