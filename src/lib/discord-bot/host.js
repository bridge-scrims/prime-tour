const { Events, GuildBan, Role, GuildMember } = require("discord.js");
const EventEmitter = require("events");

const UserPosition = require("../database/user_position");
const Position = require("../database/position");
const UserProfile = require("../database/user_profile");

class HostGuildManager extends EventEmitter {
    
    constructor(bot, hostId) {
        super()
        
        Object.defineProperty(this, "bot", { value: bot })
        /** 
         * @readonly
         * @type {import("./bot")}
         */
        this.bot
        
        Object.defineProperty(this, "hostId", { value: hostId })
        /** 
         * @readonly
         * @type {string}
         */
        this.hostId
        
        this.database.on('connected', () => this.__addChangeListeners())
    }

    get database() {
        return this.bot.database;
    }

    get permissions() {
        return this.bot.permissions;
    }

    /** @protected */
    __addChangeListeners() {

        this.database.ipc.on('user_position_create', msg => this.onPositionCreate(msg.payload).catch(console.error))
        this.database.ipc.on('audited_user_position_remove', msg => this.onPositionRemove(msg.payload).catch(console.error))
        this.database.ipc.on('user_position_expire', msg => this.onPositionExpire(msg.payload).catch(console.error))
        
        this.database.ipc.on('audited_position_role_create', msg => this.onPositionRoleChange(msg.payload).catch(console.error))
        this.database.ipc.on('audited_position_role_remove', msg => this.onPositionRoleChange(msg.payload).catch(console.error))
        
        this.bot.on("positionsUpdate", (...args) => this.onPositionsChange(...args).catch(console.error))
        this.bot.auditedEvents.on(Events.GuildBanAdd, (ban) => this.onBanChange(ban, ban?.executor).catch(console.error))
        this.bot.auditedEvents.on(Events.GuildBanRemove, (ban) => this.onBanChange(ban, ban?.executor).catch(console.error))
        this.bot.on(Events.GuildMemberRemove, (member) => this.onMemberRemove(member).catch(console.error))

    }

    async onPositionCreate(userPosition) {
        await this.onPositionChange(true, userPosition)
    }

    async onPositionRemove({ userPosition, executor }) {
        await this.onPositionChange(false, userPosition, executor)
    }

    async onPositionExpire(userPosition) {
        await this.onPositionChange(false, userPosition, false)
    }

    async onPositionChange(exists, userPositionData, executor) {
        const userPosition = new UserPosition(this.database, userPositionData)
        const expiration = (exists ? userPosition.expires_at : undefined)
        if (userPosition.user) {
            if (executor === undefined) executor = userPosition.executorProfile
            this.emit("userPermissionsUpdate", await this.permissions.fetchExpandUser(userPosition.user), executor, expiration)
        }
    }

    async onPositionRoleChange({ positionRole: { id_position, guild_id }, executor }) {
        if (guild_id === this.hostId) {
            const permissions = await this.permissions.fetchData()
            const userPositions = Object.values(permissions.userPositions).flat().filter(v => v.id_position === id_position && v.user)
            userPositions.forEach(userPos => {
                this.emit("userPermissionsUpdate", this.permissions.expandUser(userPos.user, permissions), executor)
            })
        }
    }

    /** 
     * @param {import("./permissions").PermissibleMember} member
     * @param {Position[]} lost
     */
    async onPositionsChange(member, executor, _, lost) {
        if (member.guild.id === this.hostId) {
            this.emit("memberPermissionsUpdate", member, executor)
            this.emit("userPermissionsUpdate", member.user, executor)
        }
    }

    /** 
     * @param {GuildMember} member
     */
    async onMemberRemove(member) {
        if (member.guild.id === this.hostId) {
            await this.permissions.fetchExpandMember(member)
            this.emit("userPermissionsUpdate", member.user, undefined)
        }
    }

    /** @param {GuildBan} ban */
    async onBanChange(ban, executor) {
        if (ban.guild.id === this.hostId) {
            this.emit("userPermissionsUpdate", await this.permissions.fetchExpandUser(ban.user), UserProfile.resolve(executor))
        }
    }

    get guild() {
        return this.bot.guilds.cache.get(this.hostId);
    }

    get positionRoles() {
        return this.database.positionRoles.cache.get({ guild_id: this.hostId });
    }

    hasRole(userId, roleId) {
        return this.guild?.members?.cache?.get(userId)?.roles?.cache?.has(roleId) ?? false;
    }

    isBanned(userId) {
        return this.guild?.bans?.cache?.has(userId);
    }

    isRoleConfigured(id_position) {
        return this.positionRoles.filter(p => p.id_position === id_position).map(p => p.role).filter(v => v).length > 0;
    }

    /**
     * The host Discord role **ids** that are required for the position.
     * @param {Position} position
     * @returns {Role[]}
     */
    getPositionRequiredRoles(position) {
        return this.positionRoles.filter(p => p.position === position).map(p => p.role).filter(v => v);
    }

    /**
     * **If the user is authorized to have a position according to the host guild**
     * *(if they have the correct roles and are not banned)*.
     * This will return **undefined if the result could not be determined**
     * *(invalid userId, host guild not available, no position roles configured)*.
     * @param {?string} userId
     * @param {Position} position
     */
    hasPosition(userId, position) {
        return this.permissions.hasGuildPosition(this.hostId, userId, position)
    }

}

module.exports = HostGuildManager;