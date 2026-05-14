const Database = require('better-sqlite3');
const db = new Database('bot.db');

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT,
    guild_id TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, guild_id)
  )
`);

// Get or create user
function getUser(userId, guildId) {
  let user = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  if (!user) {
    db.prepare('INSERT INTO users (user_id, guild_id) VALUES (?, ?)').run(userId, guildId);
    user = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  }
  return user;
}

// Add XP (ensure user exists before updating)
function addXP(userId, guildId, amount) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET xp = xp + ? WHERE user_id = ? AND guild_id = ?').run(amount, userId, guildId);
  return getUser(userId, guildId);
}

// Update user level
function updateLevel(userId, guildId, level) {
  db.prepare('UPDATE users SET level = ? WHERE user_id = ? AND guild_id = ?').run(level, userId, guildId);
}

// Top 10 leaderboard
function getLeaderboard(guildId) {
  return db.prepare('SELECT * FROM users WHERE guild_id = ? ORDER BY xp DESC LIMIT 10').all(guildId);
}

// XP required to reach the next level
function getRequiredXP(level) {
  return 100 * (level + 1);
}

module.exports = { getUser, addXP, updateLevel, getLeaderboard, getRequiredXP };