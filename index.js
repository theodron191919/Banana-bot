const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActivityType
} = require('discord.js');
const funCommands = require('./commands/fun');

// ==============================
// CONFIG
// ==============================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const MEDIA_MANAGER_ROLE_ID = '1537977785753145378';
const MEDIA_ROLE_ID = '1537977818238165135';
const STAFF_ROLE_ID = '1537977796184379444';

const MOD_LOG_CHANNEL_ID = '1546195360349814924';

// ONLY THESE ROLES CAN BAN
const BAN_ROLE_IDS = [
    '1542347653596061786',
    '1548460109922046032'
];

const PREFIX = '?';

// ==============================
// CLIENT
// ==============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==============================
// STORAGE
// ==============================

// Media manager cooldowns
const mediaCooldowns = new Map();

// User warnings
const warnings = new Map();

// Automod settings per server
const automodSettings = new Map();

// Spam tracking
const spamTracker = new Map();

// Reminders
const reminders = new Map();

// ==============================
// HELPERS
// ==============================

function isStaff(member) {
    return member?.roles?.cache?.has(STAFF_ROLE_ID);
}

function canBan(member) {
    return BAN_ROLE_IDS.some(roleId =>
        member?.roles?.cache?.has(roleId)
    );
}

function getWarnings(guildId, userId) {
    const key = `${guildId}:${userId}`;

    if (!warnings.has(key)) {
        warnings.set(key, []);
    }

    return warnings.get(key);
}

function parseDuration(input) {
    if (!input) return null;

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

    // Discord timeout maximum
    if (duration > 28 * 24 * 60 * 60 * 1000) {
        return null;
    }

    return duration;
}

function formatDuration(ms) {
    if (!ms) return 'Unknown';

    const seconds = Math.floor(ms / 1000);

    if (seconds < 60) {
        return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h`;
    }

    const days = Math.floor(hours / 24);

    return `${days}d`;
}

async function sendModLog(guild, action, target, moderator, reason) {
    try {
        const channel = guild.channels.cache.get(
            MOD_LOG_CHANNEL_ID
        );

        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🛡️ ${action}`)
            .addFields(
                {
                    name: 'User',
                    value: `${target?.tag || target?.user?.tag || 'Unknown'}`
                },
                {
                    name: 'Moderator',
                    value: `${moderator?.user?.tag || moderator?.tag || 'Unknown'}`
                },
                {
                    name: 'Reason',
                    value: reason || 'No reason provided'
                }
            )
            .setTimestamp();

        await channel.send({
            embeds: [embed]
        });
    } catch (error) {
        console.error('Mod log error:', error);
    }
}

function canModerate(executor, target) {
    if (!target) {
        return {
            allowed: false,
            reason: '❌ User not found.'
        };
    }

    if (target.id === executor.id) {
        return {
            allowed: false,
            reason: '❌ You cannot moderate yourself.'
        };
    }

    if (
        target.roles.highest.position >=
        executor.roles.highest.position
    ) {
        return {
            allowed: false,
            reason: '❌ You cannot moderate someone with an equal or higher role.'
        };
    }

    if (target.id === executor.guild.ownerId) {
        return {
            allowed: false,
            reason: '❌ You cannot moderate the server owner.'
        };
    }

    return {
        allowed: true
    };
}

// ==============================
// SLASH COMMANDS
// ==============================

const slashCommands = [

    // MEDIA
    new SlashCommandBuilder()
        .setName('addmedia')
        .setDescription('Give a user the Media role.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to give Media to.')
                .setRequired(true)
        ),

    // WARN
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to warn.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the warning.')
                .setRequired(true)
        ),

    // WARNINGS
    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View a user\'s warnings.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check.')
                .setRequired(false)
        ),

    // CLEAR WARNINGS
    new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear a user\'s warnings.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User whose warnings should be cleared.')
                .setRequired(true)
        ),

    // KICK
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to kick.')
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
        .setDescription('Ban a member.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to ban.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the ban.')
                .setRequired(true)
        ),

    // UNBAN
    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user.')
        .addStringOption(option =>
            option
                .setName('userid')
                .setDescription('Discord user ID.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason.')
                .setRequired(true)
        ),

    // SOFTBAN
    new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Ban and immediately unban a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to softban.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason.')
                .setRequired(true)
        ),

    // MUTE
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a member.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to timeout.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Example: 10m, 1h, 1d.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason.')
                .setRequired(true)
        ),

    // UNMUTE
    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove a user\'s timeout.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to unmute.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason.')
                .setRequired(true)
        ),

    // PURGE
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete multiple messages.')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Number of messages.')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),

    // SLOWMODE
    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set channel slowmode.')
        .addIntegerOption(option =>
            option
                .setName('seconds')
                .setDescription('Slowmode seconds.')
                .setMinValue(0)
                .setMaxValue(21600)
                .setRequired(true)
        ),

    // LOCK
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel.'),

    // UNLOCK
    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel.'),

    // NICK
    new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Change a member\'s nickname.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('nickname')
                .setDescription('New nickname.')
                .setRequired(true)
        ),

    // ROLE
    new SlashCommandBuilder()
        .setName('role')
        .setDescription('Add or remove a role.')
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Add or remove.')
                .setRequired(true)
                .addChoices(
                    {
                        name: 'Add',
                        value: 'add'
                    },
                    {
                        name: 'Remove',
                        value: 'remove'
                    }
                )
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User.')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Role.')
                .setRequired(true)
        ),

    // AUTOMOD
    new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure automod.')
        .addStringOption(option =>
            option
                .setName('setting')
                .setDescription('Enable or disable.')
                .setRequired(true)
                .addChoices(
                    {
                        name: 'Enable',
                        value: 'on'
                    },
                    {
                        name: 'Disable',
                        value: 'off'
                    }
                )
        ),

    // PING
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency.'),

    // SERVER INFO
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('View server information.'),

    // USER INFO
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('View user information.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User.')
                .setRequired(false)
        ),

    // AVATAR
    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('View a user\'s avatar.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User.')
                .setRequired(false)
        ),

    // MEMBER COUNT
    new SlashCommandBuilder()
        .setName('membercount')
        .setDescription('Show server member count.'),

    // BOT INFO
    new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Show information about Banana Bot.'),

    // 8BALL
    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask Banana Bot a question.')
        .addStringOption(option =>
            option
                .setName('question')
                .setDescription('Your question.')
                .setRequired(true)
        ),

    // COINFLIP
    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin.'),

    // ROLL
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll a number.')
        .addIntegerOption(option =>
            option
                .setName('max')
                .setDescription('Maximum number.')
                .setMinValue(2)
                .setMaxValue(1000000)
                .setRequired(false)
        ),

    // CHOOSE
    new SlashCommandBuilder()
        .setName('choose')
        .setDescription('Choose between options.')
        .addStringOption(option =>
            option
                .setName('options')
                .setDescription('Separate options with commas.')
                .setRequired(true)
        ),

    // RATE
    new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Rate something.')
        .addStringOption(option =>
            option
                .setName('thing')
                .setDescription('What should be rated?')
                .setRequired(true)
        ),

    // RPS
    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play rock paper scissors.')
        .addStringOption(option =>
            option
                .setName('choice')
                .setDescription('Your choice.')
                .setRequired(true)
                .addChoices(
                    {
                        name: 'Rock',
                        value: 'rock'
                    },
                    {
                        name: 'Paper',
                        value: 'paper'
                    },
                    {
                        name: 'Scissors',
                        value: 'scissors'
                    }
                )
        ),

    // HELP
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show Banana Bot commands.'),

    // REMIND
    new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder.')
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Example: 10m, 1h, 1d.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Reminder message.')
                .setRequired(true)
        )
];

