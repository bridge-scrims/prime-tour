const { Client } = require('pg');
const fs = require('fs/promises');
const path = require('path');

const ASSETS = path.join('src', 'assets')
const config = require("./config.json").database;

async function create() {
    const client = new Client({
        user: config.username,
        password: config.password,
        host: config.hostname,
        port: config.port,
        database: config.database
    })

    await client.connect()
    client.on('error', error => console.error(`Postgresql: ${error}!`))

    try {
        await client.query(await fs.readFile(path.join(ASSETS, 'database.pgsql'), { encoding: 'utf8' }))
    }finally {
        await client.end()
    }    
}

module.exports = create;