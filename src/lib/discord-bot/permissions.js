const { GuildMember, Guild, User } = require("discord.js");
const UserPermissionsCollection = require('../scrims/collections/user_permissions');
const SQLStatementCreator = require("../postgresql/statements");
const DBPermissionData = require("../scrims/permission_data");
const PositionRole = require("../scrims/position_role");
const UserProfile = require("../scrims/user_profile");
const Position = require("../scrims/position");


/**
 * Manages the permissions of `Users`, using their `UserId`, `UserPermissionsCollection` and `GuildMember`.  
 * **Definitions:**
 *  - `user/role:` These just refer to Discord Users/Roles.
 *  - `position:` The Bridge Scrims version of Discord roles e.g. prime.
 *  - `position resolvable:` The Id, name or the position instance itself.
 *  - `position-roles:` The Discord role(s) that indicate a user has a position.
 *  - `user-positions:` The positions of a user that were added to the database
 *      (not all user-positions give roles and not all roles give user-positions).
 *  - `hierarchy:` Since positions can have a level, they form a hierarchy (e.g. owner is above staff).
 *  - `positionLevel:` A position resolvable in the hierarchy, where positions higher will also count
 *      (e.g. if someone only has owner position, they also have the staff positionLevel).
 *  - `host:` Refers to the `HostGuildManager` with the host guild being Bridge Scrims and is used to check if users have a position 
 *      (based off their roles and the position-roles configured there and sometimes if they are banned).
 */
class ScrimsPermissionsManager {
    
    constructor(bot) {
        
        Object.defineProperty(this, "bot", { value: bot })

        /** 
         * @readonly
         * @type {import("./bot")}
         */
        this.bot
        
        bot.on('databaseConnected', () => this.__addChangeListeners())
    }

    get host() {
        return this.bot.host
    }

    get database() {
        return this.bot.database;
    }

    get positions() {
        return this.database.positions.cache.values();
    }

    /** @protected */
    __addChangeListeners() {
        this.bot.auditedEvents.on("guildMemberRolesUpdate", (oldMember, newMember, executor) => this.onRoleChange(oldMember, newMember, executor).catch(console.error))
    }

    /**
     * @param {GuildMember} oldMember 
     * @param {GuildMember} newMember
     * @param {User} executor
     */
    async onRoleChange(oldMember, newMember, executor) {
        if (executor?.id === newMember.client.user.id) return;
        executor = UserProfile.resolve(executor)
        const oldPositions = this.getMemberPositions(oldMember)
        const newPositions = this.getMemberPositions(newMember)

        const lostPositions = oldPositions.filter(pos => !newPositions.includes(pos))
        const gainedPositions = newPositions.filter(pos => !oldPositions.includes(pos))

        if (newMember.guild.id === this.bot.hostGuildId && this.bot.servesHost) {
            const lostPositionRoles = lostPositions.filter(p => !p.dontLog).map(p => p.getConnectedRoles(newMember.guild.id)).flat()
            const gainedPositionRoles = gainedPositions.filter(p => !p.dontLog).map(p => p.getConnectedRoles(newMember.guild.id)).flat()

            if (gainedPositionRoles.length > 0) {
                const roles = gainedPositionRoles.map(v => `${v}`)
                this.database.ipc.notify("position_discord_roles_received", { user: UserProfile.resolve(newMember), executor, guild_id: newMember.guild.id, roles })
            }

            if (lostPositions.length > 0) {
                const positionSelector = SQLStatementCreator.OR(lostPositions.map(({ id_position }) => ({ id_position })))
                const deleted = await this.database.userPositions.sqlDelete(SQLStatementCreator.AND({ user_id: newMember.id }, positionSelector))
                deleted.forEach(userPosition => this.database.ipc.notify("audited_user_position_remove", { userPosition, executor }))
            }

            if (lostPositionRoles.length > 0) {
                const roles = lostPositionRoles.map(v => `${v}`)
                this.database.ipc.notify("position_discord_roles_lost", { user: UserProfile.resolve(newMember), executor, guild_id: newMember.guild.id, roles })
            }
        }
        
        if ((lostPositions.length + gainedPositions.length) > 0) {
            this.bot.emit("positionsUpdate", await this.fetchExpandMember(newMember), executor, gainedPositions, lostPositions)
        }
    }

    /**
     * @typedef Permissible
     * @prop {(perms: import("../types").ScrimsPermissions) => boolean} hasPermission
     * @prop {(pos: import("../types").PositionResolvable) => import('../types').ScrimsUserPermissionInfo|false|undefined} hasPosition
     */
    
