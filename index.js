const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes
} = require('discord.js');
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIX = '?';
const MEDIA_MANAGER_ROLE_ID = '1537977785753145378';
const MEDIA_ROLE_ID = '1537977818238165135';
// 30 minutes in milliseconds
const COOLDOWN_TIME = 30 * 60 * 1000;
// Stores cooldowns by Media Manager user ID
const mediaCooldowns = new Map();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
// ===============================
// SLASH COMMANDS
// ===============================
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
        console.error('Command registration error:', error);
    }
})();
// ===============================
// BOT READY
// ===============================
client.once('ready', () => {
    console.log(`🍌 Banana Bot is online as ${client.user.tag}`);
});
// ===============================
// ADD MEDIA FUNCTION
// ===============================
async function addMedia(member, executor, reply) {
    // Check Media Manager role
    if (!executor.roles.cache.has(MEDIA_MANAGER_ROLE_ID)) {
        return reply(
            '❌ You need the **Media Manager** role to use this command.'
        );
    }
    // Check target
    if (!member) {
        return reply(
            '❌ I could not find that member.'
        );
    }
    // Check cooldown
    const now = Date.now();
    const cooldownEnd = mediaCooldowns.get(executor.id);
    if (cooldownEnd && now < cooldownEnd) {
        const remaining = cooldownEnd - now;
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        return reply(
            `⏳ You're on cooldown! You can use this command again in **${minutes}m ${seconds}s**.`
        );
    }
    // Check if they already have Media
    if (member.roles.cache.has(MEDIA_ROLE_ID)) {
        return reply(
            `⚠️ **${member.user.tag}** already has the **Media** role.`
        );
    }
    try {
        await member.roles.add(MEDIA_ROLE_ID);
        // Start the 30-minute cooldown AFTER successful role assignment
        mediaCooldowns.set(
            executor.id,
            Date.now() + COOLDOWN_TIME
        );
        // Automatically remove the cooldown after 30 minutes
        setTimeout(() => {
            mediaCooldowns.delete(executor.id);
        }, COOLDOWN_TIME);
        return reply(
            `🍌 **${member.user.tag}** has been given the **Media** role!\n` +
            `⏳ You can use \`/addmedia\` again in **30 minutes**.`
        );
    } catch (error) {
        console.error('Role assignment error:', error);
        return reply(
            '❌ I could not give that user the Media role. Make sure Banana Bot has **Manage Roles** permission and that its bot role is above the Media role.'
        );
    }
}
// ===============================
// SLASH COMMAND HANDLER
// ===============================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'addmedia') {
        const target = interaction.options.getMember('user');
        await addMedia(
            target,
            interaction.member,
            message => interaction.reply({
                content: message,
                ephemeral: true
            })
        );
    }
});
// ===============================
// PREFIX COMMAND HANDLER
// ===============================
client.on('messageCreate', async message => {
    // Ignore bots
    if (message.author.bot) return;
    // Ignore messages without prefix
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content
        .slice(PREFIX.length)
        .trim()
        .split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (command === 'addmedia') {
        if (!args[0]) {
            return message.reply(
                '❌ Please mention a user or provide their user ID.\n' +
                'Example: `?addmedia @User`'
            );
        }
        let targetMember;
        // Try to get mentioned user
        if (message.mentions.members.first()) {
            targetMember = message.mentions.members.first();
        }
        // Otherwise try user ID
        if (!targetMember) {
            const userId = args[0].replace(/[<@!>]/g, '');
            try {
                targetMember = await message.guild.members.fetch(userId);
            } catch {
                targetMember = null;
            }
        }
        await addMedia(
            targetMember,
            message.member,
            reply => message.reply(reply)
        );
    }
});
// ===============================
// LOGIN
// ===============================
client.login(TOKEN);
