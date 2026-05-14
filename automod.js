const { EmbedBuilder } = require('discord.js');

// Config
const BAD_WORDS = ['fuck', 'nigger', 'banword3'];
const SPAM_THRESHOLD = 5; // max messages before mute
const SPAM_INTERVAL = 5000; // time window in ms
const RAID_THRESHOLD = 5; // max joins before raid mode
const RAID_INTERVAL = 60000; // time window in ms
const MUTE_DURATION = 10 * 60 * 1000; // 10 minutes

// Trackers
const spamTracker = new Map(); // userId → [timestamps]
const raidTracker = []; // [timestamps]

// Send embed to mod-logs channel
async function sendLog(guild, embed) {
  const logChannel = guild.channels.cache.find(ch => ch.name === 'mod-logs');
  if (logChannel) await logChannel.send({ embeds: [embed] });
}

// Mute user for spam
async function muteUser(member, reason, guild) {
  try {
    await member.timeout(MUTE_DURATION, reason);

    const embed = new EmbedBuilder()
      .setTitle('🔇 Auto-Mute')
      .addFields(
        { name: 'User', value: member.user.username, inline: true },
        { name: 'Reason', value: reason, inline: true },
        { name: 'Duration', value: '10 minutes' }
      )
      .setColor(0xFF6600)
      .setTimestamp();

    await sendLog(guild, embed);
  } catch (err) {
    console.error('Mute error:', err.message);
  }
}

// Check for spam
async function checkSpam(message) {
  const userId = message.author.id;
  const now = Date.now();

  if (!spamTracker.has(userId)) spamTracker.set(userId, []);

  const timestamps = spamTracker.get(userId);
  timestamps.push(now);

  // Filter recent timestamps
  const recent = timestamps.filter(t => now - t < SPAM_INTERVAL);
  spamTracker.set(userId, recent);

  if (recent.length >= SPAM_THRESHOLD) {
    spamTracker.delete(userId);
    await muteUser(message.member, 'Spam detected', message.guild);
    await message.channel.send({
      content: `🔇 ${message.author} has been muted for spamming.`
    });
    return true;
  }
  return false;
}

// Check for banned words
async function checkBanWords(message) {
  const content = message.content.toLowerCase();
  const found = BAD_WORDS.some(word => content.includes(word));

  if (found) {
    await message.delete();

    const embed = new EmbedBuilder()
      .setTitle('🤬 Bad Word Detected')
      .addFields(
        { name: 'User', value: message.author.username, inline: true },
        { name: 'Channel', value: message.channel.name, inline: true }
      )
      .setColor(0xFF0000)
      .setTimestamp();

    await sendLog(message.guild, embed);
    await message.channel.send({
      content: `⚠️ ${message.author} your message was removed for violating the rules.`
    });
    return true;
  }
  return false;
}

// Block links from accounts newer than 1 week
async function checkLinks(message) {
  const accountAge = Date.now() - message.author.createdTimestamp;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  if (accountAge < oneWeek && urlRegex.test(message.content)) {
    await message.delete();

    const embed = new EmbedBuilder()
      .setTitle('🔗 Link Blocked')
      .addFields(
        { name: 'User', value: message.author.username, inline: true },
        { name: 'Channel', value: message.channel.name, inline: true },
        { name: 'Reason', value: 'New account posting links' }
      )
      .setColor(0xFF6600)
      .setTimestamp();

    await sendLog(message.guild, embed);
    return true;
  }
  return false;
}

// Detect and respond to raids
async function checkRaid(member) {
  const now = Date.now();
  raidTracker.push(now);

  const recent = raidTracker.filter(t => now - t < RAID_INTERVAL);
  raidTracker.length = 0;
  raidTracker.push(...recent);

  if (recent.length >= RAID_THRESHOLD) {
    // Enable slowmode on all text channels
    for (const channel of member.guild.channels.cache.values()) {
      if (channel.isTextBased()) {
        await channel.setRateLimitPerUser(30).catch(() => {});
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🚨 Raid Detected!')
      .setDescription(`${recent.length} users joined in the last minute. Slowmode enabled on all channels.`)
      .setColor(0xFF0000)
      .setTimestamp();

    await sendLog(member.guild, embed);
    console.log('🚨 Raid detected!');
  }
}

module.exports = { checkSpam, checkBanWords, checkLinks, checkRaid };
