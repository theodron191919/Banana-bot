const {
    SlashCommandBuilder
} = require('discord.js');

const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('ship')
            .setDescription('See how compatible two people are.')
            .addUserOption(option =>
                option.setName('user1')
                    .setDescription('First person')
                    .setRequired(true))
            .addUserOption(option =>
                option.setName('user2')
                    .setDescription('Second person')
                    .setRequired(true)),

        execute: async interaction => {
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2');

            const percentage = Math.floor(Math.random() * 101);

            await interaction.reply(
                `💘 **${user1.username} + ${user2.username}** = **${percentage}%** compatibility!`
            );
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('rizz')
            .setDescription('Check someone's rizz.')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Person to rate')
                    .setRequired(false)),

        execute: async interaction => {
            const user = interaction.options.getUser('user') || interaction.user;
            const score = Math.floor(Math.random() * 101);

            await interaction.reply(
                `😎 **${user.username}'s rizz:** **${score}/100**`
            );
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('luck')
            .setDescription('Check your luck.'),

        execute: async interaction => {
            const luck = Math.floor(Math.random() * 101);

            await interaction.reply(
                `🍀 **${interaction.user.username}'s luck today:** **${luck}%**`
            );
        }
    }
];

module.exports = commands;