// Remove duplicate command names
const allSlashCommands = [
    ...slashCommands,
    ...funCommands.map(command => command.data)
];

const uniqueCommands = [
    ...new Map(
        allSlashCommands.map(command => [
            command.name,
            command
        ])
    ).values()
].map(command => command.toJSON());

// ==============================
// REGISTER COMMANDS
// ==============================

const rest = new REST({
    version: '10'
}).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log('Registering slash commands...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: uniqueCommands
            }
        );

        console.log(
            `Registered ${uniqueCommands.length} slash commands.`
        );
    } catch (error) {
        console.error(
            'Failed to register commands:',
            error
        );
    }
}
// ==============================
// COMMAND HANDLERS
// ==============================

async function handleAddMedia(interaction) {
    const member = interaction.member;

    if (!member.roles.cache.has(MEDIA_MANAGER_ROLE_ID)) {
        return interaction.reply({
            content: '❌ You need the **Media Manager** role to use this command.',
            ephemeral: true
        });
    }

    const now = Date.now();
    const cooldown = mediaCooldowns.get(member.id) || 0;

    if (now < cooldown) {
        const remaining = cooldown - now;

        return interaction.reply({
            content: `⏳ You must wait **${formatDuration(remaining)}** before using \`/addmedia\` again.`,
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

    if (target.roles.cache.has(MEDIA_ROLE_ID)) {
        return interaction.reply({
            content: 'ℹ️ That user already has the **Media** role.',
            ephemeral: true
        });
    }

    try {
        await target.roles.add(
            MEDIA_ROLE_ID,
            `Added by Media Manager ${interaction.user.tag}`
        );

        mediaCooldowns.set(
            member.id,
            now + (30 * 60 * 1000)
        );

        await interaction.reply(
            `✅ ${target} has been given the **Media** role.`
        );

        await sendModLog(
            interaction.guild,
            'Media Role Added',
            target,
            member,
            'Media Manager added Media role.'
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ I could not give that role. Check my role position and permissions.',
            ephemeral: true
        });
    }
}


// ==============================
// WARN
// ==============================

async function handleWarn(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role to use moderation commands.',
            ephemeral: true
        });
    }

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    const check = canModerate(executor, target);

    if (!check.allowed) {
        return interaction.reply({
            content: check.reason,
            ephemeral: true
        });
    }

    const userWarnings = getWarnings(
        interaction.guild.id,
        target.id
    );

    userWarnings.push({
        reason,
        moderator: interaction.user.tag,
        timestamp: Date.now()
    });

    await interaction.reply(
        `⚠️ ${target} has been warned.\n**Reason:** ${reason}\n**Total warnings:** ${userWarnings.length}`
    );

    await sendModLog(
        interaction.guild,
        'Warning',
        target,
        executor,
        reason
    );
}


// ==============================
// VIEW WARNINGS
// ==============================

