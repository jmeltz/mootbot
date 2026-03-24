const { SlashCommandBuilder } = require('discord.js');
const playerMod = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume playback'),

  async execute(interaction) {
    if (playerMod.resume(interaction.guildId)) {
      await interaction.reply('Resumed.');
    } else {
      await interaction.reply({ content: 'Nothing is paused.', ephemeral: true });
    }
  },
};
