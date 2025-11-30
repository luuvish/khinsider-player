import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import os from 'os';
import type { TrackInfo } from '@khinsider/shared';

const TEMP_DIR = path.join(os.tmpdir(), 'khinsider-player');
const PROCESS_KILL_TIMEOUT = 2000; // 2 seconds for graceful shutdown
const MIN_AUDIO_FILE_SIZE = 1024; // Minimum 1KB for valid audio file
const MAX_AUDIO_FILE_SIZE = 500 * 1024 * 1024; // SECURITY: Maximum 500MB to prevent DoS
const DOWNLOAD_STREAM_TIMEOUT = 120000; // 2 minute timeout for stalled streams
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];
const ALLOWED_URL_HOSTS = ['downloads.khinsider.com', 'vgmsite.com']; // Whitelist trusted hosts
const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac'];
// SECURITY: Audio file magic bytes for format verification
const AUDIO_MAGIC_BYTES: Record<string, number[][]> = {
  '.mp3': [[0xFF, 0xFB], [0xFF, 0xFA], [0xFF, 0xF3], [0xFF, 0xF2], [0x49, 0x44, 0x33]], // MP3 frame sync + ID3
  '.flac': [[0x66, 0x4C, 0x61, 0x43]], // 'fLaC'
  '.ogg': [[0x4F, 0x67, 0x67, 0x53]], // 'OggS'
  '.wav': [[0x52, 0x49, 0x46, 0x46]], // 'RIFF'
  '.m4a': [[0x00, 0x00, 0x00], [0x66, 0x74, 0x79, 0x70]], // ftyp (offset varies)
  '.aac': [[0xFF, 0xF1], [0xFF, 0xF9]] // AAC ADTS
};

interface PlayerCommand {
  cmd: string;
  args: string[];
}

interface PlayerStatus {
  isPlaying: boolean;
  isPaused: boolean;
  currentTrack: TrackInfo | null;
}

export class AudioPlayer extends EventEmitter {
  currentProcess: ChildProcess | null;
  currentTrack: TrackInfo | null;
  isPlaying: boolean;
  isPaused: boolean;
  tempFile: string | null;
  playLock: boolean;
  isStopping: boolean;

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

  async ensureTempDir(): Promise<void> {
    await fs.ensureDir(TEMP_DIR);
  }