async function handleWarnings(interaction) {
    const targetUser =
        interaction.options.getUser('user') ||
        interaction.user;

    const userWarnings = getWarnings(
        interaction.guild.id,
        targetUser.id
    );

    if (userWarnings.length === 0) {
        return interaction.reply(
            `ℹ️ **${targetUser.tag}** has no warnings.`
        );
    }

    const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warnings — ${targetUser.tag}`)
        .setDescription(
            userWarnings
                .map((warning, index) =>
                    `**${index + 1}.** ${warning.reason}\n` +
                    `Moderator: ${warning.moderator}\n` +
                    `<t:${Math.floor(warning.timestamp / 1000)}:R>`
                )
                .join('\n\n')
        )
        .setTimestamp();

    await interaction.reply({
        embeds: [embed]
    });
}


// ==============================
// CLEAR WARNINGS
// ==============================

async function handleClearWarnings(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const target = interaction.options.getMember('user');

    if (!target) {
        return interaction.reply({
            content: '❌ User not found.',
            ephemeral: true
        });
    }

    const key =
        `${interaction.guild.id}:${target.id}`;

    const previous =
        warnings.get(key)?.length || 0;

    warnings.delete(key);

    await interaction.reply(
        `🧹 Cleared **${previous}** warning(s) from ${target}.`
    );

    await sendModLog(
        interaction.guild,
        'Warnings Cleared',
        target,
        executor,
        `Cleared ${previous} warning(s).`
    );
}


// ==============================
// KICK
// ==============================

async function handleKick(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    const check = canModerate(executor, target);

    if (!check.allowed) {
        return interaction.reply({
            content: check.reason,
            ephemeral: true
        });
    }

    if (!target.kickable) {
        return interaction.reply({
            content: '❌ I cannot kick that member. Check my role hierarchy and permissions.',
            ephemeral: true
        });
    }

    try {
        await target.kick(reason);

        await interaction.reply(
            `👢 **${target.user.tag}** has been kicked.\n**Reason:** ${reason}`
        );

        await sendModLog(
            interaction.guild,
            'Member Kicked',
            target.user,
            executor,
            reason
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ Failed to kick that member.',
            ephemeral: true
        });
    }
}


// ==============================
// BAN
// ==============================

async function handleBan(interaction) {
    const executor = interaction.member;

    if (!canBan(executor)) {
        return interaction.reply({
            content: '❌ You do not have permission to use **ban**.',
            ephemeral: true
        });
    }

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    if (!target) {
        return interaction.reply({
            content: '❌ User not found in this server.',
            ephemeral: true
        });
    }

    const check = canModerate(executor, target);

    if (!check.allowed) {
        return interaction.reply({
            content: check.reason,
            ephemeral: true
        });
    }

    if (!target.bannable) {
        return interaction.reply({
            content: '❌ I cannot ban that member. Check my role hierarchy and permissions.',
            ephemeral: true
        });
    }

    try {
        await target.ban({
            reason
        });

        await interaction.reply(
            `🔨 **${target.user.tag}** has been banned.\n**Reason:** ${reason}`
        );

        await sendModLog(
            interaction.guild,
            'Member Banned',
            target.user,
            executor,
            reason
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ Failed to ban that member.',
            ephemeral: true
        });
    }
}


// ==============================
// UNBAN
// ==============================

async function handleUnban(interaction) {
    const executor = interaction.member;

    if (!canBan(executor)) {
        return interaction.reply({
            content: '❌ You do not have permission to use **unban**.',
            ephemeral: true
        });
    }

    const userId =
        interaction.options.getString('userid');

    const reason =
        interaction.options.getString('reason');

    try {
        const user =
            await interaction.guild.bans.fetch(userId);

        await interaction.guild.members.unban(
            userId,
            reason
        );

        await interaction.reply(
            `🔓 **${user.user.tag}** has been unbanned.\n**Reason:** ${reason}`
        );

        await sendModLog(
            interaction.guild,
            'Member Unbanned',
            user.user,
            executor,
            reason
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ I could not unban that user. Make sure the ID is correct and they are actually banned.',
            ephemeral: true
        });
    }
}


// ==============================
// SOFTBAN
// ==============================

async function handleSoftban(interaction) {
    const executor = interaction.member;

    if (!canBan(executor)) {
        return interaction.reply({
            content: '❌ You do not have permission to use **softban**.',
            ephemeral: true
        });
    }

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    if (!target) {
        return interaction.reply({
            content: '❌ User not found.',
            ephemeral: true
        });
    }

    const check = canModerate(executor, target);

    if (!check.allowed) {
        return interaction.reply({
            content: check.reason,
            ephemeral: true
        });
    }

    if (!target.bannable) {
        return interaction.reply({
            content: '❌ I cannot softban that member.',
            ephemeral: true
        });
    }

    try {
        await target.ban({
            deleteMessageSeconds: 86400,
            reason
        });

        await interaction.guild.members.unban(
            target.id,
            'Softban completed'
        );

        await interaction.reply(
            `🧹 **${target.user.tag}** has been softbanned.\n**Reason:** ${reason}`
        );

        await sendModLog(
            interaction.guild,
            'Member Softbanned',
            target.user,
            executor,
            reason
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ Failed to softban that member.',
            ephemeral: true
        });
    }
}


// ==============================
// MUTE
// ==============================

async function handleMute(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const target = interaction.options.getMember('user');
    const durationInput =
        interaction.options.getString('duration');

    const reason =
        interaction.options.getString('reason');

    const duration =
        parseDuration(durationInput);

    if (!duration) {
        return interaction.reply({
            content: '❌ Invalid duration. Use something like `10m`, `2h`, or `1d`.',
            ephemeral: true
        });
    }

    const check = canModerate(executor, target);

    if (!check.allowed) {
        return interaction.reply({
            content: check.reason,
            ephemeral: true
        });
    }

    if (!target.moderatable) {
        return interaction.reply({
            content: '❌ I cannot timeout that member.',
            ephemeral: true
        });
    }

    try {
        await target.timeout(
            duration,
            reason
        );

        await interaction.reply(
            `🔇 **${target.user.tag}** has been muted for **${formatDuration(duration)}**.\n**Reason:** ${reason}`
        );

        await sendModLog(
            interaction.guild,
            'Member Muted',
            target.user,
            executor,
            `${reason} — Duration: ${formatDuration(duration)}`
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ Failed to mute that member.',
            ephemeral: true
        });
    }
}


// ==============================
// UNMUTE
// ==============================

async function handleUnmute(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const target = interaction.options.getMember('user');
    const reason =
        interaction.options.getString('reason');

    const check = canModerate(executor, target);

    if (!check.allowed) {
        return interaction.reply({
            content: check.reason,
            ephemeral: true
        });
    }

    try {
        await target.timeout(
            null,
            reason
        );

        await interaction.reply(
            `🔊 **${target.user.tag}** has been unmuted.\n**Reason:** ${reason}`
        );

        await sendModLog(
            interaction.guild,
            'Member Unmuted',
            target.user,
            executor,
            reason
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ Failed to unmute that member.',
            ephemeral: true
        });
    }
}


// ==============================
// PURGE
// ==============================

async function handlePurge(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const amount =
        interaction.options.getInteger('amount');

    try {
        const deleted =
            await interaction.channel.bulkDelete(
                amount,
                true
            );

        await interaction.reply({
            content: `🧹 Deleted **${deleted.size}** messages.`,
            ephemeral: true
        });

        await sendModLog(
            interaction.guild,
            'Messages Purged',
            interaction.user,
            executor,
            `Deleted ${deleted.size} messages.`
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ I could not delete those messages.',
            ephemeral: true
        });
    }
}


// ==============================
// SLOWMODE
// ==============================

async function handleSlowmode(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const seconds =
        interaction.options.getInteger('seconds');

    try {
        await interaction.channel.setRateLimitPerUser(
            seconds
        );

        await interaction.reply(
            seconds === 0
                ? '🐌 Slowmode has been **disabled**.'
                : `🐌 Slowmode set to **${seconds} seconds**.`
        );

        await sendModLog(
            interaction.guild,
            'Slowmode Changed',
            interaction.user,
            executor,
            `${seconds} seconds`
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ Failed to change slowmode.',
            ephemeral: true
        });
    }
}
// ==============================
// LOCK CHANNEL
// ==============================

async function handleLock(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    try {
        await interaction.channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            {
                SendMessages: false
            }
        );

        await interaction.reply(
            '🔒 This channel has been **locked**.'
        );

        await sendModLog(
            interaction.guild,
            'Channel Locked',
            interaction.user,
            executor,
            `#${interaction.channel.name}`
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ I could not lock this channel.',
            ephemeral: true
        });
    }
}


