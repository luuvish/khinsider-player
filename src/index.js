#!/usr/bin/env node

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

const shouldSuppress = (chunk) => {
  if (typeof chunk !== 'string') return false;
  return suppressPatterns.some(pattern => chunk.includes(pattern));
};

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, callback) => {
  if (shouldSuppress(chunk)) return true;
  return originalStderrWrite(chunk, encoding, callback);
};

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
  if (shouldSuppress(chunk)) return true;
  return originalStdoutWrite(chunk, encoding, callback);
};

import { initializeDatabase, closeDatabase } from './data/database.js';
import { albumRepo } from './data/repositories/album-repo.js';
import { trackRepo } from './data/repositories/track-repo.js';
import KhinsiderScraper from './scraper.js';
import { createPlaybackController } from './playback/controller.js';
import { createDownloader } from './storage/downloader.js';
import { App } from './tui/App.js';

async function main() {
  try {
    // Initialize database
    initializeDatabase();

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

    // Handle graceful shutdown
    const shutdown = async () => {
      await playbackController.stop();
      closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', () => {
      shutdown();
    });

    // Initialize and run app
    await app.initialize();
    app.run();

  } catch (error) {
    closeDatabase();
    process.exit(1);
  }
}

main();
