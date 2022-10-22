const { Client } = require('pg');
const pgIPC = require('pg-ipc');

const { v4: uuidv4 } = require("uuid");

const TicketMessageAttachment = require('../scrims/ticket_message_attachment');
const DBSessionParticipant = require('../scrims/session_participant');
const GameParticipant = require('../scrims/game_participant');
const TicketMessage = require('../scrims/ticket_message');
const UserPosition = require('../scrims/user_position');
const PositionRole = require('../scrims/position_role');
const TicketStatus = require('../scrims/ticket_status');
const GuildEntry = require('../scrims/guild_entry');
const Suggestion = require('../scrims/suggestion');
const DBAttachment = require('../scrims/attachment');
const UserProfile = require('../scrims/user_profile');
const Position = require('../scrims/position');
const DBSession = require('../scrims/session');
const ScrimsVouch = require('../scrims/vouch');
const Ticket = require("../scrims/ticket");
const DBGuild = require('../scrims/guild');
const DBGame = require('../scrims/game');
const DBType = require('../scrims/type');

const SQLStatementCreator = require('./statements');
const { SQLQueryBuilder } = require('./query');
const DBTable = require('./table');

const EventEmitter = require('events');

class DBError extends Error {}
class DBClient extends EventEmitter {

    static Error = DBError

    constructor(config, bot=null) {

        super();
        Object.defineProperty(this, 'bot', { value: bot });

        /**
         * @type {?import('../discord-bot/bot')}
         * @readonly
         */
        this.bot

        this.connected = false
        
        const clientOptions = {
            user: config.username,
            password: config.password,
            host: config.hostname,
            port: config.port,
            database: config.database
        }

        this.client = new Client(clientOptions)
        this.client.on('error', error => console.error(`Postgresql: ${error}!`))

        this.ipcClient = new Client(clientOptions)
        this.ipcClient.on('error', error => console.error(`PG-IPC: ${error}!`))

        this.ipc = pgIPC(this.ipcClient)
        this.ipc.on('error', error => console.error(`PG-IPC: ${error}!`))

        /** @type {Object.<string, Object.<string, [string, string, string]>>} */
        this.foreigners = {}
        
        /** @type {Object.<string, string[]>} */
        this.uniqueKeys = {}

        /** @type {Object.<string, string[]>} */
        this.columns = {}

        this.queryBuilder = new SQLQueryBuilder()

        /** 
         * @protected
         * @type {DBTable[]} 
         */
        this._tables = []
        this.__addScrimsTables()
        
        /** @type {DBTable<DBGuild>} */
        this.guilds

        /** @type {DBTable<UserProfile>} */
        this.users

        /** @type {DBTable<Position>} */
        this.positions

        /** @type {DBTable<UserPosition>} */
        this.userPositions

        /** @type {DBTable<DBAttachment>} */
        this.attachments

        /** @type {DBTable<PositionRole>} */
        this.positionRoles

        /** @type {DBTable<DBType>} */
        this.guildEntryTypes

        /** @type {DBTable<GuildEntry>} */
        this.guildEntrys

        /** @type {DBTable<TicketMessage>} */
        this.ticketMessages

        /** @type {DBTable<TicketMessageAttachment>} */
        this.ticketMessageAttachments

        /** @type {DBTable<DBType>} */
        this.ticketTypes

        /** @type {DBTable<TicketStatus>} */
        this.ticketStatuses

        /** @type {DBTable<Ticket>} */
        this.tickets

        /** @type {DBTable<DBType>} */
        this.sessionTypes

        /** @type {DBTable<DBSession>} */
        this.sessions

        /** @type {DBTable<DBSessionParticipant>} */
        this.sessionParticipants

        /** @type {DBTable<Suggestion} */
        this.suggestions

        /** @type {ScrimsVouch.Table} */
        this.vouches

        /** @type {DBTable<DBType>} */
        this.gameTypes

        /** @type {DBTable<DBGame>} */
        this.games

        /** @type {DBTable<GameParticipant>} */
        this.gameParticipants

    }

    /** @private */
    __addScrimsTables() {

        this._addTable("guilds", new DBTable(this, 'scrims_guild', { lifeTime: -1 }, DBGuild))
        this._addTable("users", new DBTable(this, 'scrims_user', { lifeTime: -1 }, UserProfile))
        this._addTable("positions", new DBTable(this, "scrims_position", { lifeTime: -1 }, Position))
        this._addTable("attachments", new DBTable(this, "scrims_attachment", { lifeTime: -1 }, DBAttachment))

        this._addTable("userPositions", new DBTable(this, "scrims_user_position", {}, UserPosition))
        this._addTable("positionRoles", new DBTable(this, "scrims_position_role", { lifeTime: -1 }, PositionRole))

        this._addTable("guildEntryTypes", new DBTable(this, "scrims_guild_entry_type", { lifeTime: -1 }, DBType))
        this._addTable("guildEntrys", new DBTable(this, "scrims_guild_entry", { lifeTime: -1 }, GuildEntry))

        this._addTable("ticketMessages", new DBTable(this, "scrims_ticket_message", {}, TicketMessage))
        this._addTable("ticketMessageAttachments", new DBTable(this, "scrims_ticket_message_attachment", {}, TicketMessageAttachment))

        this._addTable("ticketTypes", new DBTable(this, 'scrims_ticket_type', { lifeTime: -1 }, DBType))
        this._addTable("ticketStatuses", new DBTable(this, 'scrims_ticket_status', { lifeTime: -1 }, TicketStatus))
        this._addTable("tickets", new DBTable(this, 'scrims_ticket', {}, Ticket))

        this._addTable("sessionTypes", new DBTable(this, "scrims_session_type", { lifeTime: -1 }, DBType))
        this._addTable("sessions", new DBTable(this, "scrims_session", { lifeTime: -1 }, DBSession))
        
        this._addTable("sessionParticipants", new DBTable(this, "scrims_session_participant", {}, DBSessionParticipant))
        this._addTable("suggestions", new DBTable(this, "scrims_suggestion", {}, Suggestion))
        
        this._addTable("vouches", new ScrimsVouch.Table(this))

        this._addTable("gameTypes", new DBTable(this, "scrims_game_type", { lifeTime: -1 }, DBType))
        this._addTable("games", new DBTable(this, "scrims_game", {}, DBGame))
        this._addTable("gameParticipants", new DBTable(this, "scrims_game_participant", {}, GameParticipant))

    }

