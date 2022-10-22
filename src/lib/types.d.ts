import { 
    CommandInteraction, ChatInputCommandInteraction, ContextMenuCommandInteraction,
    ModalSubmitInteraction, GuildMember, BaseInteraction, MessageComponentInteraction, 
    AutocompleteInteraction, MessageOptions, User, Snowflake, PermissionsString, EmbedField, 
    ActionRowBuilder, MessagePayload, ContextMenuCommandBuilder, SlashCommandBuilder, ModalBuilder, ApplicationCommandOptionChoiceData
} from "discord.js";

import StateComponentHandler from "./discord-bot/interaction-handlers/state_components";
import UserPermissionsCollection from "./scrims/collections/user_permissions";
import { PermissibleMember, PermissibleUser } from "./discord-bot/permissions";
import ExchangeHandler from "./discord-bot/interaction-handlers/exchange";
import MessageOptionsBuilder from "./tools/payload_builder";
import UserPosition from "./scrims/user_position";
import UserProfile from "./scrims/user_profile";
import I18n from "./tools/internationalization";
import Position from "./scrims/position";
import DBClient from "./postgresql/database";
import ScrimsBot from "./discord-bot/bot";

import * as Colors from "../assets/colors.json"

export interface ScrimsPermissions {
    positionLevel?: PositionResolvable;
    allowedPositions?: PositionResolvable[]; 
    requiredPositions?: PositionResolvable[];

    allowedPermissions?: PermissionsString[];
    requiredPermissions?: PermissionsString[];
    
    allowedUsers?: Snowflake[];
    allowedRoles?: Snowflake[];
    requiredRoles?: Snowflake[];
}

export type ScrimsUserPermissionInfo = UserPosition | Position

export interface BotCommandConfig {
    permissions?: ScrimsPermissions;
    guilds?: string[];
    forceGuild?: boolean;
    forceScrimsUser?: boolean;
    ephemeralDefer?: boolean;
    deferUpdate?: boolean;
    denyWhenBlocked?: boolean;
    forceInstallHostGuild?: boolean
}

export interface BotCommand {
    command: string | ContextMenuCommandBuilder | SlashCommandBuilder
    handler: (interaction:ScrimsInteraction) => Promise<any>
    config?: BotCommandConfig
}

export type BotCommandResolvable = BotCommand | ((bot: ScrimsBot) => BotCommand)

export interface ScrimsInteraction extends BaseInteraction {

    return(payload: MessageOptions|MessageOptionsBuilder|ModalBuilder|ApplicationCommandOptionChoiceData[]): Promise<void>;
    userHasPosition(pos: PositionResolvable): boolean;
    userHasPermissions(perms: ScrimsPermissions): boolean;
    
    i18n: I18n;
    COLORS: typeof Colors;
    userProfile: UserProfile;
    client: ScrimsBot; 
    database: DBClient;
    user: PermissibleUser;
    member?: PermissibleMember;
    userPermissions: ?UserPermissionsCollection;

    path: string;
    commandName: string | null;
    subCommandName: string | null;

}


export interface ScrimsAutocompleteInteraction extends ScrimsInteraction, AutocompleteInteraction {}
export interface ScrimsContextMenuInteraction extends ScrimsInteraction, ContextMenuCommandInteraction {}

export interface BotCommandInteraction extends ScrimsInteraction, CommandInteraction {
    BotCommand: SlashCommandBuilder;
    commandConfig: BotCommandConfiguration;
    scrimsPermissions: ScrimsPermissions;
}

export interface ScrimsChatInputCommandInteraction extends ScrimsInteraction, ChatInputCommandInteraction {}

export interface ScrimsComponentInteraction extends ScrimsInteraction, MessageComponentInteraction {
    memoryData: any;
    args: string[];
}

export interface ScrimsModalSubmitInteraction extends ScrimsInteraction, ModalSubmitInteraction {
    args: string[];
}

export interface RecallComponentState {
    id: string
    index: number
}

export interface RecallExchangeState extends RecallComponentState {
    getModalComponents(): ActionRowBuilder[];
    getEmbedFields(showComments?: boolean): EmbedField[];
}

export interface RecallComponentInteraction extends ScrimsInteraction {
    handler: StateComponentHandler
    state: RecallComponentState
}

export interface RecallExchangeInteraction extends RecallComponentInteraction {
    handler: ExchangeHandler
    state: RecallExchangeState
}

export interface EphemeralExchangeResponse extends MessageOptions {
    nextOption?: string;
    backOption?: string;
    cancelOption?: string;
}

export type PositionResolvable = string | number | Position;
export type UserResolvable = string | GuildMember | User;