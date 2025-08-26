const fs = require('fs');
const { Client, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
require('dotenv').config();

// Load environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;

// Initialize client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// -----------------------
// Persistent Cookie Bank
// -----------------------
const BANK_FILE = 'cookie_bank.json';

function loadBank() {
    try {
        if (!fs.existsSync(BANK_FILE)) {
            console.log('Bank file not found, starting with empty bank.');
            return {};
        }
        return JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
    } catch (error) {
        console.error(`Error loading bank: ${error}`);
        return {};
    }
}

function saveBank() {
    try {
        fs.writeFileSync(BANK_FILE, JSON.stringify(cookieBank, null, 2));
    } catch (error) {
        console.error(`Error saving bank: ${error}`);
    }
}

let cookieBank = loadBank(); // {user_id: cookies}

// Role IDs
const COOKIE_BANK_ROLE = '1409741927385137222'; // "CBD account holder"
const COOKIE_COMMANDER_ROLE = '1409741900134481960'; // "Cookie Commander"

// -----------------------
// Helper Functions
// -----------------------
function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

function ensureAccount(userId) {
    return userId in cookieBank;
}

function getBalance(userId) {
    return cookieBank[userId] || 0;
}

function setBalance(userId, amount) {
    cookieBank[userId] = Math.max(0, amount);
    saveBank();
}

// -----------------------
// Slash Commands
// -----------------------
const commands = [
    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Manually sync commands (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('iq')
        .setDescription('Get a random IQ rating'),
    new SlashCommandBuilder()
        .setName('make-cbd-account')
        .setDescription('Open a Cookie Bank account'),
    new SlashCommandBuilder()
        .setName('summoncookie')
        .setDescription('Summon cookies into your account')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of cookies (0-32767)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(32767)),
    new SlashCommandBuilder()
        .setName('setcookie')
        .setDescription('Set a user\'s cookie balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to set cookies for')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('New cookie amount')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('removecookie')
        .setDescription('Remove cookies from a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove cookies from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to remove')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('resetcookie')
        .setDescription('Reset a user\'s cookie balance to 0')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to reset')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('givecookie')
        .setDescription('Give cookies to another user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to give cookies to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to give')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('cookielist')
        .setDescription('Check a user\'s cookie balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('eatcookie')
        .setDescription('Eat cookies from your account')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of cookies to eat')
                .setRequired(true)
                .setMinValue(1))
];

// Deploy commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function deployCommands() {
    try {
        console.log('Deploying slash commands...');
        const route = GUILD_ID
            ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
            : Routes.applicationCommands(CLIENT_ID);
        await rest.put(route, { body: commands });
        console.log(`Commands successfully deployed to ${GUILD_ID ? `guild ${GUILD_ID}` : 'global scope'}.`);
    } catch (error) {
        console.error(`Error deploying commands: ${error}`);
    }
}

