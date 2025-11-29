import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'khinsider-player');

export class AudioPlayer extends EventEmitter {
  constructor() {
    super();
    this.currentProcess = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.tempFile = null;
    this.playLock = false;
  }

  async ensureTempDir() {
    await fs.ensureDir(TEMP_DIR);
  }

  getPlayerCommand() {
    const platform = process.platform;
    if (platform === 'darwin') {
      return { cmd: 'afplay', args: [] };
    } else if (platform === 'linux') {
      return { cmd: 'mpg123', args: ['-q'] };
    } else if (platform === 'win32') {
      return { cmd: 'powershell', args: ['-c', '(New-Object Media.SoundPlayer'].concat(['$audioPath']).concat([').PlaySync()']) };
    }
    throw new Error(`Unsupported platform: ${platform}`);
  }

  async downloadToTemp(url) {
    await this.ensureTempDir();
    const tempFile = path.join(TEMP_DIR, `track-${Date.now()}.mp3`);

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(tempFile));
      writer.on('error', reject);
    });
  }

  async play(source, trackInfo = {}) {
    // Prevent concurrent plays
    if (this.playLock) {
      return false;
    }
    this.playLock = true;

    try {
      await this.stop(true); // silent stop for track switch

      this.currentTrack = trackInfo;
      this.emit('loading', { track: trackInfo });

      let audioPath;

      // Check if source is a URL or local file
      if (source.startsWith('http://') || source.startsWith('https://')) {
        try {
          audioPath = await this.downloadToTemp(source);
          this.tempFile = audioPath;
        } catch (error) {
          this.emit('error', { track: trackInfo, error });
          throw error;
        }
      } else {
        audioPath = source;
        this.tempFile = null;
      }

      // Verify file exists
      if (!await fs.pathExists(audioPath)) {
        const error = new Error(`Audio file not found: ${audioPath}`);
        this.emit('error', { track: trackInfo, error });
        throw error;
      }

      const { cmd, args } = this.getPlayerCommand();

      let finalArgs;
      if (process.platform === 'win32') {
        finalArgs = ['-c', `(New-Object Media.SoundPlayer '${audioPath}').PlaySync()`];
      } else {
        finalArgs = [...args, audioPath];
      }

      this.currentProcess = spawn(cmd, finalArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.isPlaying = true;
      this.isPaused = false;
      this.emit('play', { track: trackInfo, path: audioPath });

      this.currentProcess.on('close', async (code) => {
        // Ignore if already stopped (by stop() method)
        if (!this.isPlaying) return;

        this.isPlaying = false;
        this.currentProcess = null;

        // Clean up temp file
        if (this.tempFile) {
          try {
            await fs.remove(this.tempFile);
          } catch (e) {
            // Ignore cleanup errors
          }
          this.tempFile = null;
        }

        if (code === 0 || code === null) {
          this.emit('ended', { track: trackInfo });
        } else {
          this.emit('error', { track: trackInfo, code });
        }
      });

      this.currentProcess.on('error', (error) => {
        this.isPlaying = false;
        this.emit('error', { track: trackInfo, error });
      });

      return true;
    } finally {
      this.playLock = false;
    }
  }

  async stop(silent = false) {
    if (this.currentProcess) {
      const proc = this.currentProcess;
      this.currentProcess = null;
      this.isPlaying = false;
      this.isPaused = false;

      // Kill and wait for process to exit
      await new Promise((resolve) => {
        proc.once('close', resolve);
        proc.kill('SIGKILL');
        // Timeout fallback
        setTimeout(resolve, 500);
      });

      // Clean up temp file
      if (this.tempFile) {
        try {
          await fs.remove(this.tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
        this.tempFile = null;
      }

      if (!silent) {
        this.emit('stop', { track: this.currentTrack });
      }
    }
    this.currentTrack = null;
  }

  pause() {
    if (this.currentProcess && this.isPlaying && !this.isPaused) {
      if (process.platform !== 'win32') {
        this.currentProcess.kill('SIGSTOP');
        this.isPaused = true;
        this.emit('pause', { track: this.currentTrack });
        return true;
      }
    }
    return false;
  }

  resume() {
    if (this.currentProcess && this.isPaused) {
      if (process.platform !== 'win32') {
        this.currentProcess.kill('SIGCONT');
        this.isPaused = false;
        this.emit('resume', { track: this.currentTrack });
        return true;
      }
    }
    return false;
  }

  togglePause() {
    if (this.isPaused) {
      return this.resume();
    } else {
      return this.pause();
    }
  }

  getStatus() {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentTrack: this.currentTrack
    };
  }
}

export const audioPlayer = new AudioPlayer();
