const { SlashCommandBuilder } = require('discord.js');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('ship')
            .setDescription('Ship two users together')
            .addUserOption(option =>
                option
                    .setName('user1')
                    .setDescription('First user')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option
                    .setName('user2')
                    .setDescription('Second user')
                    .setRequired(true)
            ),

        async execute(interaction) {
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2');
            const percentage = Math.floor(Math.random() * 101);

            let result;

            if (percentage <= 10) {
                result = '💀 Absolutely cooked.';
            } else if (percentage <= 25) {
                result = '😭 This is NOT looking good.';
            } else if (percentage <= 45) {
                result = '💔 There might be something there... maybe.';
            } else if (percentage <= 65) {
                result = '👀 Okay, there could be potential.';
            } else if (percentage <= 80) {
                result = '🔥 Pretty solid match.';
            } else if (percentage <= 95) {
                result = '💘 This is actually looking good.';
            } else {
                result = '❤️‍🔥 BRO. IT WAS MEANT TO BE.';
            }

            await interaction.reply(
                `💘 **${user1.username} + ${user2.username}**\n\n` +
                `**Compatibility:** ${percentage}%\n` +
                `${result}`
            );
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('luck')
            .setDescription('See how lucky you are'),

        async execute(interaction) {
            const percentage = Math.floor(Math.random() * 101);

            await interaction.reply(
                `🍀 Your luck today is **${percentage}%**!`
            );
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('mog')
            .setDescription('Get a random mog tier'),

        async execute(interaction) {
            const tiers = [
                'Low Tier Normie',
                'Mid Tier Normie',
                'High Tier Normie',
                'Chad Lite',
                'Chad',
                'True Adam',
                'Sub 3'
            ];

            const tier = tiers[Math.floor(Math.random() * tiers.length)];
            const score = Math.floor(Math.random() * 101);

            await interaction.reply(
                `🗿 **MOG RESULT**\n\n` +
                `**Mog Level:** ${score}/100\n` +
                `**Tier:** ${tier}`
            );
        }
    }
];
