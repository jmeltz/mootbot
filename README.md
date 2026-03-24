# MootBot

A Discord bot for playing SoundCloud songs in voice channels. Unlike other SC bots, MootBot supports newer SoundCloud tracks that use HLS streaming instead of direct MP3 URLs.

## How it works

SoundCloud recently changed how uploaded tracks are stored — newer tracks no longer expose MP3 URLs in metadata and are streamed exclusively via HLS. MootBot handles this by:

1. Dynamically extracting a SoundCloud client ID from their JS bundles
2. Resolving track URLs via the SoundCloud API
3. Fetching HLS playlists (M3U8) and downloading audio segments with retry logic
4. Streaming segments through ffmpeg to transcode fMP4/AAC to Opus in real-time for Discord voice

Playback starts almost immediately — no need to buffer the entire track first.

## Commands

| Command | Description |
|---------|-------------|
| `/play <url>` | Play a SoundCloud track in your voice channel |
| `/skip` | Skip the current track |
| `/pause` | Pause playback |
| `/resume` | Resume playback |
| `/stop` | Stop playback, clear queue, leave channel |
| `/queue` | Show the current queue |
| `/np` | Show the currently playing track |

## Setup

### Prerequisites

- Node.js 18+
- A [Discord bot application](https://discord.com/developers/applications) with the **bot** scope and these permissions:
  - Connect
  - Speak
  - Use Slash Commands

### Install

```bash
git clone https://github.com/jmeltz/mootbot.git
cd mootbot
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env`:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-bot-client-id
GUILD_ID=your-dev-server-id  # optional, for faster command registration during dev
```

### Run

```bash
npm start
```

### Invite the bot

Replace `YOUR_CLIENT_ID` with your bot's client ID:

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3145728&scope=bot%20applications.commands
```

## Hosting

Any VPS or always-on machine works. The bot needs a persistent connection so serverless platforms won't work. Use systemd or screen/tmux to keep it running:

```bash
# systemd
sudo systemctl enable --now mootbot

# or screen
screen -S mootbot
npm start
# Ctrl+A, D to detach
```

ffmpeg is bundled via `ffmpeg-static`, so no system install is needed.
