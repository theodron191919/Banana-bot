const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const MEDIA_MANAGER_ROLE_ID = '1537977785753145378';
const MEDIA_ROLE_ID = '1537977818238165135';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Register slash command
const commands = [
    new SlashCommandBuilder()
        .setName('addmedia')
        .setDescription('Give a user the Media role.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to give the Media role to.')
                .setRequired(true)
        )
        .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Registering Banana Bot commands...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log('Slash commands registered!');
    } catch (error) {
        console.error(error);
    }
})();

client.once('ready', () => {
    console.log(`🍌 Banana Bot is online as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'addmedia') {
        // Check if command user has Media Manager role
        if (!interaction.member.roles.cache.has(MEDIA_MANAGER_ROLE_ID)) {
            return interaction.reply({
                content: '❌ You need the **Media Manager** role to use this command.',
                ephemeral: true
            });
        }

        const target = interaction.options.getMember('user');

        if (!target) {
            return interaction.reply({
                content: '❌ I could not find that member.',
                ephemeral: true
            });
        }

        // Check if target already has Media role
        if (target.roles.cache.has(MEDIA_ROLE_ID)) {
            return interaction.reply({
                content: `⚠️ **${target.user.tag}** already has the Media role.`,
                ephemeral: true
            });
        }

        try {
            await target.roles.add(MEDIA_ROLE_ID);

            await interaction.reply({
                content: `🍌 **${target.user.tag}** has been given the **Media** role!`
            });
        } catch (error) {
            console.error(error);

            await interaction.reply({
                content: '❌ I could not give that user the Media role. Make sure Banana Bot has **Manage Roles** permission and that its role is above the Media role.',
                ephemeral: true
            });
        }
    }
});

client.login(TOKEN);
