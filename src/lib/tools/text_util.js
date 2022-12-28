const { Guild, GuildMember } = require("discord.js");
const { default: parseDuration } = require("parse-duration");
const util = require('util');

class TextUtil {

    /**
     * @param {string} resolvable 
     * @param {import('../scrims/user_profile')[]} profiles 
     * @param {Guild} guild 
     * @returns {import('../scrims/user_profile')|GuildMember|null}
     */
    static parseUser(resolvable, profiles, guild) {
        resolvable = resolvable.replace(/```|:|\n|@/g, '')
        
        for (const key of ['user_id', 'tag', 'username']) {
            const matches = profiles.filter(user => user[key] === resolvable)
            if (matches.length === 1) return matches[0];
        }

        if (guild) {
            const members = Array.from(guild.members.cache.values())
            for (const keys of [['id'], ['user', 'tag'], ['displayName'], ['user', 'username']]) {
                const matches = members.filter(m => keys.reduce((pv, cv) => pv?.[cv], m) === resolvable)
                if (matches.length === 1) return matches[0].user;
            }
        }

        // Caseless Matching
        for (const key of ['user_id', 'tag', 'username']) {
            const matches = profiles.filter(user => user[key]?.toLowerCase() === resolvable.toLowerCase())
            if (matches.length === 1) return matches[0];
        }

        if (guild) {
            const members = Array.from(guild.members.cache.values())
            for (const keys of [['id'], ['user', 'tag'], ['displayName'], ['user', 'username']]) {
                const matches = members.filter(m => keys.reduce((pv, cv) => pv?.[cv], m)?.toLowerCase() === resolvable.toLowerCase())
                if (matches.length === 1) return matches[0].user;
            }
        }

        return null;
    }

    static parseDuration(input) {
        return parseDuration(input);
    }
    
    /** @param {string} text */
    static stripText(text, charLimit=Infinity) {
        while (text.includes("\n\n\n")) 
            text = text.replace("\n\n\n", "\n\n");

        const lines = text.split("\n").map(v => v.trim())
        if (lines.length > 10)
            text = lines.slice(0, lines.length-(lines.length-10)).join("\n") + lines.slice(lines.length-(lines.length-10)).map(v => v.trim()).join(" ")
        
        text = text.trim()
        if (text.length > charLimit) text = text.slice(0, charLimit-12) + " ...and more"
        return text;
    }

    /** @param {string} text */
    static limitText(text, charLimit) {
        if (text.length > charLimit) return text.slice(0, charLimit-12) + " ...and more";
        return text;
    }

    /** @param {Array.<string>} arr */
    static reduceArray(arr, charLimit, start="") {
        const AND_MORE = "\n ...and more" 
        return arr.reduce((pv, cv) => {
            const val = pv + "\n" + cv
            if ((val.length + AND_MORE.length) > charLimit) return pv;
            return val;
        }, start)
    }

    /** @param {number} delta Number of seconds to stringify */
    static stringifyTimeDelta(delta, withoutFormating=false) {
        const layers = { day: 86400, hour: 3600, min: 60 };
        const timeLeft = { day: 0, hour: 0, min: 0 };
        if (delta < 60) return (withoutFormating ? "1min" : `\`1min\``);
    
        for (const [layer, value] of Object.entries(layers)) {
            const amount = Math.floor(delta / value)
            if (amount < 1) continue;
            delta -= (amount * value)
            timeLeft[layer] += amount
        }
        
        return Object.entries(timeLeft)
            .filter(([name, value]) => (value > 0))
            .map(([name, value]) => `${value}${(value > 1 ? `${name}s` : name)}`)
            .map(v => (withoutFormating ? v : `\`${v}\``))
            .join(' ');
    }

    /** @param {any[]} array */
    static stringifyArray(array) {
        return [array.slice(0, -1).join(', '), array.slice(-1)[0]].filter(v => v).join(' and ');
    }

    /**
     * @typedef StringFormatOptions
     * @property {string} [unknownCase] What to return if any params are falsely
     */

    /** 
     * @param {string} string 
     * @param {any} params
     * @param {StringFormatOptions}
     */
    static format(string, params, { unknownCase } = {}) {
        params = [params].flat()
        if (params.some(v => !v)) return unknownCase ?? "";
        return util.format(string, ...params);
    }

    /** @param {string} string  */
    static isValidHttpUrl(string) {
        return (() => {
            try {
                return new URL(string);
            } catch (_) {
                return false;  
            }
        })()?.protocol === "https:";
    }

    /** @param {string} str  */
    static snakeToUpperCamelCase(str) {
        return str.split("_").map(v => v[0].toUpperCase() + v.slice(1)).join(" ");
    }

    static toFieldValue(obj, max) {
        if (!obj) return 'None';
        if (obj instanceof Array)
            return obj.slice(0, max).map(value => '`•` ' + `${(`${value}`.includes('<') && `${value}`.includes('>')) ? `${value}` : `${value}`}`).join('\n')
                + (obj.length > max ? `\nand more...` : ``);
        return Object.entries(obj).slice(0, max).map(([key, value]) => `\`•\` ${(`${key}`.includes('<') && `${key}`.includes('>')) ? `${key}**:**` : `**${key}:**`} ${(`${value}`.includes('<') && `${value}`.includes('>')) ? `${value}` : `\`${value}\``}`)
            .join('\n') + (Object.entries(obj).length > max ? `\nand more...` : ``);
    }
    
}

module.exports = TextUtil;