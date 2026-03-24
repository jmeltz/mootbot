const { SlashCommandBuilder } = require('discord.js');
const playerMod = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),

  async execute(interaction) {
    if (playerMod.skip(interaction.guildId)) {
      await interaction.reply('Skipped.');
    } else {
      await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
    }
  },
};
