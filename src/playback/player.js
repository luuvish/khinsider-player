import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'khinsider-player');
const PROCESS_KILL_TIMEOUT = 2000; // 2 seconds for graceful shutdown
const MIN_AUDIO_FILE_SIZE = 1024; // Minimum 1KB for valid audio file

export class AudioPlayer extends EventEmitter {
  constructor() {
    super();
    this.currentProcess = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.tempFile = null;
    this.playLock = false;
    this.isStopping = false; // Flag to prevent race conditions
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
      return { cmd: 'powershell', args: [] };
    }
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Sanitize path for Windows PowerShell to prevent command injection
  sanitizeWindowsPath(filePath) {
    // Only allow valid path characters, reject anything suspicious
    const normalized = path.normalize(filePath);

    // Check for suspicious patterns - block shell metacharacters
    // Including: ; & | ` $ ( ) { } < > @ # and null bytes
    if (/[;&|`$(){}<>@#\x00]/.test(normalized)) {
      throw new Error('Invalid characters in file path');
    }

    // Block newlines and carriage returns
    if (/[\r\n]/.test(normalized)) {
      throw new Error('Invalid characters in file path');
    }

    // Escape single quotes for PowerShell single-quoted string
    return normalized.replace(/'/g, "''");
  }

  async downloadToTemp(url) {
    await this.ensureTempDir();
    const tempFile = path.join(TEMP_DIR, `track-${Date.now()}.mp3`);

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 60000, // 60 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      validateStatus: (status) => status >= 200 && status < 300
    });

    // Validate response status
    if (response.status !== 200) {
      // Destroy stream before throwing to prevent resource leak
      response.data.destroy();
      throw new Error(`HTTP ${response.status} error downloading audio`);
    }

    // Validate content type (allow audio/* and application/octet-stream)
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('audio/') &&
        !contentType.includes('octet-stream') &&
        !contentType.includes('mpeg')) {
      // Log but don't reject - some servers don't set correct content-type
      console.warn(`Unexpected content-type: ${contentType}`);
    }

    const contentLength = parseInt(response.headers['content-length'], 10) || 0;
    let downloadedBytes = 0;
    const writer = fs.createWriteStream(tempFile);

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = async (error) => {
        if (settled) return;
        settled = true;
        // Destroy both streams to prevent leaks
        response.data.destroy();
        writer.destroy();
        await fs.remove(tempFile).catch(() => {});
        if (error) {
          reject(error);
        }
      };

      // Handle stream errors
      response.data.on('error', (err) => {
        cleanup(new Error(`Download stream error: ${err.message}`)).catch(() => {});
      });

      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
      });

      response.data.pipe(writer);

      writer.on('finish', async () => {
        if (settled) return;
        settled = true;

        // Validate file size
        if (downloadedBytes < MIN_AUDIO_FILE_SIZE) {
          // Destroy streams before rejecting to prevent resource leak
          response.data.destroy();
          writer.destroy();
          await fs.remove(tempFile).catch(() => {});
          reject(new Error('Downloaded file too small, possibly corrupted'));
          return;
        }

        // Verify content-length if provided
        if (contentLength > 0 && downloadedBytes < contentLength * 0.9) {
          // Destroy streams before rejecting to prevent resource leak
          response.data.destroy();
          writer.destroy();
          await fs.remove(tempFile).catch(() => {});
          reject(new Error('Download incomplete'));
          return;
        }

        resolve(tempFile);
      });

      writer.on('error', (err) => {
        cleanup(err);
      });
    });
  }

  async play(source, trackInfo = {}) {
    // Prevent concurrent plays - return rejected promise instead of false
    if (this.playLock) {
      return Promise.reject(new Error('Playback already in progress'));
    }

    if (this.isStopping) {
      return Promise.reject(new Error('Stop in progress'));
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
          this.currentTrack = null; // Reset on error
          this.emit('error', { track: trackInfo, error });
          throw error;
        }
      } else {
        audioPath = source;
        this.tempFile = null;
      }

      // Verify file exists
      if (!await fs.pathExists(audioPath)) {
        this.currentTrack = null; // Reset on error
        const error = new Error(`Audio file not found: ${audioPath}`);
        this.emit('error', { track: trackInfo, error });
        throw error;
      }

      const { cmd, args } = this.getPlayerCommand();

      let finalArgs;
      if (process.platform === 'win32') {
        // Windows: Sanitize path to prevent command injection
        try {
          const safePath = this.sanitizeWindowsPath(audioPath);
          finalArgs = [
            '-NoProfile',
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-Command',
            `Add-Type -AssemblyName presentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open([uri]'${safePath}'); $player.Play(); while($player.NaturalDuration.HasTimeSpan -eq $false -or $player.Position -lt $player.NaturalDuration.TimeSpan) { Start-Sleep -Milliseconds 100 }; $player.Close()`
          ];
        } catch (error) {
          this.currentTrack = null;
          this.emit('error', { track: trackInfo, error });
          throw error;
        }
      } else {
        finalArgs = [...args, audioPath];
      }

      // Use 'ignore' for stdio to prevent buffer overflow
      this.currentProcess = spawn(cmd, finalArgs, {
        stdio: ['ignore', 'ignore', 'ignore']
      });

      this.isPlaying = true;
      this.isPaused = false;
      this.emit('play', { track: trackInfo, path: audioPath });

      // Use .once() to prevent listener accumulation
      this.currentProcess.once('close', async (code) => {
        // Ignore if already stopped (by stop() method) or stopping
        if (!this.isPlaying || this.isStopping) return;

        this.isPlaying = false;
        this.currentProcess = null;

        // Clean up temp file with error handling
        try {
          await this.cleanupTempFile();
        } catch {
          // Ignore cleanup errors
        }

        if (code === 0 || code === null) {
          this.emit('ended', { track: trackInfo });
        } else {
          this.emit('error', { track: trackInfo, code });
        }
      });

      this.currentProcess.once('error', (error) => {
        // Remove close listener to prevent double handling
        if (this.currentProcess) {
          this.currentProcess.removeAllListeners('close');
        }
        this.isPlaying = false;
        this.currentTrack = null;
        this.emit('error', { track: trackInfo, error });
      });

      return true;
    } catch (error) {
      this.currentTrack = null;
      throw error;
    } finally {
      this.playLock = false;
    }
  }

  async cleanupTempFile() {
    if (this.tempFile) {
      try {
        await fs.remove(this.tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      this.tempFile = null;
    }
  }

  async stop(silent = false) {
    if (this.isStopping) return;

    const track = this.currentTrack;

    if (this.currentProcess) {
      this.isStopping = true;
      const proc = this.currentProcess;

      // Reset state before killing process
      this.currentProcess = null;
      this.currentTrack = null;
      this.isPlaying = false;
      this.isPaused = false;

      try {
        // Graceful shutdown: SIGTERM first, then SIGKILL
        await new Promise((resolve) => {
          let resolved = false;
          const cleanup = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };

          proc.once('close', cleanup);
          proc.once('exit', cleanup);

          // Try graceful termination first
          try {
            proc.kill('SIGTERM');
          } catch (e) {
            // Process may already be dead
            cleanup();
            return;
          }

          // Force kill after timeout if still running
          setTimeout(() => {
            try {
              proc.kill('SIGKILL');
            } catch (e) {
              // Ignore - process may already be dead
            }
            // Final timeout to ensure we don't hang
            setTimeout(cleanup, 500);
          }, PROCESS_KILL_TIMEOUT);
        });

        // Clean up temp file
        await this.cleanupTempFile();

        if (!silent) {
          this.emit('stop', { track });
        }
      } finally {
        this.isStopping = false;
      }
    } else {
      // No process running, just reset state
      this.currentTrack = null;
      this.isPlaying = false;
      this.isPaused = false;
    }
  }

  pause() {
    if (this.currentProcess && this.isPlaying && !this.isPaused && !this.isStopping) {
      if (process.platform !== 'win32') {
        try {
          this.currentProcess.kill('SIGSTOP');
          this.isPaused = true;
          this.emit('pause', { track: this.currentTrack });
          return true;
        } catch (e) {
          // Process may have exited
          return false;
        }
      } else {
        // Windows doesn't support SIGSTOP - emit event but return false
        this.emit('error', {
          track: this.currentTrack,
          error: new Error('Pause not supported on Windows')
        });
        return false;
      }
    }
    return false;
  }

  resume() {
    if (this.currentProcess && this.isPaused && !this.isStopping) {
      if (process.platform !== 'win32') {
        try {
          this.currentProcess.kill('SIGCONT');
          this.isPaused = false;
          this.emit('resume', { track: this.currentTrack });
          return true;
        } catch (e) {
          // Process may have exited
          return false;
        }
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

  // Clean up leftover temp files from previous crashes
  async cleanupTempDir() {
    try {
      const exists = await fs.pathExists(TEMP_DIR);
      if (exists) {
        const files = await fs.readdir(TEMP_DIR);
        for (const file of files) {
          if (file.startsWith('track-') && file.endsWith('.mp3')) {
            await fs.remove(path.join(TEMP_DIR, file));
          }
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

export const audioPlayer = new AudioPlayer();

// Note: cleanupTempDir() is called from main() in index.js with await
// to prevent race conditions with downloads
