const { SlashCommandBuilder } = require('discord.js');
const soundcloud = require('../soundcloud');
const player = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a SoundCloud track in your voice channel')
    .addStringOption(opt =>
      opt.setName('url').setDescription('SoundCloud track URL').setRequired(true)
    ),

  async execute(interaction) {
    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const url = interaction.options.getString('url');
      const track = await soundcloud.resolveUrl(url);

      if (!track || track.kind !== 'track') {
        return interaction.editReply('Could not resolve that URL as a SoundCloud track.');
      }

      const trackInfo = {
        id: track.id,
        title: track.title || 'Untitled',
        artist: track.user?.username || 'Unknown',
        url: track.permalink_url,
        artworkUrl: track.artwork_url,
        duration: track.duration,
        _raw: track,
      };

      await player.getOrCreatePlayer(interaction.guildId, voiceChannel, interaction.channel);
      player.enqueue(interaction.guildId, trackInfo);

      const { queue } = player.getQueue(interaction.guildId);
      const position = queue.length;

      await interaction.editReply({
        embeds: [{
          color: 0xff5500,
          title: trackInfo.title,
          url: trackInfo.url,
          description: position > 0
            ? `Added to queue (position #${position})`
            : `Playing now`,
          author: { name: trackInfo.artist },
          thumbnail: trackInfo.artworkUrl ? { url: trackInfo.artworkUrl } : undefined,
          footer: trackInfo.duration
            ? { text: player.formatDuration(trackInfo.duration) }
            : undefined,
        }],
      });
    } catch (err) {
      console.error('Play command error:', err);
      await interaction.editReply(`Error: ${err.message}`);
    }
  },
};