// ==============================
// UNLOCK CHANNEL
// ==============================

async function handleUnlock(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    try {
        await interaction.channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            {
                SendMessages: null
            }
        );

        await interaction.reply(
            '🔓 This channel has been **unlocked**.'
        );

        await sendModLog(
            interaction.guild,
            'Channel Unlocked',
            interaction.user,
            executor,
            `#${interaction.channel.name}`
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ I could not unlock this channel.',
            ephemeral: true
        });
    }
}


// ==============================
// NICKNAME
// ==============================

async function handleNick(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const target =
        interaction.options.getMember('user');

    const nickname =
        interaction.options.getString('nickname');

    const check = canModerate(
        executor,
        target
    );

    if (!check.allowed) {
        return interaction.reply({
            content: check.reason,
            ephemeral: true
        });
    }

    if (!target.manageable) {
        return interaction.reply({
            content: '❌ I cannot change that member\'s nickname.',
            ephemeral: true
        });
    }

    try {
        await target.setNickname(
            nickname,
            `Changed by ${interaction.user.tag}`
        );

        await interaction.reply(
            `✏️ Changed **${target.user.tag}**'s nickname to **${nickname}**.`
        );

        await sendModLog(
            interaction.guild,
            'Nickname Changed',
            target.user,
            executor,
            `New nickname: ${nickname}`
        );

    } catch (error) {
        console.error(error);

        await interaction.reply({
            content: '❌ Failed to change nickname.',
            ephemeral: true
        });
    }
}


// ==============================
// ROLE MANAGEMENT
// ==============================

async function handleRole(interaction) {
    const executor = interaction.member;

    if (!isStaff(executor)) {
        return interaction.reply({
            content: '❌ You need the **Staff** role.',
            ephemeral: true
        });
    }

    const action =
        interaction.options.getString('action');

    const target =
        interaction.options.getMember('user');

    const role =
        interaction.options.getRole('role');

    if (!target || !role) {

        return interaction.reply({

            content: '❌ User or role not found.',

            ephemeral: true

        });

    }

    const check = canModerate(

        executor,

        target

    );

    if (!check.allowed) {

        return interaction.reply({

            content: check.reason,

            ephemeral: true

        });

    }

    // Staff cannot manage roles equal to or higher

    // than their own highest role.

    if (

        role.position >=

        executor.roles.highest.position

    ) {

        return interaction.reply({

            content: '❌ You cannot manage a role equal to or higher than your highest role.',

            ephemeral: true

        });

    }

    // Bot hierarchy check

    if (

        role.position >=

        interaction.guild.members.me.roles.highest.position

    ) {

        return interaction.reply({

            content: '❌ I cannot manage that role because it is above my highest role.',

            ephemeral: true

        });

    }

    try {

        if (action === 'add') {

            await target.roles.add(

                role,

                `Added by ${interaction.user.tag}`

            );

            await interaction.reply(

                `✅ Added ${role} to ${target}.`

            );

            await sendModLog(

                interaction.guild,

                'Role Added',

                target.user,

                executor,

                `Role: ${role.name}`

            );

        }

        if (action === 'remove') {

            await target.roles.remove(

                role,

                `Removed by ${interaction.user.tag}`

            );

            await interaction.reply(

                `✅ Removed ${role} from ${target}.`

            );

            await sendModLog(

                interaction.guild,

                'Role Removed',

                target.user,

                executor,

                `Role: ${role.name}`

            );

        }

    } catch (error) {

        console.error(error);

        await interaction.reply({

            content: '❌ Failed to modify that role.',

            ephemeral: true

        });

    }

}

// ==============================

// AUTOMOD SETTINGS

// ==============================

async function handleAutomod(interaction) {

    const executor = interaction.member;

    if (!isStaff(executor)) {

        return interaction.reply({

            content: '❌ You need the **Staff** role.',

            ephemeral: true

        });

    }

    const setting =

        interaction.options.getString('setting');

    automodSettings.set(

        interaction.guild.id,

        setting === 'on'

    );

    await interaction.reply(

        setting === 'on'

            ? '🤖 **Automod has been enabled.**'

            : '🤖 **Automod has been disabled.**'

    );

    await sendModLog(

        interaction.guild,

        'Automod Setting Changed',

        interaction.user,

        executor,

        `Automod: ${setting === 'on' ? 'Enabled' : 'Disabled'}`

    );

}

// ==============================

// PING

// ==============================

async function handlePing(interaction) {

    const sent =

        await interaction.reply({

            content: '🏓 Calculating...',

            fetchReply: true

        });

    const latency =

        sent.createdTimestamp -

        interaction.createdTimestamp;

    await interaction.editReply(

        `🏓 **Pong!**\n` +

        `Bot latency: **${latency}ms**\n` +

        `API latency: **${client.ws.ping}ms**`

    );

}

// ==============================

// SERVER INFO

// ==============================

async function handleServerInfo(interaction) {

    const guild = interaction.guild;

    const embed = new EmbedBuilder()

        .setTitle(`📊 ${guild.name}`)

        .setThumbnail(

            guild.iconURL({

                dynamic: true

            })

        )

        .addFields(

            {

                name: '👑 Owner',

                value: `<@${guild.ownerId}>`,

                inline: true

            },

            {

                name: '👥 Members',

                value: `${guild.memberCount}`,

                inline: true

            },

            {

                name: '💬 Channels',

                value: `${guild.channels.cache.size}`,

                inline: true

            },

            {

                name: '🎭 Roles',

                value: `${guild.roles.cache.size}`,

                inline: true

            },

            {

                name: '🆔 Server ID',

                value: guild.id,

                inline: true

            },

            {

                name: '📅 Created',

                value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,

                inline: false

            }

        )

        .setTimestamp();

    await interaction.reply({

        embeds: [embed]

    });

}

