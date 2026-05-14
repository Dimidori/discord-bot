require('dotenv').config();
const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const { getUser, addXP, updateLevel, getLeaderboard, getRequiredXP } = require('./database');
const { checkNewVideos } = require('./youtube');
const { startWebhookServer } = require('./webhook');
const { checkSpam, checkBanWords, checkLinks, checkRaid } = require('./automod');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Send verification message')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption(o => o.setName('user').setDescription('Who to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption(o => o.setName('user').setDescription('Who to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(o => o.setName('user').setDescription('Who to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your XP and level')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top 10 most active members')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('subscribe')
    .setDescription('Give Premium role to a member')
    .addUserOption(o => o.setName('user').setDescription('Who to subscribe').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('unsubscribe')
    .setDescription('Remove Premium role from a member')
    .addUserOption(o => o.setName('user').setDescription('Who to unsubscribe').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ Commands registered!');
  // Check YouTube every 5 minutes
  checkNewVideos(client);
  setInterval(() => checkNewVideos(client), 5 * 60 * 1000);
  startWebhookServer(client);
});

// XP cooldown map
const xpCooldown = new Set();

// XP for messages and level up
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Auto-moderation
  if (await checkBanWords(message)) return;
  if (await checkLinks(message)) return;
  if (await checkSpam(message)) return;

  if (xpCooldown.has(message.author.id)) return;

  // 60 second cooldown
  xpCooldown.add(message.author.id);
  setTimeout(() => xpCooldown.delete(message.author.id), 60000);

  const xpGain = Math.floor(Math.random() * 11) + 15; // 15-25 XP
  const user = addXP(message.author.id, message.guild.id, xpGain);
  const requiredXP = getRequiredXP(user.level);

  // leveling up
  if (user.xp >= requiredXP) {
    const newLevel = user.level + 1;
    updateLevel(message.author.id, message.guild.id, newLevel);

    const embed = new EmbedBuilder()
      .setTitle('🎉 Level Up!')
      .setDescription(`${message.author} reached **Level ${newLevel}**!`)
      .setColor(0x5865F2)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    // Assign level roles
    const levelRoles = { 5: 'Level 5', 10: 'Level 10', 20: 'Level 20' };
    if (levelRoles[newLevel]) {
      const role = message.guild.roles.cache.find(r => r.name === levelRoles[newLevel]);
      if (role) await message.member.roles.add(role);
    }
  }
});

// Send log to mod-logs channel
async function sendLog(guild, embed) {
  const logChannel = guild.channels.cache.find(ch => ch.name === 'mod-logs');
  if (logChannel) await logChannel.send({ embeds: [embed] });
}

// Welcome new member

client.on('guildMemberAdd', async member => {
  await checkRaid(member);
  const channel = member.guild.channels.cache.find(ch => ch.name === 'verification');
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('👋 Welcome!')
    .setDescription(`Hey ${member}!\nClick the button below to get access to the server.`)
    .setColor(0x5865F2);

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify')
      .setLabel('✅ Verify')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [button] });
});

