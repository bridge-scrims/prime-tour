const LocalizedError = require('../tools/localized_error');
const MiddlewareCache = require('./cache');
const got = require('got');

const sleep = seconds => new Promise(r => setTimeout(r, seconds*1000));

class HypixelAPIError extends LocalizedError {
    constructor(externalFault, ...args) {
        super(...args);
        this.externalFault = externalFault
    }
}

const SERVER = 'api.hypixel.net'
const TIMEOUT = 7000

class HypixelClient {

    static Error = HypixelAPIError;
    static unavailable = false;

    /** @param {string} apitoken */
    constructor(apitoken) {

        /** 
         * @type {string} 
         * @readonly
         */
        this.apitoken
        Object.defineProperty(this, 'apitoken', { value: apitoken });

        /** 
         * @protected 
         * @type {number|null}
         */
        this.throttling = null

        /** 
         * @type {HypixelPlayers} 
         * @readonly
         */
        this.players
        Object.defineProperty(this, 'players', { value: new HypixelPlayers(this) });

    }

    throttleTimeRemaining() {
        if (!this.throttling) return null;
        return (this.throttling - (Date.now()/1000));
    }

    buildURL(endpoint, params) {
        params = Object.entries(params).map(([key, value]) => `&${key}=${value}`);
        return `https://${SERVER}/${endpoint}?key=${this.apitoken}${params}`; 
    }

    async hypixelRequest(endpoint, params) {
        const url = this.buildURL(endpoint, params)
        if (this.throttling) {

            if ((this.throttleTimeRemaining() < TIMEOUT/1000))
                return this.runAfterThrottling(() => this.hypixelRequest(...arguments));

            throw new HypixelAPIError(true, "middleware.throttling", "Hypixel API");

        }
        return this.hypixelAPIFetch(url);
    }

    /** 
     * @protected 
     * @returns {Promise<import('got').Response<Object.<string, any>>>}
     */
    async hypixelAPIFetch(url) {
        const response = await got(url, { timeout: TIMEOUT, responseType: 'json', retry: 0, cache: false }).catch(error => this.onError(error))
        HypixelClient.unavailable = false
        return response;
    }

    /** @protected */
    async onError(error) {
        if (error instanceof got.TimeoutError) throw new HypixelAPIError(true, "middleware.timeout", "Hypixel API");
        if (error instanceof got.HTTPError) {
            const code = error.response.statusCode

            if (code === 403) {
                console.error(`The Hypixel API denied the given authorization '${this.apitoken}'!`)
                throw new HypixelAPIError(false, "middleware.unauthorized", "Hypixel API");
            }

            if (code === 429) {
                this.enableThrottling(error.response.headers['ratelimit-reset'] || error.response.headers['retry-after'])
                throw new HypixelAPIError(true, "middleware.throttling", "Hypixel API");
            }

            if (code >= 500) HypixelClient.unavailable = true

            console.error(`${code} Hypixel API Response!`, error)
            throw new HypixelAPIError((code >= 500), `middleware.request_failed`, "Hypixel API");
        }
        console.error("Unexpected Hypixel API Error", error)
        throw new HypixelAPIError(false, `middleware.request_failed`, "Hypixel API");
    }

    async runAfterThrottling(callback) {
        await sleep(this.throttleTimeRemaining() + (Math.random()*1000))
        return callback();
    }

    enableThrottling(seconds) {
        this.throttling = (Date.now()/1000) + seconds
        sleep(seconds).then(() => {
            this.throttling = null
        })
    }
    
}

const BEDWARS_ODD_LEVELS = Object.entries({ 500: 0, 1500: 1, 3500: 2, 7000: 3 })
const BEDWARS_LEVELS_PER_PRESTIGE = 100
const BEDWARS_EXP_PER_PRESTIGE = 487000
const BEDWARS_EXP_PER_LEVEL = 5000

/** 
 * @type {MiddlewareCache<import("./types").HypixelPlayerData>} 
 */
const playersCache = new MiddlewareCache(60*60, 100)

class HypixelPlayers {

    constructor(client) {

        /** 
         * @type {HypixelClient} 
         * @readonly
         */
        this.client
        Object.defineProperty(this, 'client', { value: client });

    }

    get cache() {
        return playersCache;
    }

    /** @protected */
    getBedwarsLevelProgress(exp) {
        exp = exp % BEDWARS_EXP_PER_PRESTIGE
        const lastOddLevel = BEDWARS_ODD_LEVELS.slice(-1)[0]
        const strangeLevel = BEDWARS_ODD_LEVELS.filter(([max, _]) => exp < max).map(([_, level]) => level)[0]
        return strangeLevel ?? Math.floor((exp - lastOddLevel[0]) / BEDWARS_EXP_PER_LEVEL) + lastOddLevel[1]+1;
    }
    
    /** @protected */
    getBedwarsPrestige(exp) {
        const prestige = Math.floor(exp / BEDWARS_EXP_PER_PRESTIGE)
        return (prestige * BEDWARS_LEVELS_PER_PRESTIGE);
    }

    /** 
     * @protected 
     * @returns {import("./types").HypixelPlayerBedwarsData}
     */
    getBedwarsStats(stats) {
        const bwStats = stats?.player?.stats?.Bedwars ?? {}

        const exp = bwStats["Experience"] ?? 0;
        const prestige = this.getBedwarsPrestige(exp) 
        const progress = this.getBedwarsLevelProgress(exp)

        const wins = bwStats["wins_bedwars"] ?? 0
        const losses = bwStats["losses_bedwars"] ?? 0
        const finalKills = bwStats["final_kills_bedwars"] ?? 0
        const finalDeaths = bwStats["final_deaths_bedwars"] ?? 0

        return {
            exp, prestige, progress, level: (prestige+progress), 
            wins, losses, wlr: (wins/losses), 
            finalKills, finalDeaths, fkdr: (finalKills/finalDeaths),
            ws: bwStats["winstreak"] ?? 0
        };
    }

    /**
     * @param {string} uuid 
     * @param {boolean} [useCache]
     */
    async fetch(uuid, useCache=true) {

        if (useCache) {
            const cached = this.cache.get(uuid)
            if (cached) return cached;
        }
        
        const result = await this.client.hypixelRequest('player', { uuid })
        const body = result.body
        if (!body['success'] || !body["player"]) {
            console.error("Invalid Hypixel Player Response Body!", body)
            throw new HypixelAPIError(false, `middleware.request_failed`, "Hypixel API");
        }

        /** @type {import("./types").HypixelPlayerData} */
        const player = { ...body["player"], bedwars: this.getBedwarsStats(body) }
        this.cache.set(uuid, player)
        return player;

    }
    
}

module.exports = HypixelClient;