// ==============================

// USER INFO

// ==============================

async function handleUserInfo(interaction) {

    const user =

        interaction.options.getUser('user') ||

        interaction.user;

    const member =

        interaction.guild.members.cache.get(

            user.id

        );

    const roles =

        member?.roles.cache

            .filter(role => role.id !== interaction.guild.id)

            .map(role => role.toString())

            .reverse()

            .join(' ') || 'None';

    const embed = new EmbedBuilder()

        .setTitle(`👤 ${user.tag}`)

        .setThumbnail(

            user.displayAvatarURL({

                dynamic: true,

                size: 512

            })

        )

        .addFields(

            {

                name: '🆔 User ID',

                value: user.id,

                inline: false

            },

            {

                name: '📅 Account Created',

                value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,

                inline: false

            },

            {

                name: '📥 Joined Server',

                value: member?.joinedTimestamp

                    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`

                    : 'Unknown',

                inline: false

            },

            {

                name: '🎭 Roles',

                value: roles || 'None',

                inline: false

            }

        )

        .setTimestamp();

    await interaction.reply({

        embeds: [embed]

    });

}

// ==============================

// AVATAR

// ==============================

async function handleAvatar(interaction) {

    const user =

        interaction.options.getUser('user') ||

        interaction.user;

    const avatar =

        user.displayAvatarURL({

            dynamic: true,

            size: 4096

        });

    const embed = new EmbedBuilder()

        .setTitle(`🖼️ ${user.tag}'s Avatar`)

        .setImage(avatar)

        .setURL(avatar);

    await interaction.reply({

        embeds: [embed]

    });

}

// ==============================

// MEMBER COUNT

// ==============================

async function handleMemberCount(interaction) {

    const guild = interaction.guild;

    await interaction.reply(

        `👥 **${guild.name}** currently has **${guild.memberCount} members**.`

    );

}

// ==============================

// BOT INFO

// ==============================

async function handleBotInfo(interaction) {

    const uptime =

        formatDuration(client.uptime);

    const embed = new EmbedBuilder()

        .setTitle('🍌 Banana Bot')

        .setDescription(

            'A moderation and utility bot built for this server.'

        )

        .addFields(

            {

                name: '⏱️ Uptime',

                value: uptime,

                inline: true

            },

            {

                name: '🏠 Servers',

                value: `${client.guilds.cache.size}`,

                inline: true

            },

            {

                name: '👥 Users',

                value: `${client.users.cache.size}`,

                inline: true

            },

            {

                name: '⚡ API Latency',

                value: `${client.ws.ping}ms`,

                inline: true

            },

            {

                name: '📚 Commands',

                value: `${uniqueCommands.length}`,

                inline: true

            },

            {

                name: '🔧 Library',

                value: 'discord.js v14',

                inline: true

            }

        )

        .setTimestamp();

    await interaction.reply({

        embeds: [embed]

    });

}

// ==============================

// MEMBER COUNT EVENT INFO

// ==============================

function getOnlineCount(guild) {

    return guild.members.cache.filter(

        member => member.presence?.status &&

        member.presence.status !== 'offline'

    ).size;

}

// ==============================

// AUTOMOD SPAM CHECK

// ==============================

async function checkSpam(message) {

    if (

        !message.guild ||

        message.author.bot

    ) {

        return;

    }

    if (

        isStaff(message.member)

    ) {

        return;

    }

    const enabled =

        automodSettings.get(

            message.guild.id

        );

    // Automod is OFF unless enabled.

    if (enabled !== true) {

        return;

    }

    const key =

        `${message.guild.id}:${message.author.id}`;

    const now = Date.now();

    let messages =

        spamTracker.get(key) || [];

    messages = messages.filter(

        timestamp =>

            now - timestamp < 8000

    );

    messages.push(now);

    spamTracker.set(

        key,

        messages

    );

    // 6 messages in 8 seconds

    if (messages.length >= 6) {

        spamTracker.delete(key);

        try {

            if (message.member.moderatable) {

                await message.member.timeout(

                    30 * 1000,

                    'Automod: Spam'

                );

                await message.channel.send(

                    `🤖 ${message.author} has been timed out for **30 seconds** for spamming.`

                );

                await sendModLog(

                    message.guild,

                    'Automod Timeout',

                    message.author,

                    message.guild.members.me,

                    'Spam detection'

                );

            }

        } catch (error) {

            console.error(

                'Automod error:',

                error

            );

        }

    }

}
// ==============================
// FUN COMMANDS
// ==============================

async function handle8Ball(interaction) {
    const answers = [
        'Yes.',
        'No.',
        'Definitely.',
        'Absolutely not.',
        'Probably.',
        'Probably not.',
        'It is certain.',
        'Without a doubt.',
        'Ask again later.',
        'I cannot predict that.',
        'Very likely.',
        'My sources say no.'
    ];

    const question =
        interaction.options.getString('question');

    const answer =
        answers[Math.floor(Math.random() * answers.length)];

    await interaction.reply(
        `🎱 **Question:** ${question}\n**Answer:** ${answer}`
    );
}


// ==============================
// COINFLIP
// ==============================

async function handleCoinflip(interaction) {
    const result =
        Math.random() < 0.5
            ? 'Heads'
            : 'Tails';

    await interaction.reply(
        `🪙 The coin landed on **${result}**!`
    );
}


// ==============================
// ROLL
// ==============================

async function handleRoll(interaction) {
    const max =
        interaction.options.getInteger('max') || 100;

    const result =
        Math.floor(Math.random() * max) + 1;

    await interaction.reply(
        `🎲 You rolled **${result}** out of **${max}**!`
    );
}


// ==============================
// CHOOSE
// ==============================

async function handleChoose(interaction) {
    const input =
        interaction.options.getString('options');

    const options =
        input
            .split(',')
            .map(option => option.trim())
            .filter(Boolean);

    if (options.length < 2) {
        return interaction.reply({
            content: '❌ Give me at least **2 options**, separated by commas.',
            ephemeral: true
        });
    }

    const choice =
        options[
            Math.floor(Math.random() * options.length)
        ];

    await interaction.reply(
        `🤔 I choose: **${choice}**`
    );
}


// ==============================
// RATE
// ==============================

async function handleRate(interaction) {
    const thing =
        interaction.options.getString('thing');

    const rating =
        Math.floor(Math.random() * 101);

    await interaction.reply(
        `🍌 I rate **${thing}** a **${rating}/100**.`
    );
}


// ==============================
// ROCK PAPER SCISSORS
// ==============================

async function handleRPS(interaction) {
    const userChoice =
        interaction.options.getString('choice');

    const choices = [
        'rock',
        'paper',
        'scissors'
    ];

    const botChoice =
        choices[
            Math.floor(Math.random() * choices.length)
        ];

    let result;

    if (userChoice === botChoice) {
        result = 'It\'s a **tie**!';
    } else if (
        (userChoice === 'rock' &&
            botChoice === 'scissors') ||
        (userChoice === 'paper' &&
            botChoice === 'rock') ||
        (userChoice === 'scissors' &&
            botChoice === 'paper')
    ) {
        result = '🎉 **You win!**';
    } else {
        result = '💀 **I win!**';
    }

    await interaction.reply(
        `🪨📄✂️ You chose **${userChoice}**.\n` +
        `🍌 Banana Bot chose **${botChoice}**.\n\n` +
        result
    );
}


// ==============================
// HELP
// ==============================

async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🍌 Banana Bot — Commands')
        .setDescription(
            'Here are the commands available to you.'
        )
        .addFields(
            {
                name: '🛡️ Moderation',
                value:
                    '`/warn` `/warnings` `/clearwarnings`\n' +
                    '`/kick` `/ban` `/unban` `/softban`\n' +
                    '`/mute` `/unmute` `/purge`\n' +
                    '`/slowmode` `/lock` `/unlock`\n' +
                    '`/nick` `/role` `/automod`',
                inline: false
            },
            {
                name: '🎥 Media',
                value:
                    '`/addmedia`',
                inline: false
            },
            {
                name: 'ℹ️ Information',
                value:
                    '`/ping` `/serverinfo` `/userinfo`\n' +
                    '`/avatar` `/membercount` `/botinfo`',
                inline: false
            },
            {
                name: '😂 Fun',
                value:
                    '`/8ball` `/coinflip` `/roll`\n' +
                    '`/choose` `/rate` `/rps`',
                inline: false
            },
            {
                name: '⏰ Utility',
                value:
                    '`/remind` `/help`',
                inline: false
            },
            {
                name: '⌨️ Prefix',
                value:
                    'Prefix commands use `?`\n' +
                    'Example: `?ping`',
                inline: false
            }
        )
        .setFooter({
            text: 'Banana Bot'
        })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed]
    });
}


