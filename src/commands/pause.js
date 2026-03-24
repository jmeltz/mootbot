const { SlashCommandBuilder } = require('discord.js');
const playerMod = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause playback'),

  async execute(interaction) {
    if (playerMod.pause(interaction.guildId)) {
      await interaction.reply('Paused.');
    } else {
      await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
    }
  },
};
