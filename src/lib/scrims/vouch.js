const ScrimsUserPositionVouchCollection = require("./collections/user_vouches");
const I18n = require("../tools/internationalization");
const DBTable = require("../postgresql/table");
const DBCache = require("../postgresql/cache");
const TableRow = require("../postgresql/row");
const UserProfile = require("./user_profile");
const ScrimsPosition = require("./position");
const { Role } = require("discord.js");

/** @extends {DBCache<ScrimsVouch>} */
class VouchesCache extends DBCache {

    async getUserVouches(userId, positionResolvable) {
        return new ScrimsUserPositionVouchCollection(this.client, userId, positionResolvable).read()
    }

}

/** @extends {DBTable<ScrimsVouch>} */
class VouchesTable extends DBTable {

    constructor(client) {
        super(client, 'scrims_vouch', {}, ScrimsVouch)
        
        /** @type {VouchesCache} */
        this.cache = new VouchesCache({})
    }

    async fetchUserVouches(userId, positionResolvable) {
        return new ScrimsUserPositionVouchCollection(this.client, userId, positionResolvable).fetch()
    }

}

class ScrimsVouch extends TableRow {

    static nonExpired(v) {
        return !v.isExpired();
    }

    /** @type {VouchesTable} */
    static Table = VouchesTable;

    constructor(table, vouchData) {

        super(table, vouchData)

        /** @type {string} */
        this.id_vouch
        if (!this.id_vouch) this.setId()
        
        /** @type {string} */
        this.user_id

        /** @type {number} */
        this.id_position

        /** @type {?string} */
        this.executor_id

        /** @type {number} */
        this.given_at

        /** @type {number} */
        this.worth

        /** @type {?string} */
        this.comment

    }

    isPositive() {
        return (this.worth > 0);
    }

    isExpired() {
        if (this.worth < 0) return (Date.now()/1000) >= this.given_at+(60*60*24*7*2);
        return (Date.now()/1000) >= this.given_at+(60*60*24*30.41*3);
    }

    /**
     * @param {string} [id_vouch] if falsley will use a random uuid
     */
    setId(id_vouch) {

        this.id_vouch = id_vouch ?? this.client.generateUUID()
        return this;

    }

    get userProfile() {
        return this.client.users.cache.find(this.user_id);
    }

    /** @param {string|UserProfile} user */
    setUser(user) {
        this.user_id = user?.user_id ?? user
        return this;
    }

    get positions() {
        return this.client.positions.cache.find(this.id_position);
    }

    /** @param {string|number|Object.<string, any>|ScrimsPosition} positionResolvable */
    setPosition(positionResolvable) {
        if (typeof positionResolvable === "string") positionResolvable = { name: positionResolvable }
        this._setForeignObjectKeys(this.client.positions, ['id_position'], ['id_position'], positionResolvable)
        return this;
    }

    get executorProfile() {
        return this.client.users.cache.find(this.executor_id);
    }

    /** @param {string|UserProfile|null} executor */
    setExecutor(executor) {
        this.executor_id = executor?.user_id ?? executor
        return this;
    }

    /**
     * @param {number} [given_at] if falsley will use current time 
     */
    setGivenAt(given_at) {
        this.given_at = given_at ?? Math.floor(Date.now()/1000)
        return this;
    }

    /** @param {number} worth */
    setWorth(worth) {
        this.worth = worth
        return this;
    }

    /** @param {string|null} comment */
    setComment(comment) {
        this.comment = comment
        return this;
    }

    /** 
     * @override
     * @param {Object.<string, any>} vouchData 
     */
    update(vouchData) {
        super.update(vouchData)
        this.setPosition(vouchData.position)
        return this;
    }

    isCacheExpired(now) {
        return this.isExpired() && (!now || super.isCacheExpired(now));
    }

    /**
     * @param {I18n} i18n
     * @param {?Role} [councilRole] 
     * @returns {import("discord.js").EmbedFieldData}
     */
    toEmbedField(i18n, councilRole=null) {
        const time = `<t:${this.given_at}:D>` 

        if (this.executor_id) {
            const resourceId = "vouches.to_field." + (this.worth < 0 ? "negative" : "positive")
            return i18n.getObject(
                resourceId, this.executorProfile?.mention ?? 'Unknown User', 
                this.comment || undefined, this.executorProfile?.username, time
            )
        }

        const resourceId = "vouches.to_field." + (this.worth < 0 ? "denied" : "accepted")
        return i18n.getObject(resourceId, councilRole ? `${councilRole}` : `council`, this.comment || undefined, time);
    }

}

module.exports = ScrimsVouch;