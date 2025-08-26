import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';

class MusicPlayer extends EventEmitter {
  constructor() {
    super();
    this.currentProcess = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.isPaused = false;
  }

  async play(trackUrl, trackInfo = {}) {
    if (this.currentProcess) {
      this.stop();
    }

    this.currentTrack = trackInfo;
    this.isPlaying = true;
    this.isPaused = false;

    try {
      if (process.platform === 'darwin') {
        this.currentProcess = spawn('afplay', [trackUrl]);
      } else if (process.platform === 'win32') {
        this.currentProcess = spawn('powershell', [
          '-c',
          `(New-Object Media.SoundPlayer "${trackUrl}").PlaySync()`
        ]);
      } else {
        this.currentProcess = spawn('mpg123', [trackUrl]);
      }

      this.currentProcess.on('error', (error) => {
        console.error('Player error:', error);
        this.emit('error', error);
        this.isPlaying = false;
      });

      this.currentProcess.on('exit', (code) => {
        if (code === 0) {
          this.emit('trackEnd', this.currentTrack);
        }
        this.isPlaying = false;
        this.currentProcess = null;
      });

      this.emit('trackStart', this.currentTrack);
    } catch (error) {
      console.error('Failed to play track:', error);
      this.emit('error', error);
      this.isPlaying = false;
    }
  }

  stop() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
      this.isPlaying = false;
      this.isPaused = false;
      this.emit('stop', this.currentTrack);
    }
  }

  pause() {
    if (this.currentProcess && this.isPlaying && !this.isPaused) {
      if (process.platform !== 'win32') {
        this.currentProcess.kill('SIGSTOP');
        this.isPaused = true;
        this.emit('pause', this.currentTrack);
      }
    }
  }

  resume() {
    if (this.currentProcess && this.isPaused) {
      if (process.platform !== 'win32') {
        this.currentProcess.kill('SIGCONT');
        this.isPaused = false;
        this.emit('resume', this.currentTrack);
      }
    }
  }

  async downloadTrack(trackUrl, destination, trackName) {
    try {
      const response = await axios({
        method: 'GET',
        url: trackUrl,
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(destination);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.emit('downloaded', { name: trackName, path: destination });
          resolve(destination);
        });
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  }
}

export default MusicPlayer;