  getPlayerCommand(): PlayerCommand {
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
  sanitizeWindowsPath(filePath: string): string {
    // Only allow valid path characters, reject anything suspicious
    const normalized = path.normalize(filePath);

    // Check for suspicious patterns - block shell metacharacters
    // Including: ; & | ` $ ( ) { } < > @ # " and null bytes
    // Also block PowerShell-specific escape sequences
    // eslint-disable-next-line no-control-regex
    if (/[;&|`$(){}<>@#"\x00]/.test(normalized)) {
      throw new Error('Invalid characters in file path');
    }

    // Block newlines, carriage returns, and other control characters
    // eslint-disable-next-line no-control-regex
    if (/[\r\n\x01-\x1f\x7f]/.test(normalized)) {
      throw new Error('Invalid characters in file path');
    }

    // Block PowerShell variable prefix patterns
    if (/\$\{|\$\(|\$[a-zA-Z_]/.test(normalized)) {
      throw new Error('Invalid characters in file path');
    }

    // Escape single quotes for PowerShell single-quoted string
    return normalized.replace(/'/g, "''");
  }

  // SECURITY: Validate local file path is an audio file within allowed directories
  private async validateLocalPath(filePath: string): Promise<string> {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }

    // Resolve to absolute path and normalize
    const resolvedPath = path.resolve(filePath);

    // SECURITY: Block path traversal attempts
    if (filePath.includes('..') || filePath.includes('\0')) {
      throw new Error('Invalid file path: path traversal not allowed');
    }

    // SECURITY: Validate file extension is an allowed audio format
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!ALLOWED_AUDIO_EXTENSIONS.includes(ext)) {
      throw new Error(`Invalid file type: only audio files are allowed (${ALLOWED_AUDIO_EXTENSIONS.join(', ')})`);
    }

    // SECURITY: Only allow files from TEMP_DIR (downloaded files)
    // This prevents arbitrary local file access
    const resolvedTempDir = path.resolve(TEMP_DIR);
    if (!resolvedPath.startsWith(resolvedTempDir + path.sep)) {
      throw new Error('Local file playback is only allowed for downloaded files in temp directory');
    }

    // Verify file exists and is a regular file (not symlink, directory, etc.)
    try {
      const stats = await fs.lstat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error('Path is not a regular file');
      }
      if (stats.isSymbolicLink()) {
        throw new Error('Symbolic links are not allowed');
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw err;
    }

    // SECURITY: Verify file magic bytes match expected audio format
    await this.verifyAudioMagicBytes(resolvedPath, ext);

    return resolvedPath;
  }

  // SECURITY: Verify file starts with expected magic bytes for audio format
  private async verifyAudioMagicBytes(filePath: string, ext: string): Promise<void> {
    const expectedMagicPatterns = AUDIO_MAGIC_BYTES[ext];
    if (!expectedMagicPatterns) {
      // No magic bytes defined for this extension - skip check
      return;
    }

    // Read first 12 bytes (enough for most magic bytes including ftyp offset)
    const buffer = Buffer.alloc(12);
    const fd = await fs.promises.open(filePath, 'r');
    try {
      await fd.read(buffer, 0, 12, 0);

      // Check if any of the expected patterns match
      let matchFound = false;
      for (const pattern of expectedMagicPatterns) {
        // For M4A, check at offset 4 for 'ftyp' signature
        if (ext === '.m4a' && pattern[0] === 0x66) {
          const ftypMatch = buffer.slice(4, 8).every((byte, i) => byte === [0x66, 0x74, 0x79, 0x70][i]);
          if (ftypMatch) {
            matchFound = true;
            break;
          }
        } else {
          // Standard check from beginning of file
          const match = pattern.every((byte, i) => buffer[i] === byte);
          if (match) {
            matchFound = true;
            break;
          }
        }
      }

      if (!matchFound) {
        throw new Error(`File does not appear to be a valid ${ext} audio file`);
      }
    } finally {
      await fd.close();
    }
  }

  // Validate URL format and protocol
  private validateUrl(url: string): URL {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL for download');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }

    // Check protocol
    if (!ALLOWED_URL_PROTOCOLS.includes(parsedUrl.protocol)) {
      throw new Error(`Invalid URL protocol: ${parsedUrl.protocol}`);
    }

    // SECURITY: Strictly enforce host whitelist to prevent SSRF attacks
    const isAllowedHost = ALLOWED_URL_HOSTS.some(host =>
      parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );

    if (!isAllowedHost) {
      throw new Error(`Download blocked: host not in whitelist: ${parsedUrl.hostname}`);
    }

    // SECURITY: Block private/local IP addresses to prevent SSRF to internal networks
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedPatterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      // Private IP ranges
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      // Link-local
      /^169\.254\./,
      /^fe80:/i
    ];

    for (const pattern of blockedPatterns) {
      if (typeof pattern === 'string') {
        if (hostname === pattern) {
          throw new Error('Download blocked: local/private addresses not allowed');
        }
      } else if (pattern.test(hostname)) {
        throw new Error('Download blocked: private IP ranges not allowed');
      }
    }

    return parsedUrl;
  }

  async downloadToTemp(url: string): Promise<string> {
    // Validate URL format and protocol
    this.validateUrl(url);

    await this.ensureTempDir();

    // Use cryptographically secure random filename to prevent prediction attacks
    const randomId = crypto.randomBytes(16).toString('hex');
    const tempFile = path.join(TEMP_DIR, `track-${randomId}.mp3`);

    // Verify the resolved path stays within TEMP_DIR (path traversal protection)
    const resolvedPath = path.resolve(tempFile);
    if (!resolvedPath.startsWith(path.resolve(TEMP_DIR))) {
      throw new Error('Invalid temp file path');
    }

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

    // SECURITY: Reject if content-length exceeds maximum allowed size
    if (contentLength > MAX_AUDIO_FILE_SIZE) {
      response.data.destroy();
      throw new Error(`File too large: ${Math.round(contentLength / 1024 / 1024)}MB exceeds ${Math.round(MAX_AUDIO_FILE_SIZE / 1024 / 1024)}MB limit`);
    }

    let downloadedBytes = 0;
    const writer = fs.createWriteStream(tempFile);

    return new Promise((resolve, reject) => {
      let settled = false;
      let streamsDestroyed = false;
      let streamTimeout: NodeJS.Timeout | null = null;
      let lastDataTime = Date.now();

      // Centralized stream cleanup with duplicate call protection
      const destroyStreams = () => {
        if (streamsDestroyed) return;
        streamsDestroyed = true;
        if (streamTimeout) {
          clearTimeout(streamTimeout);
          streamTimeout = null;
        }
        try { response.data.destroy(); } catch { /* ignore */ }
        try { writer.destroy(); } catch { /* ignore */ }
      };

      const cleanup = async (error: Error | null) => {
        if (settled) return;
        settled = true;
        destroyStreams();
        await fs.remove(tempFile).catch(() => {});
        if (error) {
          reject(error);
        }
      };

      // SECURITY: Stream timeout to prevent stalled connections
      const resetStreamTimeout = () => {
        if (streamTimeout) {
          clearTimeout(streamTimeout);
        }
        streamTimeout = setTimeout(() => {
          if (!settled) {
            cleanup(new Error('Download stream timeout - connection stalled')).catch(() => {});
          }
        }, DOWNLOAD_STREAM_TIMEOUT);
      };

      resetStreamTimeout();

      // Handle stream errors
      response.data.on('error', (err: Error) => {
        cleanup(new Error(`Download stream error: ${err.message}`)).catch((cleanupErr) => {
          console.error('Cleanup error during stream error handling:', cleanupErr);
        });
      });

      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        lastDataTime = Date.now();
        resetStreamTimeout();

        // SECURITY: Check file size during download
        if (downloadedBytes > MAX_AUDIO_FILE_SIZE) {
          cleanup(new Error(`File too large: exceeds ${Math.round(MAX_AUDIO_FILE_SIZE / 1024 / 1024)}MB limit`)).catch(() => {});
        }
      });

      response.data.pipe(writer);

      writer.on('finish', async () => {
        if (settled) return;
        settled = true;
        if (streamTimeout) {
          clearTimeout(streamTimeout);
        }

        // Validate file size
        if (downloadedBytes < MIN_AUDIO_FILE_SIZE) {
          destroyStreams();
          await fs.remove(tempFile).catch(() => {});
          reject(new Error('Downloaded file too small, possibly corrupted'));
          return;
        }

        // Verify content-length if provided
        if (contentLength > 0 && downloadedBytes < contentLength * 0.9) {
          destroyStreams();
          await fs.remove(tempFile).catch(() => {});
          reject(new Error('Download incomplete'));
          return;
        }

        resolve(tempFile);
      });

      writer.on('error', (err) => {
        cleanup(err).catch((cleanupErr) => {
          console.error('Cleanup error during writer error handling:', cleanupErr);
        });
      });
    });
  }

  async play(source: string, trackInfo: TrackInfo = { name: '' }): Promise<boolean> {
    // Validate source parameter
    if (!source || typeof source !== 'string') {
      return Promise.reject(new Error('Invalid audio source'));
    }

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
        } catch (error: unknown) {
          this.currentTrack = null; // Reset on error
          this.emit('error', { track: trackInfo, error });
          throw error;
        }
      } else {
        // SECURITY: Validate local file path before playback
        try {
          audioPath = await this.validateLocalPath(source);
        } catch (error: unknown) {
          this.currentTrack = null;
          this.emit('error', { track: trackInfo, error });
          throw error;
        }
        this.tempFile = null;
      }

      // File existence is already verified in validateLocalPath for local files
      // and downloadToTemp creates the file for downloads, but verify anyway for safety
      if (!await fs.pathExists(audioPath)) {
        this.currentTrack = null; // Reset on error
        const error = new Error(`Audio file not found: ${audioPath}`);
        this.emit('error', { track: trackInfo, error });
        throw error;
      }

      const { cmd, args } = this.getPlayerCommand();

      let finalArgs;
      let tempScriptFile: string | null = null;

      if (process.platform === 'win32') {
        // Windows: Use a script file to avoid command injection
        // This is safer than embedding the path in the command string
        try {
          // Validate the audio path doesn't contain malicious content
          this.sanitizeWindowsPath(audioPath);

          // Create a temporary PowerShell script file
          const scriptId = crypto.randomBytes(8).toString('hex');
          tempScriptFile = path.join(TEMP_DIR, `play-${scriptId}.ps1`);

          // SECURITY: Validate audio path before embedding in script
          // Only allow paths within TEMP_DIR to prevent path traversal
          const resolvedPath = path.resolve(audioPath);
          const resolvedTempDir = path.resolve(TEMP_DIR);
          if (!resolvedPath.startsWith(resolvedTempDir + path.sep)) {
            throw new Error('Invalid audio path: must be within temp directory');
          }

          // SECURITY: Use Base64 encoding to safely pass the path to PowerShell
          // This prevents command injection via special characters in filenames
          const base64Path = Buffer.from(audioPath, 'utf8').toString('base64');

          // Write script with the path decoded from Base64, avoiding string interpolation
          const scriptContent = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName presentationCore
$base64Path = '${base64Path}'
$audioPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($base64Path))
$audioPath = [System.IO.Path]::GetFullPath($audioPath)
if (-not (Test-Path -LiteralPath $audioPath)) { throw "File not found" }
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([uri]$audioPath)
$player.Play()
while($player.NaturalDuration.HasTimeSpan -eq $false -or $player.Position -lt $player.NaturalDuration.TimeSpan) {
  Start-Sleep -Milliseconds 100
}
$player.Close()
`;
          await fs.writeFile(tempScriptFile, scriptContent, { encoding: 'utf8', mode: 0o600 });

          finalArgs = [
            '-NoProfile',
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-File', tempScriptFile
          ];
        } catch (error: unknown) {
          // Cleanup temp script on error
          if (tempScriptFile) {
            await fs.remove(tempScriptFile).catch(() => {});
          }
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

      // Capture tempScriptFile for cleanup in event handlers
      const scriptToCleanup = tempScriptFile;

      // Use .once() to prevent listener accumulation
      this.currentProcess.once('close', async (code) => {
        // Ignore if already stopped (by stop() method) or stopping
        if (!this.isPlaying || this.isStopping) return;

        this.isPlaying = false;
        this.currentProcess = null;

        // Clean up temp files with error handling
        try {
          await this.cleanupTempFile();
          if (scriptToCleanup) {
            await fs.remove(scriptToCleanup).catch(() => {});
          }
        } catch {
          // Ignore cleanup errors
        }

        if (code === 0 || code === null) {
          this.emit('ended', { track: trackInfo });
        } else {
          this.emit('error', { track: trackInfo, code });
        }
      });

      this.currentProcess.once('error', async (error) => {
        // Remove close listener to prevent double handling
        if (this.currentProcess) {
          this.currentProcess.removeAllListeners('close');
        }
        this.isPlaying = false;
        this.currentTrack = null;

        // Cleanup temp script on error
        if (scriptToCleanup) {
          await fs.remove(scriptToCleanup).catch(() => {});
        }

        this.emit('error', { track: trackInfo, error });
      });

      return true;
    } catch (error: unknown) {
      this.currentTrack = null;
      throw error;
    } finally {
      this.playLock = false;
    }
  }

  async cleanupTempFile(): Promise<void> {
    if (this.tempFile) {
      try {
        await fs.remove(this.tempFile);
      } catch {
        // Ignore cleanup errors
      }
      this.tempFile = null;
    }
  }

  async stop(silent = false): Promise<void> {
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
        // Graceful shutdown with absolute maximum timeout
        const MAX_STOP_TIMEOUT = 5000; // 5 seconds absolute max
        let forceKilled = false; // Prevent duplicate SIGKILL

        const forceKill = () => {
          if (forceKilled) return;
          forceKilled = true;
          try { proc.kill('SIGKILL'); } catch { /* ignore - process may be dead */ }
        };

        await Promise.race([
          // Main shutdown logic
          new Promise<void>((resolve) => {
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
            } catch {
              // Process may already be dead
              cleanup();
              return;
            }

            // Force kill after timeout if still running
            setTimeout(() => {
              forceKill();
              // Final timeout to ensure we don't hang
              setTimeout(cleanup, 500);
            }, PROCESS_KILL_TIMEOUT);
          }),
          // Absolute timeout fallback
          new Promise<void>((resolve) => {
            setTimeout(() => {
              forceKill();
              resolve();
            }, MAX_STOP_TIMEOUT);
          })
        ]);

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

  pause(): boolean {
    if (this.currentProcess && this.isPlaying && !this.isPaused && !this.isStopping) {
      if (process.platform !== 'win32') {
        try {
          this.currentProcess.kill('SIGSTOP');
          this.isPaused = true;
          this.emit('pause', { track: this.currentTrack });
          return true;
        } catch {
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

  resume(): boolean {
    if (this.currentProcess && this.isPaused && !this.isStopping) {
      if (process.platform !== 'win32') {
        try {
          this.currentProcess.kill('SIGCONT');
          this.isPaused = false;
          this.emit('resume', { track: this.currentTrack });
          return true;
        } catch {
          // Process may have exited
          return false;
        }
      }
    }
    return false;
  }

  togglePause(): boolean {
    if (this.isPaused) {
      return this.resume();
    } else {
      return this.pause();
    }
  }

  getStatus(): PlayerStatus {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentTrack: this.currentTrack
    };
  }

  // Clean up leftover temp files from previous crashes
  async cleanupTempDir(): Promise<void> {
    try {
      const exists = await fs.pathExists(TEMP_DIR);
      if (exists) {
        const files = await fs.readdir(TEMP_DIR);
        // SECURITY: Strict filename validation to prevent path traversal
        const SAFE_TRACK_PATTERN = /^track-[a-f0-9]{32}\.mp3$/;
        const SAFE_SCRIPT_PATTERN = /^play-[a-f0-9]{16}\.ps1$/;

        for (const file of files) {
          // Only delete files matching our exact naming patterns
          if (SAFE_TRACK_PATTERN.test(file) || SAFE_SCRIPT_PATTERN.test(file)) {
            const filePath = path.join(TEMP_DIR, file);
            // SECURITY: Verify file is within TEMP_DIR after path resolution
            const resolvedPath = path.resolve(filePath);
            const resolvedTempDir = path.resolve(TEMP_DIR);
            if (resolvedPath.startsWith(resolvedTempDir + path.sep)) {
              // SECURITY: Check that file is not a symlink to prevent symlink attacks
              try {
                const stat = await fs.lstat(filePath);
                if (stat.isSymbolicLink()) {
                  // Skip symlinks - do not follow or delete
                  continue;
                }
                if (!stat.isFile()) {
                  // Skip non-regular files (directories, devices, etc.)
                  continue;
                }
                // Use unlink instead of remove to avoid recursive deletion
                await fs.unlink(filePath).catch(() => {});
              } catch {
                // File doesn't exist or access error - skip
              }
            }
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

export const audioPlayer = new AudioPlayer();

// Note: cleanupTempDir() is called from main() in index.js with await
// to prevent race conditions with downloads
