const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
} = require('@discordjs/voice');
const soundcloud = require('./soundcloud');

const players = new Map();

const IDLE_TIMEOUT = 5 * 60 * 1000;

function getPlayer(guildId) {
  return players.get(guildId) || null;
}

async function getOrCreatePlayer(guildId, voiceChannel, textChannel) {
  let gp = players.get(guildId);

  if (gp) {
    gp.textChannel = textChannel;
    if (gp.connection.state.status !== VoiceConnectionStatus.Ready) {
      try {
        await entersState(gp.connection, VoiceConnectionStatus.Ready, 20_000);
      } catch {
        destroy(guildId);
        throw new Error('Voice connection lost');
      }
    }
    return gp;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    selfDeaf: true,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();

  gp = {
    connection,
    player,
    queue: [],
    currentTrack: null,
    textChannel,
    idleTimer: null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    gp.currentTrack = null;
    if (gp.queue.length > 0) {
      playNext(guildId);
    } else {
      gp.idleTimer = setTimeout(() => {
        destroy(guildId);
      }, IDLE_TIMEOUT);
    }
  });

  player.on('error', (err) => {
    console.error(`Player error in ${guildId}:`, err.message);
    gp.textChannel.send(`Playback error: ${err.message}`).catch(() => {});
    gp.currentTrack = null;
    if (gp.queue.length > 0) {
      playNext(guildId);
    }
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      destroy(guildId);
    }
  });

  connection.subscribe(player);
  players.set(guildId, gp);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    destroy(guildId);
    throw new Error('Could not join voice channel');
  }

  return gp;
}

async function playNext(guildId) {
  const gp = players.get(guildId);
  if (!gp || gp.queue.length === 0) return;

  if (gp.idleTimer) {
    clearTimeout(gp.idleTimer);
    gp.idleTimer = null;
  }

  const track = gp.queue.shift();
  gp.currentTrack = track;

  try {
    if (gp.connection.state.status !== VoiceConnectionStatus.Ready) {
      await entersState(gp.connection, VoiceConnectionStatus.Ready, 20_000);
    }

    const stream = soundcloud.createAudioStream(track._raw);
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });
    gp.player.play(resource);

    gp.textChannel.send({
      embeds: [{
        color: 0xff5500,
        author: { name: 'Now Playing' },
        title: track.title,
        url: track.url,
        description: track.artist,
        thumbnail: track.artworkUrl ? { url: track.artworkUrl } : undefined,
        footer: track.duration ? { text: formatDuration(track.duration) } : undefined,
      }],
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to play track:', err.message);
    gp.textChannel.send(`Failed to play **${track.title}**: ${err.message}`).catch(() => {});
    gp.currentTrack = null;
    if (gp.queue.length > 0) playNext(guildId);
  }
}

function enqueue(guildId, trackInfo) {
  const gp = players.get(guildId);
  if (!gp) return;

  gp.queue.push(trackInfo);

  if (gp.player.state.status === AudioPlayerStatus.Idle && !gp.currentTrack) {
    playNext(guildId);
  }
}

function skip(guildId) {
  const gp = players.get(guildId);
  if (!gp) return false;
  gp.player.stop();
  return true;
}

function pause(guildId) {
  const gp = players.get(guildId);
  if (!gp) return false;
  return gp.player.pause();
}

function resume(guildId) {
  const gp = players.get(guildId);
  if (!gp) return false;
  return gp.player.unpause();
}

function stop(guildId) {
  const gp = players.get(guildId);
  if (!gp) return false;
  gp.queue = [];
  destroy(guildId);
  return true;
}

function destroy(guildId) {
  const gp = players.get(guildId);
  if (!gp) return;
  if (gp.idleTimer) clearTimeout(gp.idleTimer);
  gp.player.stop(true);
  gp.connection.destroy();
  players.delete(guildId);
}

function getQueue(guildId) {
  const gp = players.get(guildId);
  if (!gp) return { currentTrack: null, queue: [] };
  return { currentTrack: gp.currentTrack, queue: [...gp.queue] };
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

module.exports = { getPlayer, getOrCreatePlayer, enqueue, playNext, skip, pause, resume, stop, getQueue, formatDuration };
