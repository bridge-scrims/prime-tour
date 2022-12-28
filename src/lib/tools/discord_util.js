const { User, GuildMember } = require("discord.js");

/**
 * 
 * @param {User|GuildMember} user 
 * @returns {?import("discord.js").EmbedAuthorData}
 */
function userAsEmbedAuthor(user) {
    if (!user) return null;
    return {
        name: user?.tag || user?.user?.tag,
        iconURL: user?.displayAvatarURL?.() || user.avatarURL()
    }
}

module.exports = {
    userAsEmbedAuthor
}