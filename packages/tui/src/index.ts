// Suppress blessed tput warnings (stderr and stdout)
const suppressPatterns = [
  'xterm-256color',
  'Error on',
  'Setulc',
  'stack.push',
  'stack.pop',
  'out.push',
  '%p1%',
  '\\u001b'
];

const shouldSuppress = (chunk: Uint8Array | string): boolean => {
  if (typeof chunk !== 'string') return false;
  return suppressPatterns.some(pattern => chunk.includes(pattern));
};

type WriteCallback = (err?: Error | null) => void;

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((
  chunk: Uint8Array | string,
  encodingOrCallback?: BufferEncoding | WriteCallback,
  callback?: WriteCallback
): boolean => {
  if (shouldSuppress(chunk)) return true;
  return originalStderrWrite(chunk, encodingOrCallback as BufferEncoding, callback);
}) as typeof process.stderr.write;

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((
  chunk: Uint8Array | string,
  encodingOrCallback?: BufferEncoding | WriteCallback,
  callback?: WriteCallback
): boolean => {
  if (shouldSuppress(chunk)) return true;
  return originalStdoutWrite(chunk, encodingOrCallback as BufferEncoding, callback);
}) as typeof process.stdout.write;

import {
  initializeDatabase,
  closeDatabase,
  albumRepo,
  trackRepo,
  KhinsiderScraper,
  createDownloader
} from '@khinsider/core';
import { createPlaybackController } from './playback/controller.js';
import { audioPlayer } from './playback/player.js';
import { App } from './tui/App.js';

async function main() {
  try {
    // Initialize database
    initializeDatabase();

    // Clean up any leftover temp files from previous crashes (await to prevent race)
    await audioPlayer.cleanupTempDir();

    // Create scraper
    const scraper = new KhinsiderScraper();

    // Create playback controller
    const playbackController = createPlaybackController(scraper);

    // Create downloader
    const downloader = createDownloader(scraper);

    // Create and initialize TUI app
    const app = new App({
      scraper,
      playbackController,
      albumRepo,
      trackRepo,
      downloader
    });

    // Handle graceful shutdown with timeout
    const SHUTDOWN_TIMEOUT = 5000; // 5 seconds max for cleanup
    let isShuttingDown = false;

    const shutdown = async (exitCode = 0) => {
      if (isShuttingDown) return; // Prevent multiple shutdown attempts
      isShuttingDown = true;

      // Force exit if cleanup takes too long
      const forceExitTimer = setTimeout(() => {
        console.error('Shutdown timeout - forcing exit');
        process.exit(exitCode);
      }, SHUTDOWN_TIMEOUT);

      try {
        await playbackController.stop();
      } catch (e) {
        console.error('Error stopping playback:', e);
      }

      try {
        closeDatabase();
      } catch (e) {
        console.error('Error closing database:', e);
      }

      clearTimeout(forceExitTimer);
      process.exit(exitCode);
    };

    process.on('SIGINT', () => shutdown(0));
    process.on('SIGTERM', () => shutdown(0));
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught Exception:', error);
      await shutdown(1);
    });
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await shutdown(1);
    });

    // Initialize and run app
    await app.initialize();
    app.run();

  } catch (error) {
    console.error('Fatal error during initialization:', error);
    closeDatabase();
    process.exit(1);
  }
}

// SECURITY: Handle unhandled promise rejections at top level
main().catch((error) => {
  console.error('Fatal error in main():', error);
  closeDatabase();
  process.exit(1);
});
