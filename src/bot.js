const { GatewayIntentBits, ActivityType } = require("discord.js");

const ChallongeBracketClient = require("./lib/apis/challonge");
const DBClient = require("./lib/postgresql/database");
const ScrimsBot = require("./lib/discord-bot/bot");
const DBTable = require("./lib/postgresql/table");
const TournamentSignups = require("./sign-ups");
const PrimeTourSignUp = require("./sign-up");
const PrimeTourMatch = require("./match");

const tourneyCommand = require("./tourney_command");

/**
 * @typedef Base
 * @property {PrimeTourBot} client
 */

class PrimeTourBot extends ScrimsBot {

    /** @param {import('./config.example.json')} config */
    constructor(config) {

        const intents = []
        const presence = { status: "online", activities: [{ name: 'Season 2', type: ActivityType.Playing }]}

        super({ intents, presence, config, Database: PrimeTourBotDatabase });

        /** @type {PrimeTourBotDatabase} */
        this.database

        this.bracket = new ChallongeBracketClient(config.challonge_token, config.tourney_id)
        this.signups = new TournamentSignups(this, config)

        this.commands.add(tourneyCommand)

    }
    
}

class PrimeTourBotDatabase extends DBClient {

    constructor(...args) {
        super(...args);

        super._addTable("signups", new DBTable(this, 'scrims_prime_tour_2_signup', { lifeTime: -1 }, PrimeTourSignUp))
        super._addTable("matches", new DBTable(this, 'scrims_prime_tour_2_match', { lifeTime: -1 }, PrimeTourMatch))

        /** @type {DBTable<PrimeTourSignUp>} */
        this.signups
        
        /** @type {DBTable<PrimeTourMatch>} */
        this.matches

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
