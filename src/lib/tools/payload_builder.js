const { ActionRowBuilder, EmbedBuilder, ButtonBuilder } = require("discord.js")
const LocalizedError = require("./localized_error")

/**
 * @template T
 * @typedef {(((builder: T) => T)|T)} BuilderOrBuildCall
 */

/** 
 * @template T
 * @param {BuilderOrBuildCall<T>[]} resolvables 
 * @returns {T[]}
 */
function resolveBuilders(Builder, resolvables) {
    return resolvables.map(v => (typeof v === "function" ? v(new Builder()) : v))
}

class MessageOptionsBuilder {

    /** 
     * @param {import("discord.js").MessageOptions} 
     */
    constructor({ content, embeds, components, allowedMentions } = {}) {
        this.content = content ?? null
        this.embeds = embeds ?? []
        this.components = components ?? []
        this.allowedMentions = allowedMentions ?? {}
    }

    /** @param {boolean} ephemeral */
    setEphemeral(ephemeral) {
        this.ephemeral = ephemeral
        return this
    }

    removeMentions() {
        this.allowedMentions = { parse: [] }
        return this;
    }

    /** @param {?string} [content] */
    setContent(content) {
        this.content = (!content) ? null : `${content}`
        if (this.content?.length > 2000) throw new LocalizedError("unexpected_error.overflow")
        return this
    }

    /** @param {(content: string) => string} editor */
    editContent(editor) {
        return this.setContent(editor(this.content))
    }

    /** @param {BuilderOrBuildCall<EmbedBuilder>[]} embeds */
    addEmbeds(...embeds) {
        this.embeds.push(...resolveBuilders(EmbedBuilder, embeds))
        if (this.embeds.length > 10) throw new LocalizedError("unexpected_error.overflow")
        return this
    }

    /** @param {(embed: EmbedBuilder) => EmbedBuilder} builder */
    buildEmbed(builder) {
        return this.addEmbeds(builder(new EmbedBuilder()));
    }

    /** @param {import("discord.js").MessageActionRowComponentBuilder[]} actions */
    addActions(...actions) {
        if (actions.length > 5) throw new LocalizedError("unexpected_error.overflow")
        return this.addComponents(new ActionRowBuilder().addComponents(...actions))
    }

    /** @param {BuilderOrBuildCall<ButtonBuilder>[]} buttons */
    addButtons(...buttons) {
        if (buttons.length > 5) throw new LocalizedError("unexpected_error.overflow")
        return this.addComponents(new ActionRowBuilder().addComponents(...resolveBuilders(ButtonBuilder, buttons)))
    }

    /** @param {import("discord.js").MessageComponentBuilder[]} components */
    addComponents(...components) {
        this.components.push(...components)
        if (this.components.length > 5) throw new LocalizedError("unexpected_error.overflow")
        return this
    }

    /**
     * @template T
     * @param {T[]} items 
     * @param {(items: T[], index: number, containers: T[][]) => EmbedBuilder} getEmbedCall
     */
    createMultipleEmbeds(items, getEmbedCall) {
        
        const max = 25
        
        const containers = Array.from((new Array(Math.ceil(items.length / max))).keys())
        if (containers.length > 10) throw new LocalizedError("unexpected_error.overflow")

        const containerSize = Math.floor(items.length / containers.length)
        const overflow = items.length % containerSize
        const embedData = containers.map((_, i) => items.slice(i*containerSize, (i+1)*containerSize))

        const getEmbed = (items, idx, containers) => {
            const embed = getEmbedCall(items, idx, containers)
            if (!embed.data.footer && containers.length > 1) embed.setFooter({ text: `Page ${idx+1}/${containers.length}` })
            return embed;
        }
        
        const lastIdx = embedData.length-1
        if (overflow > 0) embedData[lastIdx] = embedData[lastIdx].concat(items.slice(-overflow))
        return this.addEmbeds(...embedData.map((items, idx, containers) => getEmbed(items, idx, containers)))

    }

}

module.exports = MessageOptionsBuilder