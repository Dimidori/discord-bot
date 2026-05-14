const Parser = require('rss-parser');
const { EmbedBuilder } = require('discord.js');

const parser = new Parser();

const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

let lastVideoId = null;

async function checkNewVideos(client) {
  try {
    const feed = await parser.parseURL(RSS_URL);
    const latestVideo = feed.items[0];

    if (!latestVideo) return;

    const videoId = latestVideo.id.split(':').pop();

    // First run — just save the latest video ID
    if (!lastVideoId) {
      lastVideoId = latestVideo.id;
      console.log(`📺 Watching YouTube channel: ${feed.title}`);
      return;
    }

    // New video — post announcement
    if (latestVideo.id !== lastVideoId) {
      lastVideoId = latestVideo.id;

      const embed = new EmbedBuilder()
        .setTitle(`🎥 ${latestVideo.title}`)
        .setURL(latestVideo.link)
        .setDescription(`A new video just dropped on **${feed.title}**!`)
        .setImage(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`)
        .setColor(0xFF0000)
        .setTimestamp(new Date(latestVideo.pubDate));

      for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.find(ch => ch.name === 'announcements');
        if (channel) await channel.send({
          content: `🎥 **New video from ${feed.title}!**\n${latestVideo.link}`,
          embeds: [embed]
        });
      }

      console.log(`📺 New video posted: ${latestVideo.title}`);
    }

  } catch (error) {
    console.error('YouTube RSS error:', error.message);
  }
}

module.exports = { checkNewVideos };
