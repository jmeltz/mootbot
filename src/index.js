require('dotenv').config();

// Point @discordjs/voice to the bundled ffmpeg binary
process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || require('ffmpeg-static');

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Load commands
const commands = new Collection();
const commandData = [];
const commandsDir = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  commands.set(cmd.data.name, cmd);
  commandData.push(cmd.data.toJSON());
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('bot.moots.my', { type: ActivityType.Watching });

  // Register slash commands
  if (process.env.GUILD_ID) {
    await client.guilds.cache.get(process.env.GUILD_ID)?.commands.set(commandData);
    console.log(`Registered ${commandData.length} commands to guild ${process.env.GUILD_ID}`);
  } else {
    await client.application.commands.set(commandData);
    console.log(`Registered ${commandData.length} commands globally`);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(`Command error (${interaction.commandName}):`, err);
    const reply = { content: 'Something went wrong.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
