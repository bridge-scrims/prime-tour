'use strict';

const SupportBot = require("./bot.js");
const Config = require('./config.json');

const createDatabase = require("./create-db.js");
const setupLog = require("./logging.js");

function terminate(bot) {

    console.log('shutdown signal received');
    bot.destroy();
    process.exit(0);

}

async function run() {

    // Will also effect the normal console output, so this should not be used during development.
    if (!Config.testing) await setupLog()

    await createDatabase()
    const bot = new SupportBot(Config)
    await bot.login()

    process.on('SIGINT', () => terminate(bot));
    process.on('SIGTERM', () => terminate(bot));

}

run().catch(error => {

    console.log(error)
    process.exit(-1)
    
})