const { SlashCommandBuilder } = require('discord.js');
const playerMod = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue, and leave the voice channel'),

  async execute(interaction) {
    if (playerMod.stop(interaction.guildId)) {
      await interaction.reply('Stopped and disconnected.');
    } else {
      await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
    }
  },
};