// -----------------------
// Events
// -----------------------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag} (ID: ${client.user.id})`);
    await deployCommands();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, user, member, options } = interaction;

    // Helper for error responses
    const reply = (content, ephemeral = true) => interaction.reply({ content, ephemeral });

    try {
        switch (commandName) {
            case 'sync':
                if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return reply('You must be an administrator to use this command.');
                }
                await deployCommands();
                return reply('Commands synced.', true);

            case 'iq':
                const iqValue = Math.floor(Math.random() * 251);
                const label = iqValue < 85 ? 'stupid' : iqValue < 135 ? 'average' : 'a genius';
                return reply(`You have an IQ of ${iqValue}. Bro is ${label}.`, false);

            case 'make-cbd-account':
                if (hasRole(member, COOKIE_BANK_ROLE)) {
                    return reply('You already have an account.');
                }
                setBalance(user.id, 0);
                const role = interaction.guild.roles.cache.get(COOKIE_BANK_ROLE);
                if (role) {
                    try {
                        await member.roles.add(role);
                        return reply('Bank account created. Welcome to the Cookie Bank of Discord!', false);
                    } catch (error) {
                        return reply('Failed to add role. Ensure the bot has "Manage Roles" permission and its role is above the target role.');
                    }
                }
                return reply('Error: Cookie Bank role not found. Check role ID.');

            case 'summoncookie':
                if (!hasRole(member, COOKIE_COMMANDER_ROLE)) {
                    return reply('You are NOT a Cookie Commander.');
                }
                if (!ensureAccount(user.id)) {
                    return reply('You do not have a CBD account. Use `/make-cbd-account` first.');
                }
                const summonAmount = options.getInteger('amount');
                setBalance(user.id, getBalance(user.id) + summonAmount);
                return reply(`Summoned ${summonAmount} cookies. You now have ${getBalance(user.id)} cookies.`, false);

            case 'setcookie':
                if (!hasRole(member, COOKIE_COMMANDER_ROLE)) {
                    return reply('You are NOT a Cookie Commander.');
                }
                const setUser = options.getMember('user');
                const setAmount = options.getInteger('amount');
                if (!ensureAccount(setUser.id)) {
                    return reply(`${setUser.user.tag} does not have a CBD account.`);
                }
                setBalance(setUser.id, setAmount);
                return reply(`Set ${setUser.user.tag}'s cookies to ${setAmount}.`, false);

            case 'removecookie':
                if (!hasRole(member, COOKIE_COMMANDER_ROLE)) {
                    return reply('You are NOT a Cookie Commander.');
                }
                const removeUser = options.getMember('user');
                const removeAmount = options.getInteger('amount');
                if (!ensureAccount(removeUser.id)) {
                    return reply(`${removeUser.user.tag} does not have a CBD account.`);
                }
                setBalance(removeUser.id, getBalance(removeUser.id) - removeAmount);
                return reply(`Removed ${removeAmount} cookies from ${removeUser.user.tag}. Balance: ${getBalance(removeUser.id)}`, false);

            case 'resetcookie':
                if (!hasRole(member, COOKIE_COMMANDER_ROLE)) {
                    return reply('You are NOT a Cookie Commander.');
                }
                const resetUser = options.getMember('user');
                if (!ensureAccount(resetUser.id)) {
                    return reply(`${resetUser.user.tag} does not have a CBD account.`);
                }
                setBalance(resetUser.id, 0);
                return reply(`${resetUser.user.tag}'s cookies reset to 0.`, false);

            case 'givecookie':
                if (!ensureAccount(user.id)) {
                    return reply('You do not have a CBD account. Use `/make-cbd-account` first.');
                }
                const giveUser = options.getMember('user');
                const giveAmount = options.getInteger('amount');
                if (!ensureAccount(giveUser.id)) {
                    return reply(`${giveUser.user.tag} does not have a CBD account.`);
                }
                if (giveAmount <= 0) {
                    return reply('Amount must be positive.');
                }
                if (getBalance(user.id) < giveAmount) {
                    return reply('You don’t have enough cookies.');
                }
                setBalance(user.id, getBalance(user.id) - giveAmount);
                setBalance(giveUser.id, getBalance(giveUser.id) + giveAmount);
                return reply(`Gave ${giveAmount} cookies to ${giveUser.user.tag}. You now have ${getBalance(user.id)} cookies.`, false);

            case 'cookielist':
                const checkUser = options.getMember('user');
                if (!ensureAccount(checkUser.id)) {
                    return reply(`${checkUser.user.tag} does not have a CBD account.`);
                }
                return reply(`${checkUser.user.tag} has ${getBalance(checkUser.id)} cookies.`, false);

            case 'eatcookie':
                if (!ensureAccount(user.id)) {
                    return reply('You do not have a CBD account. Use `/make-cbd-account` first.');
                }
                const eatAmount = options.getInteger('amount');
                if (getBalance(user.id) < eatAmount) {
                    return reply('You don’t have enough cookies.');
                }
                setBalance(user.id, getBalance(user.id) - eatAmount);
                return reply(`You have eaten ${eatAmount} cookie(s). 🍪`, false);
        }
    } catch (error) {
        console.error(`Error handling command ${commandName}: ${error}`);
        reply(`An unexpected error occurred: ${error.message}`);
    }
});

// -----------------------
// Start Bot
// -----------------------
if (!TOKEN || !CLIENT_ID) {
    throw new Error('DISCORD_TOKEN or CLIENT_ID not set in .env');
}

client.login(TOKEN).catch(error => {
    console.error(`Failed to start bot: ${error}`);
});