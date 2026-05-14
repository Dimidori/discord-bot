const express = require('express');
const app = express();

// Stripe webhook endpoint
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const event = JSON.parse(req.body);

  switch (event.type) {

    // Payment seccess
    case 'customer.subscription.created':
    case 'invoice.payment_succeeded': {
      const discordId = event.data.object.metadata.discord_id;
      if (discordId && global.discordClient) {
        const guild = global.discordClient.guilds.cache.first();
        const member = await guild.members.fetch(discordId).catch(() => null);
        const role = guild.roles.cache.find(r => r.name === 'Premium');
        if (member && role) await member.roles.add(role);
        console.log(`✅ Premium activated for Discord ID: ${discordId}`);
      }
      break;
    }

    // Sub canceled or payment failed
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed': {
      const discordId = event.data.object.metadata.discord_id;
      if (discordId && global.discordClient) {
        const guild = global.discordClient.guilds.cache.first();
        const member = await guild.members.fetch(discordId).catch(() => null);
        const role = guild.roles.cache.find(r => r.name === 'Premium');
        if (member && role) await member.roles.remove(role);
        console.log(`❌ Premium removed for Discord ID: ${discordId}`);
      }
      break;
    }

    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

function startWebhookServer(client) {
  global.discordClient = client;
  const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`✅ Webhook server running on port ${PORT}`);
});
}

module.exports = { startWebhookServer };