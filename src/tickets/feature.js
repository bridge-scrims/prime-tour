const { command: ticketCommand } = require('./ticket_command');

class TicketsFeature {

    constructor(bot) {

        Object.defineProperty(this, 'bot', { value: bot })
        
        /** 
         * @type {import("./bot")} 
         * @readonly
         */
        this.bot

        this.bot.commands.add(ticketCommand)

    }

    get database() {
        return this.bot.database;
    }

}

module.exports = TicketsFeature;