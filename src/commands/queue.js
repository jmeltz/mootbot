const { SlashCommandBuilder } = require('discord.js');
const playerMod = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue'),

  async execute(interaction) {
    const { currentTrack, queue } = playerMod.getQueue(interaction.guildId);

    if (!currentTrack && queue.length === 0) {
      return interaction.reply({ content: 'Queue is empty.', ephemeral: true });
    }

    const lines = [];
    if (currentTrack) {
      lines.push(`**Now playing:** [${currentTrack.title}](${currentTrack.url}) — ${currentTrack.artist}`);
    }

    if (queue.length > 0) {
      lines.push('');
      const shown = queue.slice(0, 10);
      shown.forEach((t, i) => {
        lines.push(`**${i + 1}.** [${t.title}](${t.url}) — ${t.artist}`);
      });
      if (queue.length > 10) {
        lines.push(`...and ${queue.length - 10} more`);
      }
    }

    await interaction.reply({
      embeds: [{
        color: 0xff5500,
        title: 'Queue',
        description: lines.join('\n'),
      }],
    });
  },
};
