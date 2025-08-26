import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

class UserInterface {
  constructor(scraper, player, playlist, favorites) {
    this.scraper = scraper;
    this.player = player;
    this.playlist = playlist;
    this.favorites = favorites;
    this.currentAlbum = null;
    this.isPlaying = false;
  }

  async start() {
    console.clear();
    console.log(chalk.cyan.bold('\n🎵 Khinsider Player 🎵\n'));
    
    await this.showMainMenu();
  }

  async showMainMenu() {
    const choices = [
      '📅 Browse by Year',
      '🔍 Search Albums', 
      '🆕 Recent Albums',
      '🎵 Current Playlist',
      '⭐ Favorites',
      '📋 Play History',
      '📊 Statistics',
      '❌ Exit'
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }
    ]);

    switch (action) {
      case '📅 Browse by Year':
        await this.browseByYear();
        break;
      case '🔍 Search Albums':
        await this.searchAlbums();
        break;
      case '🆕 Recent Albums':
        await this.showRecentAlbums();
        break;
      case '🎵 Current Playlist':
        await this.showPlaylist();
        break;
      case '⭐ Favorites':
        await this.showFavorites();
        break;
      case '📋 Play History':
        await this.showPlayHistory();
        break;
      case '📊 Statistics':
        await this.showStatistics();
        break;
      case '❌ Exit':
        await this.exit();
        return;
    }

    await this.showMainMenu();
  }

  async searchAlbums() {
    const { query } = await inquirer.prompt([
      {
        type: 'input',
        name: 'query',
        message: 'Enter search query:'
      }
    ]);

    const spinner = ora('Searching albums...').start();
    const albums = await this.scraper.searchAlbums(query);
    spinner.stop();

    if (albums.length === 0) {
      console.log(chalk.yellow('No albums found.'));
      return;
    }

    const choices = albums.map(album => ({
      name: `${album.title} (${album.year}) - ${album.platform}`,
      value: album
    }));

    choices.push({ name: chalk.gray('← Back'), value: null });

    const { selectedAlbum } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAlbum',
        message: 'Select an album:',
        choices
      }
    ]);

    if (selectedAlbum) {
      await this.showAlbumTracks(selectedAlbum);
    }
  }

  async browseByYear() {
    const { year } = await inquirer.prompt([
      {
        type: 'input',
        name: 'year',
        message: 'Enter year (1975-2024):',
        validate: (input) => {
          const y = parseInt(input);
          return y >= 1975 && y <= 2024 ? true : 'Please enter a valid year';
        }
      }
    ]);

    const spinner = ora(`Loading albums from ${year}...`).start();
    const albums = await this.scraper.getAlbumsByYear(year);
    spinner.stop();

    if (albums.length === 0) {
      console.log(chalk.yellow(`No albums found for year ${year}.`));
      return;
    }

    const choices = albums.map(album => ({
      name: `${album.title} - ${album.platform}`,
      value: album
    }));

    choices.push({ name: chalk.gray('← Back'), value: null });

    const { selectedAlbum } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAlbum',
        message: `Albums from ${year}:`,
        choices,
        pageSize: 15
      }
    ]);

    if (selectedAlbum) {
      await this.showAlbumTracks(selectedAlbum);
    }
  }

  async showRecentAlbums() {
    const spinner = ora('Loading recent albums...').start();
    const albums = await this.scraper.getRecentAlbums();
    spinner.stop();

    const choices = albums.map(album => ({
      name: album.title,
      value: album
    }));

    choices.push({ name: chalk.gray('← Back'), value: null });

    const { selectedAlbum } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAlbum',
        message: 'Recent albums:',
        choices,
        pageSize: 15
      }
    ]);

    if (selectedAlbum) {
      await this.showAlbumTracks(selectedAlbum);
    }
  }

  async showAlbumTracks(album) {
    const spinner = ora('Loading tracks...').start();
    const tracks = await this.scraper.getAlbumTracks(album.url);
    spinner.stop();

    if (tracks.length === 0) {
      console.log(chalk.yellow('No tracks found.'));
      return;
    }

    console.log(chalk.green(`\n${album.title}\n`));
    console.log(chalk.cyan(`${tracks.length} tracks - Starting playback...\n`));

    // Add album to play history
    await this.favorites.addAlbumToHistory(album);

    // Automatically start playing all tracks
    await this.playAllTracks(tracks, album);
  }

  async selectTracks(tracks, album) {
    const choices = tracks.map((track, index) => ({
      name: `${index + 1}. ${track.name} (${track.duration})`,
      value: track
    }));

    const { selectedTracks } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedTracks',
        message: 'Select tracks to add to playlist:',
        choices,
        pageSize: 20
      }
    ]);

    if (selectedTracks.length > 0) {
      this.addTracksToPlaylist(selectedTracks, album);
      console.log(chalk.green(`Added ${selectedTracks.length} tracks to playlist`));
    }
  }

  addTracksToPlaylist(tracks, album) {
    const tracksWithAlbum = tracks.map(track => ({
      ...track,
      albumTitle: album.title,
      albumUrl: album.url
    }));
    this.playlist.addMultipleTracks(tracksWithAlbum);
  }

  async playAllTracks(tracks, album) {
    this.playlist.clearPlaylist();
    this.addTracksToPlaylist(tracks, album);
    await this.startPlayback();
  }

  async startPlayback() {
    const currentTrack = this.playlist.getCurrentTrack();
    if (!currentTrack) {
      console.log(chalk.yellow('No tracks in playlist'));
      return;
    }

    await this.playTrack(currentTrack);
  }

  async playTrack(track) {
    const spinner = ora(`Loading: ${track.name}`).start();
    const urls = await this.scraper.getTrackDirectUrl(track.pageUrl);
    spinner.stop();

    if (!urls.mp3) {
      console.log(chalk.red('Unable to get track URL'));
      const next = this.playlist.nextTrack();
      if (next) {
        await this.playTrack(next);
      }
      return;
    }

    console.log(chalk.cyan(`\n♪ Now Playing: ${track.name}`));
    console.log(chalk.gray(`   Album: ${track.albumTitle}`));

    await this.favorites.addToHistory(track);

    this.player.play(urls.mp3, track);

    this.player.once('trackEnd', async () => {
      const next = this.playlist.nextTrack();
      if (next) {
        await this.playTrack(next);
      } else {
        console.log(chalk.gray('\nPlaylist ended'));
      }
    });

    await this.showPlaybackControls(track, urls);
  }

  async showPlaybackControls(track, urls) {
    const isFavorite = this.favorites.isFavorite(track);
    const isAlbumFavorite = this.favorites.isAlbumFavorite(track.albumTitle);
    
    const choices = [
      '⏭️  Next',
      '⏮️  Previous', 
      '⏹️  Stop',
      isFavorite ? '💔 Remove Track from Favorites' : '❤️  Add Track to Favorites',
      isAlbumFavorite ? '💿 Remove Album from Favorites' : '🎧 Add Album to Favorites',
      '📥 Download Track',
      '🔙 Back to Menu'
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Playing: ${track.name}`,
        choices
      }
    ]);

    switch (action) {
      case '⏭️  Next':
        this.player.stop();
        const next = this.playlist.nextTrack();
        if (next) await this.playTrack(next);
        break;
      case '⏮️  Previous':
        this.player.stop();
        const prev = this.playlist.previousTrack();
        if (prev) await this.playTrack(prev);
        break;
      case '⏹️  Stop':
        this.player.stop();
        break;
      case '❤️  Add Track to Favorites':
        await this.favorites.addToFavorites(track, urls.flac || urls.mp3);
        console.log(chalk.green('Added track to favorites'));
        await this.showPlaybackControls(track, urls);
        break;
      case '💔 Remove Track from Favorites':
        const favs = this.favorites.getFavorites();
        const fav = favs.find(f => f.name === track.name && f.albumTitle === track.albumTitle);
        if (fav) {
          await this.favorites.removeFromFavorites(fav.id);
          console.log(chalk.yellow('Removed track from favorites'));
        }
        await this.showPlaybackControls(track, urls);
        break;
      case '🎧 Add Album to Favorites':
        await this.favorites.addAlbumToFavorites({
          title: track.albumTitle,
          url: track.albumUrl
        });
        console.log(chalk.green('Added album to favorites'));
        await this.showPlaybackControls(track, urls);
        break;
      case '💿 Remove Album from Favorites':
        await this.favorites.removeAlbumFromFavorites(track.albumTitle);
        console.log(chalk.yellow('Removed album from favorites'));
        await this.showPlaybackControls(track, urls);
        break;
      case '📥 Download Track':
        await this.downloadTrack(track, urls);
        await this.showPlaybackControls(track, urls);
        break;
      case '🔙 Back to Menu':
        this.player.stop();
        break;
    }
  }

  async downloadTrack(track, urls) {
    const { format } = await inquirer.prompt([
      {
        type: 'list',
        name: 'format',
        message: 'Select format:',
        choices: urls.flac ? ['FLAC', 'MP3'] : ['MP3']
      }
    ]);

    const url = format === 'FLAC' ? urls.flac : urls.mp3;
    const extension = format === 'FLAC' ? '.flac' : '.mp3';
    const filename = `${track.name.replace(/[^a-z0-9]/gi, '_')}${extension}`;
    const destination = `./downloads/${filename}`;

    const spinner = ora(`Downloading ${filename}...`).start();
    
    try {
      await this.player.downloadTrack(url, destination, track.name);
      spinner.succeed(`Downloaded: ${filename}`);
    } catch (error) {
      spinner.fail('Download failed');
    }
  }

  async showPlaylist() {
    const info = this.playlist.getPlaylistInfo();
    
    if (info.tracks.length === 0) {
      console.log(chalk.yellow('Playlist is empty'));
      return;
    }

    console.log(chalk.cyan(`\nPlaylist (${info.totalTracks} tracks)\n`));

    const choices = info.tracks.map((track, index) => ({
      name: `${index === info.currentIndex ? '▶ ' : '  '}${index + 1}. ${track.name} - ${track.albumTitle}`,
      value: index
    }));

    choices.push({ name: chalk.gray('← Back'), value: -1 });

    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Select track to play:',
        choices,
        pageSize: 20
      }
    ]);

    if (selected >= 0) {
      this.playlist.skipToTrack(selected);
      await this.startPlayback();
    }
  }

  async showFavorites() {
    const { type } = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: 'What kind of favorites do you want to see?',
        choices: [
          '🎧 Favorite Albums',
          '🎵 Favorite Tracks',
          chalk.gray('← Back')
        ]
      }
    ]);

    switch (type) {
      case '🎧 Favorite Albums':
        await this.showFavoriteAlbums();
        break;
      case '🎵 Favorite Tracks':
        await this.showFavoriteTracks();
        break;
      default:
        return;
    }
  }

  async showFavoriteAlbums() {
    const favoriteAlbums = this.favorites.getFavoriteAlbums();
    
    if (favoriteAlbums.length === 0) {
      console.log(chalk.yellow('No favorite albums yet'));
      return;
    }

    console.log(chalk.cyan(`\n🎧 Favorite Albums (${favoriteAlbums.length})\n`));

    const choices = favoriteAlbums.map((album, index) => ({
      name: `${index + 1}. ${album.title}`,
      value: album
    }));

    choices.push({ name: chalk.gray('← Back'), value: null });

    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Select favorite album:',
        choices,
        pageSize: 20
      }
    ]);

    if (selected) {
      await this.showAlbumTracks(selected);
    } else {
      await this.showFavorites();
    }
  }

  async showFavoriteTracks() {
    const favorites = this.favorites.getFavorites();
    
    if (favorites.length === 0) {
      console.log(chalk.yellow('No favorite tracks yet'));
      return;
    }

    console.log(chalk.cyan(`\n🎵 Favorite Tracks (${favorites.length})\n`));

    const choices = favorites.map((track, index) => ({
      name: `${index + 1}. ${track.name} - ${track.albumTitle}`,
      value: track
    }));

    choices.push({ name: chalk.gray('← Back'), value: null });

    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Select favorite track:',
        choices,
        pageSize: 20
      }
    ]);

    if (selected) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `${selected.name}:`,
          choices: [
            '▶️  Play',
            '➕ Add to Playlist',
            '💔 Remove from Favorites',
            chalk.gray('← Back')
          ]
        }
      ]);

      switch (action) {
        case '▶️  Play':
          this.playlist.clearPlaylist();
          this.playlist.addTrack(selected);
          await this.startPlayback();
          break;
        case '➕ Add to Playlist':
          this.playlist.addTrack(selected);
          console.log(chalk.green('Added to playlist'));
          await this.showFavoriteTracks();
          break;
        case '💔 Remove from Favorites':
          await this.favorites.removeFromFavorites(selected.id);
          console.log(chalk.yellow('Removed from favorites'));
          await this.showFavoriteTracks();
          break;
        case chalk.gray('← Back'):
          await this.showFavoriteTracks();
          break;
      }
    } else {
      await this.showFavorites();
    }
  }

  async showPlayHistory() {
    const history = this.favorites.getPlayHistory();
    
    if (history.length === 0) {
      console.log(chalk.yellow('No play history yet'));
      return;
    }

    console.log(chalk.cyan(`\n📋 Play History (${history.length} albums)\n`));

    const choices = history.map((album, index) => ({
      name: `${index + 1}. ${album.title} - Played on ${new Date(album.lastPlayed).toLocaleDateString()}`,
      value: album
    }));

    choices.push({ name: chalk.gray('← Back'), value: null });

    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Recently played albums:',
        choices,
        pageSize: 20
      }
    ]);

    if (selected) {
      await this.showAlbumTracks(selected);
    }
  }

  async showStatistics() {
    const stats = await this.favorites.getStatistics();
    
    console.log(chalk.cyan('\n📊 Statistics\n'));
    console.log(chalk.white(`Total Favorites: ${stats.totalFavorites}`));
    console.log(chalk.white(`Total Played: ${stats.totalPlayed}`));
    console.log(chalk.white(`Favorite Albums: ${stats.favoriteAlbums || 0}`));
    console.log(chalk.white(`Local Storage: ${stats.localStorageSize.mb} MB\n`));

    if (stats.mostPlayedTracks.length > 0) {
      console.log(chalk.cyan('Most Played Tracks:'));
      stats.mostPlayedTracks.forEach((track, index) => {
        console.log(`  ${index + 1}. ${track.name} (${track.playCount} plays)`);
      });
    }

    if (stats.favoriteAlbums.length > 0) {
      console.log(chalk.cyan('\nFavorite Albums:'));
      stats.favoriteAlbums.forEach((album, index) => {
        console.log(`  ${index + 1}. ${album.albumTitle} (${album.trackCount} tracks)`);
      });
    }

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }
    ]);
  }

  async exit() {
    this.player.stop();
    console.log(chalk.cyan('\nThank you for using Khinsider Player! 🎵\n'));
    process.exit(0);
  }
}

export default UserInterface;