// ==============================
// REMINDER
// ==============================

async function handleReminder(interaction) {
    const durationInput =
        interaction.options.getString('duration');

    const reminderMessage =
        interaction.options.getString('message');

    const duration =
        parseDuration(durationInput);

    if (!duration) {
        return interaction.reply({
            content: '❌ Invalid duration. Example: `10m`, `1h`, or `1d`.',
            ephemeral: true
        });
    }

    if (duration > 7 * 24 * 60 * 60 * 1000) {
        return interaction.reply({
            content: '❌ Reminders cannot be longer than 7 days.',
            ephemeral: true
        });
    }

    await interaction.reply(
        `⏰ I'll remind you in **${formatDuration(duration)}**.`
    );

    const reminderId =
        `${interaction.user.id}-${Date.now()}`;

    const timeout =
        setTimeout(async () => {
            try {
                await interaction.user.send(
                    `⏰ **Reminder:** ${reminderMessage}`
                );
            } catch (error) {
                console.error(
                    'Could not DM reminder:',
                    error
                );
            }

            reminders.delete(reminderId);

        }, duration);

    reminders.set(
        reminderId,
        timeout
    );
}


// ==============================
// PREFIX COMMAND HELPERS
// ==============================

function getPrefixArgs(message) {
    return message.content
        .slice(PREFIX.length)
        .trim()
        .split(/\s+/);
}

async function getPrefixMember(message, value) {
    if (!value) return null;

    const mention =
        value.match(/^<@!?(\d+)>$/);

    const id =
        mention ? mention[1] : value;

    try {
        return await message.guild.members.fetch(id);
    } catch {
        return null;
    }
}

function prefixReason(args, startIndex) {
    return args
        .slice(startIndex)
        .join(' ')
        .trim();
}


// ==============================
// PREFIX MODERATION
// ==============================

