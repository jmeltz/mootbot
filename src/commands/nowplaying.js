const { SlashCommandBuilder } = require('discord.js');
const playerMod = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('np')
    .setDescription('Show the currently playing track'),

  async execute(interaction) {
    const { currentTrack } = playerMod.getQueue(interaction.guildId);

    if (!currentTrack) {
      return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
    }

    await interaction.reply({
      embeds: [{
        color: 0xff5500,
        author: { name: 'Now Playing' },
        title: currentTrack.title,
        url: currentTrack.url,
        description: currentTrack.artist,
        thumbnail: currentTrack.artworkUrl ? { url: currentTrack.artworkUrl } : undefined,
        footer: currentTrack.duration
          ? { text: playerMod.formatDuration(currentTrack.duration) }
          : undefined,
      }],
    });
  },
};