    /** 
     * @param {GuildMember} member
     */
    async fetchExpandMember(member) {
        return this.expandMember(member, await this.fetchUserPermissions(member.id)) 
    }

    /** 
     * @param {GuildMember} member 
     * @param {DBPermissionData|UserPermissionsCollection} permissions
     * @returns {PermissibleMember}
     */
    expandMember(member, permissions) {
        member.userPermissions = this.getUserPermissions(member.id, permissions)
        member.hasPosition = (pos) => this.hasPosition(member.id, member.userPermissions, pos)
        member.hasPermission = (scrimsPermissions) => this.hasPermission(member.id, member.userPermissions, member, scrimsPermissions)
        this.expandUser(member.user, member.userPermissions)
        return member;
    }

    /** 
     * @param {User} user
     */
    async fetchExpandUser(user) {
        return this.expandUser(user, await this.fetchUserPermissions(user.id)) 
    }

    /** 
     * @param {User} user 
     * @param {DBPermissionData|UserPermissionsCollection} permissions
     * @returns {PermissibleUser}
     */
    expandUser(user, permissions) {
        user.permissions = this.getUserPermissions(user.id, permissions)
        user.hasPosition = (pos) => this.hasPosition(user.id, user.permissions, pos)
        user.hasPermission = (scrimsPermissions) => this.hasPermission(user.id, user.permissions, null, scrimsPermissions)
        return user;
    }

    async fetchData() {
        return new DBPermissionData().fetch(this.database);
    }

    async fetchUserPermissions(userId) {
        return (new UserPermissionsCollection(this.database, userId)).fetch();
    }

    /** @param {DBPermissionData|UserPermissionsCollection} permissions */
    getUserPermissions(userId, permissions) {
        if (permissions instanceof UserPermissionsCollection) return permissions;
        return (new UserPermissionsCollection(this.database, userId)).set(permissions);
    }

    /** 
     * @param {import("../types").PositionResolvable} [position] 
     * @returns {PositionRole[]}
     */
    getGuildPositionRoles(guild_id, position) {
        if (position) position = this.positions.find(Position.resolve(position))
        return this.database.positionRoles.cache.get({ guild_id }).filter(v => !position || v.id_position === position.id_position);
    }

    /**
     * @param  {{ positionLevel: ?String, allowedPositions: ?String[], requiredPositions: ?String[] }} cmd
     * @returns  {string[]} The positions that have permission to run the command
     */
    getCommandAllowedPositions(cmd) {

        return [];
        // eslint-disable-next-line no-unreachable
        const permissionLevelRoles = (cmd?.positionLevel ? this.getPositionLevelPositions(cmd.positionLevel) : [])
        return permissionLevelRoles.concat(cmd?.allowedPositions || []).concat(cmd?.requiredPositions || []);

    }

    /** 
     * @param {?string} userId 
     * @param {?UserPermissionsCollection} userPositions
     * @returns {import('../types').ScrimsUserPermissionInfo[]}
     */
    getPermittedPositions(userId, userPositions) {
        return this.positions
            .sort(Position.sortByLevel)
            .map(p => this.hasPosition(userId, userPositions, p)).filter(v => v);
    }

    /** @param {GuildMember} member */
    getMemberPositions(member) {
        return Array.from(
            new Set(
                this.getGuildPositionRoles(member.guild.id)
                    .filter(posRole => member.roles.cache.has(posRole.role_id))
                    .map(posRole => posRole.position)
            )
        );
    }

    /** 
     * @param {import("../types").DBGuildMember} member 
     * @param {?UserPermissionsCollection} userPositions
     */
    getPermittedPositionRoles(member, userPositions) {
        return this.getGuildPositionRoles(member.guild.id)
            .filter(({ position }) => this.hasPosition(member.id, userPositions, position))
    }

    /** 
     * @param {import("../types").DBGuildMember} member 
     * @param {?UserPermissionsCollection} userPositions
     */
    getMissingPositionRoles(member, userPositions) {
        return this.getPermittedPositionRoles(member, userPositions)
            .filter(({ role_id }) => !member.roles.cache.has(role_id))
            .filter(({ role }) => role && this.bot.hasRolePermissions(role) && member.guild.id !== role.id)
    }