async function handlePrefixCommand(message) {
    if (!message.guild) return;

    const args =
        getPrefixArgs(message);

    const command =
        args.shift()?.toLowerCase();

    if (!command) return;


    // --------------------------
    // PING
    // --------------------------

    if (command === 'ping') {
        return message.reply(
            `🏓 Pong! **${client.ws.ping}ms**`
        );
    }


    // --------------------------
    // HELP
    // --------------------------

    if (command === 'help') {
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🍌 Banana Bot')
                    .setDescription(
                        'Use `/help` to see all available commands.'
                    )
            ]
        });
    }


    // --------------------------
    // WARN
    // ?warn @user reason
    // --------------------------

    if (command === 'warn') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        const target =
            await getPrefixMember(
                message,
                args[0]
            );

        const reason =
            prefixReason(args, 1);

        if (!target) {
            return message.reply(
                '❌ Usage: `?warn @user reason`'
            );
        }

        if (!reason) {
            return message.reply(
                '❌ You must provide a reason.'
            );
        }

        const check =
            canModerate(
                message.member,
                target
            );

        if (!check.allowed) {
            return message.reply(
                check.reason
            );
        }

        const userWarnings =
            getWarnings(
                message.guild.id,
                target.id
            );

        userWarnings.push({
            reason,
            moderator: message.author.tag,
            timestamp: Date.now()
        });

        await message.reply(
            `⚠️ ${target} has been warned.\n` +
            `**Reason:** ${reason}\n` +
            `**Total warnings:** ${userWarnings.length}`
        );

        return sendModLog(
            message.guild,
            'Warning',
            target,
            message.member,
            reason
        );
    }


    // --------------------------
    // KICK
    // ?kick @user reason
    // --------------------------

    if (command === 'kick') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        const target =
            await getPrefixMember(
                message,
                args[0]
            );

        const reason =
            prefixReason(args, 1);

        if (!target || !reason) {
            return message.reply(
                '❌ Usage: `?kick @user reason`'
            );
        }

        const check =
            canModerate(
                message.member,
                target
            );

        if (!check.allowed) {
            return message.reply(
                check.reason
            );
        }

        if (!target.kickable) {
            return message.reply(
                '❌ I cannot kick that member.'
            );
        }

        try {
            await target.kick(reason);

            await message.reply(
                `👢 **${target.user.tag}** has been kicked.\n` +
                `**Reason:** ${reason}`
            );

            return sendModLog(
                message.guild,
                'Member Kicked',
                target.user,
                message.member,
                reason
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to kick that member.'
            );
        }
    }


    // --------------------------
    // BAN
    // ?ban @user reason
    // --------------------------

    if (command === 'ban') {
        if (!canBan(message.member)) {
            return message.reply(
                '❌ You do not have permission to use **ban**.'
            );
        }

        const target =
            await getPrefixMember(
                message,
                args[0]
            );

        const reason =
            prefixReason(args, 1);

        if (!target || !reason) {
            return message.reply(
                '❌ Usage: `?ban @user reason`'
            );
        }

        const check =
            canModerate(
                message.member,
                target
            );

        if (!check.allowed) {
            return message.reply(
                check.reason
            );
        }

        if (!target.bannable) {
            return message.reply(
                '❌ I cannot ban that member.'
            );
        }

        try {
            await target.ban({
                reason
            });

            await message.reply(
                `🔨 **${target.user.tag}** has been banned.\n` +
                `**Reason:** ${reason}`
            );

            return sendModLog(
                message.guild,
                'Member Banned',
                target.user,
                message.member,
                reason
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to ban that member.'
            );
        }
    }


    // --------------------------
    // MUTE
    // ?mute @user 10m reason
    // --------------------------

    if (command === 'mute') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        const target =
            await getPrefixMember(
                message,
                args[0]
            );

        const durationInput =
            args[1];

        const reason =
            prefixReason(args, 2);

        if (!target || !durationInput || !reason) {
            return message.reply(
                '❌ Usage: `?mute @user 10m reason`'
            );
        }

        const duration =
            parseDuration(durationInput);

        if (!duration) {
            return message.reply(
                '❌ Invalid duration. Example: `10m`, `1h`, or `1d`.'
            );
        }

        const check =
            canModerate(
                message.member,
                target
            );

        if (!check.allowed) {
            return message.reply(
                check.reason
            );
        }

        if (!target.moderatable) {
            return message.reply(
                '❌ I cannot timeout that member.'
            );
        }

        try {
            await target.timeout(
                duration,
                reason
            );

            await message.reply(
                `🔇 **${target.user.tag}** has been muted for **${formatDuration(duration)}**.\n` +
                `**Reason:** ${reason}`
            );

            return sendModLog(
                message.guild,
                'Member Muted',
                target.user,
                message.member,
                `${reason} — Duration: ${formatDuration(duration)}`
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to mute that member.'
            );
        }
    }


    // --------------------------
    // UNMUTE
    // ?unmute @user reason
    // --------------------------

    if (command === 'unmute') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        const target =
            await getPrefixMember(
                message,
                args[0]
            );

        const reason =
            prefixReason(args, 1) ||
            'No reason provided';

        if (!target) {
            return message.reply(
                '❌ Usage: `?unmute @user reason`'
            );
        }

        const check =
            canModerate(
                message.member,
                target
            );

        if (!check.allowed) {
            return message.reply(
                check.reason
            );
        }

        try {
            await target.timeout(
                null,
                reason
            );

            await message.reply(
                `🔊 **${target.user.tag}** has been unmuted.\n` +
                `**Reason:** ${reason}`
            );

            return sendModLog(
                message.guild,
                'Member Unmuted',
                target.user,
                message.member,
                reason
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to unmute that member.'
            );
        }
    }


    // --------------------------
    // PURGE
    // ?purge 20
    // --------------------------

    if (command === 'purge') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        const amount =
            Number(args[0]);

        if (
            !Number.isInteger(amount) ||
            amount < 1 ||
            amount > 100
        ) {
            return message.reply(
                '❌ Usage: `?purge 1-100`'
            );
        }

        try {
            const deleted =
                await message.channel.bulkDelete(
                    amount + 1,
                    true
                );

            const reply =
                await message.channel.send(
                    `🧹 Deleted **${Math.max(0, deleted.size - 1)}** messages.`
                );

            setTimeout(
                () => reply.delete().catch(() => {}),
                5000
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to purge messages.'
            );
        }

        return;
    }


    // --------------------------
    // LOCK
    // --------------------------

    if (command === 'lock') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        try {
            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            await message.reply(
                '🔒 This channel has been **locked**.'
            );

            return sendModLog(
                message.guild,
                'Channel Locked',
                message.author,
                message.member,
                `#${message.channel.name}`
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to lock the channel.'
            );
        }
    }


    // --------------------------
    // UNLOCK
    // --------------------------

    if (command === 'unlock') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        try {
            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: null
                }
            );

            await message.reply(
                '🔓 This channel has been **unlocked**.'
            );

            return sendModLog(
                message.guild,
                'Channel Unlocked',
                message.author,
                message.member,
                `#${message.channel.name}`
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to unlock the channel.'
            );
        }
    }


    // --------------------------
    // SLOWMODE
    // ?slowmode 10
    // --------------------------

    if (command === 'slowmode') {
        if (!isStaff(message.member)) {
            return message.reply(
                '❌ You need the **Staff** role.'
            );
        }

        const seconds =
            Number(args[0]);

        if (
            !Number.isInteger(seconds) ||
            seconds < 0 ||
            seconds > 21600
        ) {
            return message.reply(
                '❌ Slowmode must be between 0 and 21600 seconds.'
            );
        }

        try {
            await message.channel.setRateLimitPerUser(
                seconds
            );

            return message.reply(
                seconds === 0
                    ? '🐌 Slowmode disabled.'
                    : `🐌 Slowmode set to **${seconds} seconds**.`
            );

        } catch (error) {
            console.error(error);

            return message.reply(
                '❌ Failed to change slowmode.'
            );
        }
    }


    // --------------------------
    // COINFLIP
    // --------------------------

    if (command === 'coinflip') {
        return message.reply(
            `🪙 **${Math.random() < 0.5 ? 'Heads' : 'Tails'}!**`
        );
    }


    // --------------------------
    // ROLL
    // ?roll 100
    // --------------------------

    if (command === 'roll') {
        const max =
            Number(args[0]) || 100;

        if (
            !Number.isInteger(max) ||
            max < 2 ||
            max > 1000000
        ) {
            return message.reply(
                '❌ Maximum must be between 2 and 1,000,000.'
            );
        }

        const result =
            Math.floor(
                Math.random() * max
            ) + 1;

        return message.reply(
            `🎲 You rolled **${result}** out of **${max}**!`
        );
    }


    // --------------------------
    // 8BALL
    // ?8ball question
    // --------------------------

    if (
        command === '8ball' ||
        command === '8b'
    ) {
        const question =
            args.join(' ');

        if (!question) {
            return message.reply(
                '❌ Ask me a question.'
            );
        }

        const answers = [
            'Yes.',
            'No.',
            'Definitely.',
            'Absolutely not.',
            'Probably.',
            'Probably not.',
            'It is certain.',
            'Without a doubt.',
            'Ask again later.',
            'Very likely.',
            'My sources say no.'
        ];

        const answer =
            answers[
                Math.floor(
                    Math.random() * answers.length
                )
            ];

        return message.reply(
            `🎱 **${answer}**`
        );
    }


    // --------------------------
    // RATE
    // ?rate something
    // --------------------------

    if (command === 'rate') {
        const thing =
            args.join(' ');

        if (!thing) {
            return message.reply(
                '❌ Tell me what to rate.'
            );
        }

        const rating =
            Math.floor(
                Math.random() * 101
            );

        return message.reply(
            `🍌 I rate **${thing}** a **${rating}/100**.`
        );
    }
}