    /** @protected */
    _addTable(key, table) {
        this._tables.push(table)
        this[key] = table
    }

    /** @private */
    async __fetchColumns(client) {
        const params = []
        const whereClause = new SQLStatementCreator({ table_schema: "public", table_catalog: client.database }).toWhereStatement(params)
        const columns = {}
        await client.query(`SELECT table_name, column_name FROM information_schema.columns AS this WHERE ${whereClause}`, params)
            .then(v => v.rows.forEach(v => (v.table_name in columns) ? columns[v.table_name].push(v.column_name) : columns[v.table_name] = [v.column_name]))
        return columns;
    }

    /** @private */
    async __fetchForeigners(client) {
        const foreigners = {} 
        await client.query(
            (`SELECT r.table_name, r.column_name, u.table_name as foreign_table, u.column_name as foreign_column `
            + `FROM information_schema.constraint_column_usage       u `
            + `INNER JOIN information_schema.referential_constraints fk `
                + `ON u.constraint_catalog = fk.unique_constraint_catalog `
                + `AND u.constraint_schema = fk.unique_constraint_schema `
                + `AND u.constraint_name = fk.unique_constraint_name `
            + `INNER JOIN information_schema.key_column_usage        r `
                + `ON r.constraint_catalog = fk.constraint_catalog `
                + `AND r.constraint_schema = fk.constraint_schema `
                + `AND r.constraint_name = fk.constraint_name `
            + `WHERE u.table_schema=$1 AND u.table_catalog=$2`), ["public", client.database]
        ).then(v => v.rows.forEach(v => {
            if (!foreigners[v.table_name]) foreigners[v.table_name] = {}
            const key = v.column_name.replaceAll("id_", "").replaceAll("_id", "")
            foreigners[v.table_name][key] = [v.column_name, v.foreign_table, v.foreign_column]
        }))
        return foreigners;
    }
    
    /** @private */
    async __fetchUniqueColumns(client) {
        const uniqueColumns = {} 
        await client.query(
            (`SELECT c.table_name, c.column_name `
            + `FROM information_schema.table_constraints             tc `
            + `JOIN information_schema.constraint_column_usage AS    cu `
                + `USING (constraint_schema, constraint_name) `
            + `JOIN information_schema.columns AS                    c `
                + `ON c.table_schema = tc.constraint_schema `
                + `AND tc.table_name = c.table_name `
                + `AND cu.column_name = c.column_name `
            + `WHERE tc.table_schema=$1 AND tc.constraint_catalog=$2 AND tc.constraint_type=$3`), 
            ["public", client.database, "PRIMARY KEY"]
        ).then(v => v.rows.forEach(v => {
            if (!uniqueColumns[v.table_name]) uniqueColumns[v.table_name] = []
            uniqueColumns[v.table_name].push(v.column_name)
        }))
        return uniqueColumns;
    }

    async connect() {

        if (!this.connected) {
            await this.client.connect()
            await this.ipcClient.connect()
        }

        this.columns = await this.__fetchColumns(this.client)
        this.foreigners = await this.__fetchForeigners(this.client)
        this.uniqueKeys = await this.__fetchUniqueColumns(this.client)

        for (const table of this._tables) await table.connect()

        if (!this.connected) {
            this.connected = true
            this.emit("connected")
        }

    }

    generateUUID() {
        return uuidv4();
    }

    async destroy() {
        await this.ipc?.end()
        await this.ipcClient?.end()
        await this.client?.end()
    }
 
    /**
     * @param {string} functionName 
     * @param {Object.<string, any>|Array.<string>} [parameters] 
     */
    async call(functionName, parameters) {
        const query = this.queryBuilder.buildFunctionCall(functionName, parameters)
        const result = await this.query(...query)
        return result.rows?.[0]?.[functionName] ?? null;
    }

    /**
     * @param {(any[] | string)[]} query 
     */
    async query(...query) {
        try {
            const result = await this.client.query(
                query.filter(v => (typeof v === "string")).join(" "), 
                query.filter(v => v instanceof Array).flat()
            )
            if (result.fields && result.rows) {
                const bigintColumns = result.fields.filter(f => f.dataTypeID === 20).map(v => v.name)
                for (const row of result.rows) {
                    for (const column of bigintColumns) {
                        const num = parseInt(row?.[column])
                        if (Number.isSafeInteger(num)) row[column] = num
                    }
                } 
            }
            return result;
        }catch (err) {
            throw new DBError(err?.message)
        }
    }
  
}

module.exports = DBClient;