    /** 
     * @param {import("../types").DBGuildMember} member 
     * @param {?UserPermissionsCollection} userPositions
     */
    getForbiddenPositionRoles(member, userPositions) {
        const permittedRoles = this.getPermittedPositionRoles(member, userPositions).map(({ role_id }) => role_id)
        return this.getGuildPositionRoles(member.guild.id)
            .filter(({ role_id }) => !permittedRoles.includes(role_id))
            .filter(({ position }) => this.hasPosition(member.id, userPositions, position) === false)
    }

    /** 
     * @param {import("../types").DBGuildMember} member 
     * @param {?UserPermissionsCollection} userPositions
     */
    getWrongPositionRoles(member, userPositions) {
        return this.getForbiddenPositionRoles(member, userPositions)
            .filter(({ role_id }) => member.roles.cache.has(role_id))
            .filter(({ role }) => role && this.bot.hasRolePermissions(role) && member.guild.id !== role.id)
    }
    
    /**
     * @param {?string} userId
     * @param {?UserPermissionsCollection} userPermissions
     * @param {?GuildMember} member
     * @param {import("../types").ScrimsPermissions} permissions
     */
    hasPermission(userId, userPermissions, member, permissions) {

        if (!userId && !userPermissions) return false;
        
        // Giving myself (WhatCats) permissions for everything
        if (userId === '568427070020124672') return true;

        const hasRequiredRoles = this.hasRequiredRoles(member, permissions.requiredRoles ?? [])
        const hasRequiredPermissions = this.hasRequiredPermissions(member, permissions.requiredPermissions ?? [])
        const hasRequiredPositions = this.hasRequiredPositions(userId, userPermissions, permissions.requiredPositions ?? [])
        
        const hasPositionLevel = this.hasPositionLevel(userId, userPermissions, permissions.positionLevel ?? null)
        const hasAllowedPositions = this.hasAllowedPositions(userId, userPermissions, permissions.allowedPositions ?? [])
        const hasAllowedPermissions = this.hasAllowedPermissions(member, permissions.allowedPermissions ?? [])
        const hasAllowedRoles = this.hasAllowedRoles(member, permissions.allowedRoles ?? [])
        const hasAllowedUsers = this.hasAllowedUsers(userId, permissions.allowedUsers ?? [])
         
        const allowed = [hasPositionLevel, hasAllowedPositions, hasAllowedPermissions, hasAllowedRoles, hasAllowedUsers]
        return hasRequiredRoles && hasRequiredPermissions && hasRequiredPositions && (allowed.every(v => v === null) || allowed.some(v => v === true));

    }

    /**
     * All the role ids associated with the scrims permissions.
     * @param {string} guildId 
     * @param {import("../types").ScrimsPermissions} permissions 
     */
    getPermissionRoles(guildId, permissions) {

        const roles = [
            ...(permissions.requiredRoles ?? []),
            ...(permissions.allowedRoles ?? [])
        ]

        const positions = [
            ...(permissions.requiredPositions ?? []),
            ...(permissions.allowedPositions ?? []),
            ...(this.positions.find(Position.resolve(permissions.positionLevel))?.getPositionLevelPositions() ?? [])
        ]
        positions.forEach(p => (
            this.positions.find(Position.resolve(p))
                ?.getConnectedRoles(guildId)
                ?.forEach(({ id }) => roles.push(id))
        ))
        
        return Array.from(new Set(roles));
    }

    /**
     * @param {?import("../types").DBGuildMember} member
     * @param {import('discord.js').RoleResolvable[]} roles
     */
    hasRequiredRoles(member, roles) {
        if (!member) return (roles.length === 0);
        return roles.every(role => member.roles.cache.has(member.roles.resolveId(role)));
    }

    /**
     * @param {?import("../types").DBGuildMember} member
     * @param {import('discord.js').RoleResolvable[]} roles
     */
    hasAllowedRoles(member, roles) {
        if (roles.length === 0) return null;
        if (!member) return false;
        return roles.some(role => member.roles.cache.has(member.roles.resolveId(role)));
    }

    /**
     * @param {?string} userId
     * @param {string[]} allowedUsers
     */
    hasAllowedUsers(userId, allowedUsers) {
        if (allowedUsers.length === 0) return null;
        if (!userId) return false;
        return allowedUsers.includes(userId);
    }

    /**
     * @param {?import("../types").DBGuildMember} member
     * @param {import('discord.js').PermissionResolvable[]} permissions
     */
    hasRequiredPermissions(member, permissions) {
        if (!member) return (permissions.length === 0);
        return permissions.every(perm => member.permissions.has(perm, true));
    }