// ==============================
// SLASH COMMAND ROUTER
// ==============================

client.on(
    'interactionCreate',
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        try {
            switch (interaction.commandName) {

                case 'addmedia':
                    return handleAddMedia(interaction);

                case 'warn':
                    return handleWarn(interaction);

                case 'warnings':
                    return handleWarnings(interaction);

                case 'clearwarnings':
                    return handleClearWarnings(interaction);

                case 'kick':
                    return handleKick(interaction);

                case 'ban':
                    return handleBan(interaction);

                case 'unban':
                    return handleUnban(interaction);

                case 'softban':
                    return handleSoftban(interaction);

                case 'mute':
                    return handleMute(interaction);

                case 'unmute':
                    return handleUnmute(interaction);

                case 'purge':
                    return handlePurge(interaction);

                case 'slowmode':
                    return handleSlowmode(interaction);

                case 'lock':
                    return handleLock(interaction);

                case 'unlock':
                    return handleUnlock(interaction);

                case 'nick':
                    return handleNick(interaction);

                case 'role':
                    return handleRole(interaction);

                case 'automod':
                    return handleAutomod(interaction);

                case 'ping':
                    return handlePing(interaction);

                case 'serverinfo':
                    return handleServerInfo(interaction);

                case 'userinfo':
                    return handleUserInfo(interaction);

                case 'avatar':
                    return handleAvatar(interaction);

                case 'membercount':
                    return handleMemberCount(interaction);

                case 'botinfo':
                    return handleBotInfo(interaction);

                case '8ball':
                    return handle8Ball(interaction);

                case 'coinflip':
                    return handleCoinflip(interaction);

                case 'roll':
                    return handleRoll(interaction);

                case 'choose':
                    return handleChoose(interaction);

                case 'rate':
                    return handleRate(interaction);

                case 'rps':
                    return handleRPS(interaction);

                case 'help':
                    return handleHelp(interaction);

                case 'remind':
                    return handleReminder(interaction);

                default:
                    return;
            }

        } catch (error) {
            console.error(
                'Interaction error:',
                error
            );

            if (interaction.replied ||
                interaction.deferred) {

                await interaction.followUp({
                    content: '❌ Something went wrong while running that command.',
                    ephemeral: true
                }).catch(() => {});

            } else {

                await interaction.reply({
                    content: '❌ Something went wrong while running that command.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
);


// ==============================
// MESSAGE HANDLER
// ==============================

client.on(
    'messageCreate',
    async message => {

        if (
            message.author.bot ||
            !message.guild
        ) {
            return;
        }

        // Automod runs on every message.
        await checkSpam(message);

        // Prefix command
        if (
            !message.content.startsWith(PREFIX)
        ) {
            return;
        }

        await handlePrefixCommand(message);
    }
);


// ==============================
// READY
// ==============================

client.once(
    'ready',
    async () => {

        console.log(
            `🍌 Banana Bot is online as ${client.user.tag}`
        );

        console.log(
            `Connected to ${client.guilds.cache.size} server(s).`
        );

        client.user.setPresence({
            activities: [
                {
                    name: '?help | /help',
                    type: ActivityType.Watching
                }
            ],
            status: 'online'
        });

        await registerCommands();
    }
);


// ==============================
// ERROR HANDLING
// ==============================

client.on(
    'error',
    error => {
        console.error(
            'Discord client error:',
            error
        );
    }
);

process.on(
    'unhandledRejection',
    error => {
        console.error(
            'Unhandled promise rejection:',
            error
        );
    }
);

process.on(
    'uncaughtException',
    error => {
        console.error(
            'Uncaught exception:',
            error
        );
    }
);


// ==============================
// START BOT
// ==============================

if (!TOKEN) {
    console.error(
        '❌ DISCORD_TOKEN environment variable is missing.'
    );
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error(
        '❌ CLIENT_ID environment variable is missing.'
    );
    process.exit(1);
}

client.login(TOKEN);