client.on('interactionCreate', async interaction => {

  // Verify button
  if (interaction.isButton() && interaction.customId === 'verify') {
    const role = interaction.guild.roles.cache.find(r => r.name === 'Member');
    if (!role) {
      await interaction.reply({ content: '❌ Member role not found!', ephemeral: true });
      return;
    }
    if (interaction.member.roles.cache.has(role.id)) {
      await interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
      return;
    }
    await interaction.member.roles.add(role);
    await interaction.reply({ content: '✅ Verified! You now have access to the server.', ephemeral: true });
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // /verify
  if (interaction.commandName === 'verify') {
    const embed = new EmbedBuilder()
      .setTitle('👋 Verification')
      .setDescription('Click the button below to get access to the server.')
      .setColor(0x5865F2);

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify')
        .setLabel('✅ Verify')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [button] });
  }

  // /kick
  if (interaction.commandName === 'kick') {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = interaction.guild.members.cache.get(target.id);

    if (!member) {
      await interaction.reply({ content: '❌ User not found!', ephemeral: true });
      return;
    }

    await member.kick(reason);
    await interaction.reply({ content: `✅ ${target.username} has been kicked. Reason: ${reason}`, ephemeral: true });

    const log = new EmbedBuilder()
      .setTitle('👢 Member Kicked')
      .addFields(
        { name: 'User', value: target.username, inline: true },
        { name: 'Moderator', value: interaction.user.username, inline: true },
        { name: 'Reason', value: reason }
      )
      .setColor(0xFFA500)
      .setTimestamp();

    await sendLog(interaction.guild, log);
  }

  // /ban
  if (interaction.commandName === 'ban') {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.guild.members.ban(target.id, { reason });
    await interaction.reply({ content: `✅ ${target.username} has been banned. Reason: ${reason}`, ephemeral: true });

    const log = new EmbedBuilder()
      .setTitle('🔨 Member Banned')
      .addFields(
        { name: 'User', value: target.username, inline: true },
        { name: 'Moderator', value: interaction.user.username, inline: true },
        { name: 'Reason', value: reason }
      )
      .setColor(0xFF0000)
      .setTimestamp();

    await sendLog(interaction.guild, log);
  }

  // /warn
  if (interaction.commandName === 'warn') {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.reply({ content: `⚠️ ${target.username} has been warned. Reason: ${reason}`, ephemeral: true });

    const log = new EmbedBuilder()
      .setTitle('⚠️ Member Warned')
      .addFields(
        { name: 'User', value: target.username, inline: true },
        { name: 'Moderator', value: interaction.user.username, inline: true },
        { name: 'Reason', value: reason }
      )
      .setColor(0xFFFF00)
      .setTimestamp();

    await sendLog(interaction.guild, log);
  }

  // /rank
  if (interaction.commandName === 'rank') {
    const user = getUser(interaction.user.id, interaction.guild.id);
    const requiredXP = getRequiredXP(user.level);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${interaction.user.username}'s Rank`)
      .addFields(
        { name: 'Level', value: `${user.level}`, inline: true },
        { name: 'XP', value: `${user.xp} / ${requiredXP}`, inline: true },
      )
      .setColor(0x5865F2)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /leaderboard
  if (interaction.commandName === 'leaderboard') {
    const top = getLeaderboard(interaction.guild.id);

    const description = await Promise.all(top.map(async (row, i) => {
      const user = await client.users.fetch(row.user_id).catch(() => null);
      const name = user ? user.username : 'Unknown';
      return `**${i + 1}.** ${name} — Level ${row.level} (${row.xp} XP)`;
    }));

    const embed = new EmbedBuilder()
      .setTitle('🏆 Leaderboard')
      .setDescription(description.join('\n'))
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
  // /subscribe
if (interaction.commandName === 'subscribe') {
  const target = interaction.options.getUser('user');
  const member = interaction.guild.members.cache.get(target.id);
  const role = interaction.guild.roles.cache.find(r => r.name === 'Premium');

  if (!member) {
    await interaction.reply({ content: '❌ Member not found!', ephemeral: true });
    return;
  }

  if (!role) {
    await interaction.reply({ content: '❌ Premium role not found!', ephemeral: true });
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await interaction.reply({ content: '⚠️ User already has Premium!', ephemeral: true });
    return;
  }

  await member.roles.add(role);

  const embed = new EmbedBuilder()
    .setTitle('⭐ Premium Activated!')
    .setDescription(`${target} has been upgraded to **Premium**!`)
    .setColor(0xFFD700)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const log = new EmbedBuilder()
    .setTitle('💳 Subscription Started')
    .addFields(
      { name: 'User', value: target.username, inline: true },
      { name: 'Plan', value: 'Premium', inline: true },
      { name: 'Activated by', value: interaction.user.username }
    )
    .setColor(0xFFD700)
    .setTimestamp();

  await sendLog(interaction.guild, log);
}

// /unsubscribe
if (interaction.commandName === 'unsubscribe') {
  const target = interaction.options.getUser('user');
  const member = interaction.guild.members.cache.get(target.id);
  const role = interaction.guild.roles.cache.find(r => r.name === 'Premium');

  if (!member) {
    await interaction.reply({ content: '❌ Member not found!', ephemeral: true });
    return;
  }

  if (!role) {
    await interaction.reply({ content: '❌ Premium role not found!', ephemeral: true });
    return;
  }

  if (!member.roles.cache.has(role.id)) {
    await interaction.reply({ content: '⚠️ User does not have Premium!', ephemeral: true });
    return;
  }

  await member.roles.remove(role);

  const embed = new EmbedBuilder()
    .setTitle('❌ Premium Deactivated')
    .setDescription(`${target}'s **Premium** subscription has ended.`)
    .setColor(0xFF0000)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const log = new EmbedBuilder()
    .setTitle('💳 Subscription Ended')
    .addFields(
      { name: 'User', value: target.username, inline: true },
      { name: 'Plan', value: 'Premium', inline: true },
      { name: 'Removed by', value: interaction.user.username }
    )
    .setColor(0xFF0000)
    .setTimestamp();

  await sendLog(interaction.guild, log);
}
});

client.login(process.env.TOKEN);