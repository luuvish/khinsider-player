#!/usr/bin/env node

import KhinsiderScraper from './scraper.js';
import MusicPlayer from './player.js';
import PlaylistManager from './playlist.js';
import FavoritesManager from './favorites.js';
import UserInterface from './ui.js';
import chalk from 'chalk';

async function main() {
  try {
    const scraper = new KhinsiderScraper();
    const player = new MusicPlayer();
    const playlist = new PlaylistManager();
    const favorites = new FavoritesManager();

    await favorites.initialize();

    player.on('error', (error) => {
      console.error(chalk.red('Player error:'), error.message);
    });

    player.on('trackStart', (track) => {
      if (track && track.name) {
        console.log(chalk.dim(`Started: ${track.name}`));
      }
    });

    player.on('trackEnd', (track) => {
      if (track && track.name) {
        console.log(chalk.dim(`Finished: ${track.name}`));
      }
    });

    const ui = new UserInterface(scraper, player, playlist, favorites);
    await ui.start();

  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log(chalk.cyan('\n\nExiting Khinsider Player...\n'));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught exception:'), error);
  process.exit(1);
});

main();