const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder
} = require('discord.js');
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIX = '?';
// ===============================
// ROLE / CHANNEL CONFIG
// ===============================
const MEDIA_MANAGER_ROLE_ID = '1537977785753145378';
const MEDIA_ROLE_ID = '1537977818238165135';
const STAFF_ROLE_ID = '1537977796184379444';
const MOD_LOG_CHANNEL_ID = '1546195360349814924';
// 30-minute Media Manager cooldown
const MEDIA_COOLDOWN = 30 * 60 * 1000;
const mediaCooldowns = new Map();
// ===============================
// CLIENT
// ===============================
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
    // ADD MEDIA
    new SlashCommandBuilder()
        .setName('addmedia')
        .setDescription('Give a user the Media role.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to give the Media role to.')
                .setRequired(true)
        ),
    // WARN
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to warn.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the warning.')
                .setRequired(true)
        ),
    // KICK
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to kick.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the kick.')
                .setRequired(true)
        ),
    // BAN
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to ban.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the ban.')
                .setRequired(true)
        ),
    // MUTE
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to mute.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('time')
                .setDescription('Duration, such as 30m, 1h, or 7d.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the mute.')
                .setRequired(true)
        ),
    // UNMUTE
    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove a user's timeout.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to unmute.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for removing the mute.')
                .setRequired(true)
        )
].map(command => command.toJSON());
// ===============================
// REGISTER COMMANDS
// ===============================
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
// READY
// ===============================
client.once('ready', () => {
    console.log(`🍌 Banana Bot is online as ${client.user.tag}`);
});
// ===============================
// TIME PARSER
// ===============================
function parseDuration(input) {
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };
    const duration = amount * multipliers[unit];
    // Discord's maximum timeout is 28 days
    if (duration <= 0 || duration > 28 * 24 * 60 * 60 * 1000) {
        return null;
    }
    return duration;
}
// ===============================
// MOD LOG
// ===============================
async function sendModLog({
    action,
    target,
    moderator,
    reason,
    duration = null
}) {
    const channel = await client.channels
        .fetch(MOD_LOG_CHANNEL_ID)
        .catch(() => null);
    if (!channel) {
        console.error('Mod log channel could not be found.');
        return;
    }
    const embed = new EmbedBuilder()
        .setTitle(`🛡️ ${action}`)
        .addFields(
            {
                name: 'User',
                value: `${target.tag} (${target.id})`
            },
            {
                name: 'Moderator',
                value: `${moderator.user.tag} (${moderator.id})`
            },
            {
                name: 'Reason',
                value: reason
            }
        )
        .setTimestamp();
    if (duration) {
        embed.addFields({
            name: 'Duration',
            value: duration
        });
    }
    await channel.send({ embeds: [embed] }).catch(console.error);
}
// ===============================
// STAFF CHECK
// ===============================
function isStaff(member) {
    return member.roles.cache.has(STAFF_ROLE_ID);
}
// ===============================
// TARGET CHECK
// ===============================
function canModerate(executor, target) {
    if (!target) {
        return {
            allowed: false,
            message: '❌ I could not find that member.'
        };
    }
    if (target.id === executor.id) {
        return {
            allowed: false,
            message: '❌ You cannot moderate yourself.'
        };
    }
    if (target.id === client.user.id) {
        return {
            allowed: false,
            message: '❌ You cannot moderate Banana Bot.'
        };
    }
    if (
        target.roles.highest.position >=
        executor.roles.highest.position
    ) {
        return {
            allowed: false,
            message: '❌ You cannot moderate someone with a role equal to or higher than your highest role.'
        };
    }
    const botMember = target.guild.members.me;
    if (
        botMember &&
        target.roles.highest.position >=
        botMember.roles.highest.position
    ) {
        return {
            allowed: false,
            message: '❌ My bot role must be higher than the target user.'
        };
    }
    return {
        allowed: true
    };
}
// ===============================
// ADD MEDIA
// ===============================
async function addMedia(member, executor, reply) {
    if (!executor.roles.cache.has(MEDIA_MANAGER_ROLE_ID)) {
        return reply(
            '❌ You need the **Media Manager** role to use this command.'
        );
    }
    if (!member) {
        return reply('❌ I could not find that member.');
    }
    const now = Date.now();
    const cooldownEnd = mediaCooldowns.get(executor.id);
    if (cooldownEnd && now < cooldownEnd) {
        const remaining = cooldownEnd - now;
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor(
            (remaining % 60000) / 1000
        );
        return reply(
            `⏳ You're on cooldown! You can use this command again in **${minutes}m ${seconds}s**.`
        );
    }
    if (member.roles.cache.has(MEDIA_ROLE_ID)) {
        return reply(
            `⚠️ **${member.user.tag}** already has the **Media** role.`
        );
    }
    try {
        await member.roles.add(MEDIA_ROLE_ID);
        mediaCooldowns.set(
            executor.id,
            Date.now() + MEDIA_COOLDOWN
        );
        setTimeout(() => {
            mediaCooldowns.delete(executor.id);
        }, MEDIA_COOLDOWN);
        return reply(
            `🍌 **${member.user.tag}** has been given the **Media** role!\n` +
            `⏳ You can use \`addmedia\` again in **30 minutes**.`
        );
    } catch (error) {
        console.error(error);
        return reply(
            '❌ I could not give that user the Media role. Make sure Banana Bot has **Manage Roles** permission and its bot role is above the Media role.'
        );
    }
}
// ===============================
// WARN
// ===============================
async function warnMember(target, executor, reason, reply) {
    if (!isStaff(executor)) {
        return reply('❌ You need the **Staff** role to use moderation commands.');
    }
    const check = canModerate(executor, target);
    if (!check.allowed) {
        return reply(check.message);
    }
    await sendModLog({
        action: 'User Warned',
        target: target.user,
        moderator: executor,
        reason
    });
    return reply(
        `⚠️ **${target.user.tag}** has been warned.\n**Reason:** ${reason}`
    );
}
// ===============================
// KICK
// ===============================
async function kickMember(target, executor, reason, reply) {
    if (!isStaff(executor)) {
        return reply('❌ You need the **Staff** role to use moderation commands.');
    }
    const check = canModerate(executor, target);
    if (!check.allowed) {
        return reply(check.message);
    }
    try {
        await target.kick(reason);
        await sendModLog({
            action: 'User Kicked',
            target: target.user,
            moderator: executor,
            reason
        });
        return reply(
            `👢 **${target.user.tag}** has been kicked.\n**Reason:** ${reason}`
        );
    } catch (error) {
        console.error(error);
        return reply(
            '❌ I could not kick that user. Check Banana Bot permissions and role hierarchy.'
        );
    }
}
// ===============================
// BAN
// ===============================
async function banMember(target, executor, reason, reply) {
    if (!isStaff(executor)) {
        return reply('❌ You need the **Staff** role to use moderation commands.');
    }
    const check = canModerate(executor, target);
    if (!check.allowed) {
        return reply(check.message);
    }
    try {
        await target.ban({
            reason,
            deleteMessageSeconds: 0
        });
        await sendModLog({
            action: 'User Banned',
            target: target.user,
            moderator: executor,
            reason
        });
        return reply(
            `🔨 **${target.user.tag}** has been banned.\n**Reason:** ${reason}`
        );
    } catch (error) {
        console.error(error);
        return reply(
            '❌ I could not ban that user. Check Banana Bot permissions and role hierarchy.'
        );
    }
}
// ===============================
// MUTE
// ===============================
async function muteMember(
    target,
    executor,
    durationInput,
    reason,
    reply
) {
    if (!isStaff(executor)) {
        return reply('❌ You need the **Staff** role to use moderation commands.');
    }
    const check = canModerate(executor, target);
    if (!check.allowed) {
        return reply(check.message);
    }
    const duration = parseDuration(durationInput);
    if (!duration) {
        return reply(
            '❌ Invalid duration. Use something like `30m`, `1h`, `2h`, or `7d`.\nMaximum: **28 days**.'
        );
    }
    try {
        await target.timeout(duration, reason);
        await sendModLog({
            action: 'User Muted',
            target: target.user,
            moderator: executor,
            reason,
            duration: durationInput
        });
        return reply(
            `🔇 **${target.user.tag}** has been muted for **${durationInput}**.\n**Reason:** ${reason}`
        );
    } catch (error) {
        console.error(error);
        return reply(
            '❌ I could not mute that user. Check Banana Bot permissions and role hierarchy.'
        );
    }
}
// ===============================
// UNMUTE
// ===============================
async function unmuteMember(target, executor, reason, reply) {
    if (!isStaff(executor)) {
        return reply('❌ You need the **Staff** role to use moderation commands.');
    }
    const check = canModerate(executor, target);
    if (!check.allowed) {
        return reply(check.message);
    }
    try {
        await target.timeout(null, reason);
        await sendModLog({
            action: 'User Unmuted',
            target: target.user,
            moderator: executor,
            reason
        });
        return reply(
            `🔊 **${target.user.tag}** has been unmuted.\n**Reason:** ${reason}`
        );
    } catch (error) {
        console.error(error);
        return reply(
            '❌ I could not unmute that user.'
        );
    }
}
// ===============================
// SLASH COMMANDS
// ===============================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.commandName;
    // ADD MEDIA
    if (command === 'addmedia') {
        const target = interaction.options.getMember('user');
        return addMedia(
            target,
            interaction.member,
            message =>
                interaction.reply({
                    content: message,
                    ephemeral: true
                })
        );
    }
    // WARN
    if (command === 'warn') {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');
        return warnMember(
            target,
            interaction.member,
            reason,
            message =>
                interaction.reply({
                    content: message,
                    ephemeral: false
                })
        );
    }
    // KICK
    if (command === 'kick') {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');
        return kickMember(
            target,
            interaction.member,
            reason,
            message =>
                interaction.reply({
                    content: message
                })
        );
    }
    // BAN
    if (command === 'ban') {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');
        return banMember(
            target,
            interaction.member,
            reason,
            message =>
                interaction.reply({
                    content: message
                })
        );
    }
    // MUTE
    if (command === 'mute') {
        const target = interaction.options.getMember('user');
        const time = interaction.options.getString('time');
        const reason = interaction.options.getString('reason');
        return muteMember(
            target,
            interaction.member,
            time,
            reason,
            message =>
                interaction.reply({
                    content: message
                })
        );
    }
    // UNMUTE
    if (command === 'unmute') {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');
        return unmuteMember(
            target,
            interaction.member,
            reason,
            message =>
                interaction.reply({
                    content: message
                })
        );
    }
});
// ===============================
// PREFIX COMMANDS
// ===============================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content
        .slice(PREFIX.length)
        .trim()
        .split(/\s+/);
    const command = args.shift()?.toLowerCase();
    // ===========================
    // ADD MEDIA
    // ===========================
    if (command === 'addmedia') {
        if (!args[0]) {
            return message.reply(
                '❌ Usage: `?addmedia @user`'
            );
        }
        let targetMember = message.mentions.members.first();
        if (!targetMember) {
            const userId = args[0].replace(/[<@!>]/g, '');
            try {
                targetMember =
                    await message.guild.members.fetch(userId);
            } catch {
                targetMember = null;
            }
        }
        return addMedia(
            targetMember,
            message.member,
            reply => message.reply(reply)
        );
    }
    // ===========================
    // WARN
    // ===========================
    if (command === 'warn') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply(
                '❌ Usage: `?warn @user reason`'
            );
        }
        const reason = args
            .slice(1)
            .join(' ');
        if (!reason) {
            return message.reply(
                '❌ You must provide a reason.\nUsage: `?warn @user reason`'
            );
        }
        return warnMember(
            targetMember,
            message.member,
            reason,
            reply => message.reply(reply)
        );
    }
    // ===========================
    // KICK
    // ===========================
    if (command === 'kick') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply(
                '❌ Usage: `?kick @user reason`'
            );
        }
        const reason = args
            .slice(1)
            .join(' ');
        if (!reason) {
            return message.reply(
                '❌ You must provide a reason.\nUsage: `?kick @user reason`'
            );
        }
        return kickMember(
            targetMember,
            message.member,
            reason,
            reply => message.reply(reply)
        );
    }
    // ===========================
    // BAN
    // ===========================
    if (command === 'ban') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply(
                '❌ Usage: `?ban @user reason`'
            );
        }
        const reason = args
            .slice(1)
            .join(' ');
        if (!reason) {
            return message.reply(
                '❌ You must provide a reason.\nUsage: `?ban @user reason`'
            );
        }
        return banMember(
            targetMember,
            message.member,
            reason,
            reply => message.reply(reply)
        );
    }
    // ===========================
    // MUTE
    // ===========================
    if (command === 'mute') {
        const targetMember = message.mentions.members.first();
        if (!targetMember || !args[1]) {
            return message.reply(
                '❌ Usage: `?mute @user time reason`\nExample: `?mute @user 30m spamming`'
            );
        }
        const time = args[1];
        const reason = args
            .slice(2)
            .join(' ');
        if (!reason) {
            return message.reply(
                '❌ You must provide a reason.\nUsage: `?mute @user time reason`'
            );
        }
        return muteMember(
            targetMember,
            message.member,
            time,
            reason,
            reply => message.reply(reply)
        );
    }
    // ===========================
    // UNMUTE
    // ===========================
    if (command === 'unmute') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply(
                '❌ Usage: `?unmute @user reason`'
            );
        }
        const reason = args
            .slice(1)
            .join(' ');
        if (!reason) {
            return message.reply(
                '❌ You must provide a reason.\nUsage: `?unmute @user reason`'
            );
        }
        return unmuteMember(
            targetMember,
            message.member,
            reason,
            reply => message.reply(reply)
        );
    }
});
// ===============================
// LOGIN
// ===============================
client.login(TOKEN);