    /**
     * @param {?import("../types").DBGuildMember} member
     * @param {import('discord.js').PermissionResolvable[]} permissions
     */
    hasAllowedPermissions(member, permissions) {
        if (permissions.length === 0) return null;
        if (!member) return (permissions.length === 0) ? null : false;
        return permissions.some(perm => member.permissions.has(perm, true));
    }

    /**
     * **If the user is authorized to have this position**
     * *(depending on if they have the correct host roles or the user-positions and sometimes if they are banned)*.
     * This will return **undefined if the result could not be determined** 
     * *(invalid position, host guild not available, invalid userId, no position roles configured)*.
     * @param {?string} userId
     * @param {?UserPermissionsCollection} userPermissions
     * @param {import('../types').PositionResolvable} positionResolvable
     * @returns {import('../types').ScrimsUserPermissionInfo|false|undefined}
     */
    hasPosition(userId, userPermissions, positionResolvable) {
        const position = this.positions.find(Position.resolve(positionResolvable))
        if (!position) return undefined;
        const getResult = (v) => ((v === true) ? position : v)

        if (position.name !== "banned" && this.hasPosition(userId, userPermissions, "banned")) return false;
        if (userPermissions?.hasPosition(position)) return userPermissions.hasPosition(position);
		if (!this.host) return undefined;
        return getResult(this.host.hasPosition(userId, position));
    }

    resolveGuild(guildId) {
        return this.bot.guilds.cache.get(guildId);
    }

    /**
     * @param {Guild} guild
     */
    hasRole(guild, userId, roleId) {
        return guild.members.cache.get(userId)?.roles?.cache?.has(roleId) ?? false;
    }

    isBanned(guildId, userId) {
        return this.resolveGuild(guildId)?.bans?.cache?.has(userId);
    }

    /**
     * The Discord roles that are required for the position.
     * @param {Position} position
     * @returns {Role[]}
     */
    getPositionRequiredRoles(guildId, position) {
        return this.getGuildPositionRoles(guildId, position).map(p => p.role).filter(v => v);
    }

    /**
     * **If the user is authorized to have a position according to the guild**
     * *(if they have the correct roles and are not banned)*.
     * This will return **undefined if the result could not be determined**
     * *(invalid userId, guildId, guild not available, no position roles configured)*.
     * @param {?string} guildId
     * @param {?string} userId
     * @param {Position} position
     */
    hasGuildPosition(guildId, userId, position) {
        if (!guildId || !userId) return undefined;
        if (position.name === "banned") return this.isBanned(guildId, userId);
        const guild = this.resolveGuild(guildId)
        const required = this.getPositionRequiredRoles(guildId, position) 
        if (required.length === 0 || !guild) return undefined;
        return required.some(role => this.hasRole(guild, userId, role.id));
    }

    /**
     * @param {?string} userId
     * @param {?UserPermissionsCollection} userPermissions
     * @param {import('../types').PositionResolvable[]} requiredPositions
     */
    hasRequiredPositions(userId, userPermissions, requiredPositions) {
        return requiredPositions.every(r => this.hasPosition(userId, userPermissions, r));
    }

    /**
     * @param {?string} userId
     * @param {?UserPermissionsCollection} userPermissions
     * @param {import('../types').PositionResolvable[]} allowedPositions
     */
    hasAllowedPositions(userId, userPermissions, allowedPositions) {
        if (allowedPositions.length === 0) return null;
        return allowedPositions.some(r => this.hasPosition(userId, userPermissions, r));
    }

    /**
     * @param {?string} userId
     * @param {?UserPermissionsCollection} userPermissions
     * @param {import("../types").PositionResolvable} positionLevel
     */
    hasPositionLevel(userId, userPermissions, positionLevel) {
        const position = this.positions.find(Position.resolve(positionLevel))
        if (!position) return null;
        return this.hasAllowedPositions(userId, userPermissions, position.getPositionLevelPositions());
    }


}

/**
 * @typedef {User & Permissible & PermissibleUserData} PermissibleUser
 * @typedef {GuildMember & Permissible & PermissibleMemberData} PermissibleMember
 * 
 * @typedef PermissibleMemberData
 * @prop {PermissibleUser} user
 * @prop {UserPermissionsCollection} userPermissions
 * 
 * @typedef PermissibleUserData
 * @prop {UserPermissionsCollection} permissions
 */

module.exports = ScrimsPermissionsManager;