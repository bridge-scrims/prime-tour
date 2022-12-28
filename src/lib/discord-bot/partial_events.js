const { Events, User, Message } = require("discord.js");
const EventEmitter = require("events");

class PartialSafeEventEmitter extends EventEmitter {

    constructor(bot) {

        super();

        Object.defineProperty(this, "bot", { value: bot })
        
        /** 
         * @readonly
         * @type {import("./bot")}
         */
        this.bot

        this.__addListeners()
        
    }

    __addListeners() {
        this.bot.on(Events.MessageCreate, (...a) => this.onMessage(...a).catch(console.error))
        this.bot.on(Events.MessageReactionAdd, (...a) => this.onReaction(...a, Events.MessageReactionAdd).catch(console.error))
        this.bot.on(Events.MessageReactionRemove, (...a) => this.onReaction(...a, Events.MessageReactionRemove).catch(console.error))
    }

    /** 
     * @param {Message|import("discord.js").PartialMessage} message  
     */
    async onMessage(message) {
        await this.resolvePartial(message)
        this.emit(Events.MessageCreate, message)
    }

    /**
     * @typedef MessageReactionData
     * @property {Message} message
     * @property {User} user
     */

    /**
     * @param {import("discord.js").PartialMessageReaction} reaction 
     * @param {User} user
     */
    async onReaction(reaction, user, event) {
        await this.resolvePartial(user)
        await this.resolvePartial(reaction.message)
        reaction.user = user
        this.emit(event, reaction)
    }

    async resolvePartial(obj) {
        if (obj.partial) await obj.fetch();
    }

}

/**
 * @typedef {import("discord.js").PartialMessageReaction & MessageReactionData} MessageReaction
 */

module.exports = PartialSafeEventEmitter;