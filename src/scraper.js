import axios from 'axios';
import * as cheerio from 'cheerio';

class KhinsiderScraper {
  constructor() {
    this.baseUrl = 'https://downloads.khinsider.com';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  async makeRequest(url, options = {}) {
    const defaultHeaders = {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Referer': this.baseUrl
    };

    return await axios.get(url, {
      headers: { ...defaultHeaders, ...options.headers },
      timeout: 30000,
      ...options
    });
  }

  async searchAlbums(query) {
    try {
      console.log(`🔍 Searching for: "${query}"`);
      
      const response = await this.makeRequest(`${this.baseUrl}/search`, {
        params: { search: query }
      });
      
      const $ = cheerio.load(response.data);
      const albums = [];
      
      // Target the specific albumList table structure
      $('table.albumList tbody tr').each((index, element) => {
        const $row = $(element);
        const cells = $row.find('td');
        
        // Skip header rows or rows without enough cells
        if (cells.length < 4) return;
        
        // Find album links - there are usually multiple links per row
        // We want the one with meaningful text content
        const albumLinks = $row.find('a[href*="/game-soundtracks/album/"]');
        
        let bestLink = null;
        let bestTitle = '';
        
        // Find the link with the most descriptive text (longest non-empty text)
        albumLinks.each((i, link) => {
          const $link = $(link);
          const text = $link.text().trim();
          
          if (text && text.length > bestTitle.length) {
            bestLink = $link;
            bestTitle = text;
          }
        });
        
        if (bestLink && bestTitle) {
          // Extract platform, type, and year from the remaining cells
          const platform = cells.eq(1).text().trim() || 'Unknown';
          const type = cells.eq(2).text().trim() || 'Soundtrack';
          const year = cells.eq(3).text().trim() || 'Unknown';
          
          albums.push({
            title: bestTitle,
            url: this.baseUrl + bestLink.attr('href'),
            platform: platform,
            type: type,
            year: year
          });
        }
      });
      
      console.log(`✅ Found ${albums.length} albums`);
      return albums;
      
    } catch (error) {
      console.error('❌ Error searching albums:', error.message);
      return [];
    }
  }

  async getAlbumTracks(albumUrl) {
    try {
      console.log(`🎵 Fetching tracks from: ${albumUrl}`);
      
      const response = await this.makeRequest(albumUrl);
      const $ = cheerio.load(response.data);
      const tracks = [];
      
      // Target the songlist table - process all rows except header
      $('#songlist tr').each((index, element) => {
        const $row = $(element);
        const cells = $row.find('td');
        
        // Skip header row (has th elements) or rows without enough cells
        if (cells.length < 5) return;
        
        // Based on the debug output, the structure is:
        // Cell 0: Play button (empty)
        // Cell 1: Track number
        // Cell 2: Track name with link
        // Cell 3: Duration with link
        // Cell 4: MP3 size with link
        // Cell 5: FLAC size (optional)
        // Cell 6: Download icon
        // Cell 7: Playlist icon
        
        const trackNameCell = cells.eq(2);
        const durationCell = cells.eq(3);
        const mp3SizeCell = cells.eq(4);
        const flacSizeCell = cells.eq(5);
        
        // Get track name - it's in a link
        const trackLink = trackNameCell.find('a').first();
        const trackName = trackLink.text().trim() || trackNameCell.text().trim();
        const trackHref = trackLink.attr('href');
        
        // Get duration
        const duration = durationCell.find('a').text().trim() || durationCell.text().trim();
        
        // Get file sizes
        const mp3Size = mp3SizeCell.find('a').text().trim() || mp3SizeCell.text().trim();
        const flacSize = flacSizeCell.find('a').text().trim() || flacSizeCell.text().trim();
        
        if (trackName && trackHref) {
          tracks.push({
            name: trackName,
            duration: duration || 'Unknown',
            size: mp3Size || 'Unknown',
            mp3Size: mp3Size || 'Unknown',
            flacSize: flacSize || 'Unknown',
            // The href is the track page URL
            pageUrl: this.baseUrl + trackHref
          });
        }
      });
      
      console.log(`✅ Found ${tracks.length} tracks`);
      return tracks;
      
    } catch (error) {
      console.error('❌ Error fetching album tracks:', error.message);
      return [];
    }
  }

  // For cases where we need to extract actual download URLs from track pages
  async getTrackDirectUrl(trackPageUrl) {
    try {
      const response = await this.makeRequest(trackPageUrl);
      const $ = cheerio.load(response.data);
      
      // Look for various types of download links
      let mp3Url = null;
      let flacUrl = null;
      
      // Method 1: Look for audio source tags
      const audioSource = $('audio source').attr('src');
      if (audioSource) {
        mp3Url = audioSource.startsWith('http') ? audioSource : this.baseUrl + audioSource;
      }
      
      // Method 2: Look for download links
      if (!mp3Url) {
        const downloadLinks = $('a[href*=".mp3"]');
        if (downloadLinks.length > 0) {
          const href = downloadLinks.first().attr('href');
          mp3Url = href.startsWith('http') ? href : this.baseUrl + href;
        }
      }
      
      // Look for FLAC
      const flacLinks = $('a[href*=".flac"]');
      if (flacLinks.length > 0) {
        const href = flacLinks.first().attr('href');
        flacUrl = href.startsWith('http') ? href : this.baseUrl + href;
      }
      
      return {
        mp3: mp3Url,
        flac: flacUrl
      };
      
    } catch (error) {
      console.error('❌ Error fetching track URL:', error.message);
      return { mp3: null, flac: null };
    }
  }

  async getAlbumsByYear(year) {
    try {
      console.log(`📅 Fetching albums from year ${year}...`);
      
      const response = await this.makeRequest(`${this.baseUrl}/game-soundtracks/year/${year}/`);
      const $ = cheerio.load(response.data);
      const albums = [];
      
      $('table.albumList tbody tr').each((index, element) => {
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 2) return;
        
        const albumLinks = $row.find('a[href*="/game-soundtracks/album/"]');
        
        let bestLink = null;
        let bestTitle = '';
        
        albumLinks.each((i, link) => {
          const $link = $(link);
          const text = $link.text().trim();
          
          if (text && text.length > bestTitle.length) {
            bestLink = $link;
            bestTitle = text;
          }
        });
        
        if (bestLink && bestTitle) {
          const platform = cells.eq(1).text().trim() || 'Unknown';
          
          albums.push({
            title: bestTitle,
            url: this.baseUrl + bestLink.attr('href'),
            platform: platform
          });
        }
      });
      
      // Sort albums alphabetically by title
      albums.sort((a, b) => a.title.localeCompare(b.title));
      
      console.log(`✅ Found ${albums.length} albums from ${year}`);
      return albums;
      
    } catch (error) {
      console.error(`❌ Error fetching albums for year ${year}:`, error.message);
      return [];
    }
  }

  async getRecentAlbums() {
    try {
      console.log('🕒 Fetching recent albums...');
      
      const response = await this.makeRequest(this.baseUrl);
      const $ = cheerio.load(response.data);
      const albums = [];
      
      // Look for recent albums on homepage
      $('.latestalbums a[href*="/game-soundtracks/album/"], .albumList a[href*="/game-soundtracks/album/"]').each((_, element) => {
        const $link = $(element);
        const title = $link.text().trim();
        
        if (title && title.length > 0) {
          albums.push({
            title: title,
            url: this.baseUrl + $link.attr('href')
          });
        }
      });
      
      console.log(`✅ Found ${albums.length} recent albums`);
      return albums.slice(0, 20);
      
    } catch (error) {
      console.error('❌ Error fetching recent albums:', error.message);
      return [];
    }
  }

  // Test method to validate a track's download URL
  async testTrackDownload(track) {
    console.log(`\n🧪 Testing track download: "${track.name}"`);
    
    const urlsToTest = [
      { name: 'Direct MP3 URL', url: track.directMp3Url },
      { name: 'Decoded MP3 URL', url: track.decodedMp3Url }
    ];
    
    for (const urlTest of urlsToTest) {
      try {
        console.log(`   Testing ${urlTest.name}: ${urlTest.url}`);
        
        const headResponse = await axios.head(urlTest.url, {
          headers: { 
            'User-Agent': this.userAgent,
            'Referer': this.baseUrl
          },
          timeout: 10000
        });
        
        console.log(`   ✅ ${urlTest.name} works!`);
        console.log(`      Status: ${headResponse.status}`);
        console.log(`      Content-Type: ${headResponse.headers['content-type']}`);
        console.log(`      Content-Length: ${headResponse.headers['content-length']} bytes`);
        
        // If we get an audio content type, this URL is good
        if (headResponse.headers['content-type'] && headResponse.headers['content-type'].includes('audio')) {
          return { success: true, url: urlTest.url, type: urlTest.name };
        }
        
      } catch (error) {
        console.log(`   ❌ ${urlTest.name} failed: ${error.message}`);
      }
    }
    
    return { success: false, url: null, type: null };
  }

  // Comprehensive test method
  async runComprehensiveTest(searchTerm = 'mario') {
    console.log('🚀 COMPREHENSIVE KHINSIDER SCRAPER TEST');
    console.log('=======================================\n');
    
    // Step 1: Test search
    const albums = await this.searchAlbums(searchTerm);
    if (albums.length === 0) {
      console.log('❌ Search failed, cannot continue tests');
      return;
    }
    
    console.log(`\n📋 Top 3 search results for "${searchTerm}":`);
    albums.slice(0, 3).forEach((album, i) => {
      console.log(`  ${i + 1}. "${album.title}" (${album.platform}, ${album.year})`);
    });
    
    // Step 2: Test track extraction with first album
    const testAlbum = albums[0];
    console.log(`\n🎵 Testing track extraction with: "${testAlbum.title}"`);
    
    const tracks = await this.getAlbumTracks(testAlbum.url);
    if (tracks.length === 0) {
      console.log('❌ No tracks found in first album, trying second album...');
      
      if (albums.length > 1) {
        const secondAlbum = albums[1];
        const secondTracks = await this.getAlbumTracks(secondAlbum.url);
        if (secondTracks.length > 0) {
          console.log(`✅ Found ${secondTracks.length} tracks in second album`);
          tracks.push(...secondTracks.slice(0, 2)); // Add first 2 tracks for testing
        }
      }
    }
    
    // Step 3: Test download URLs
    if (tracks.length > 0) {
      console.log(`\n🔗 Testing download URLs (first track):`);
      const testResult = await this.testTrackDownload(tracks[0]);
      
      if (testResult.success) {
        console.log(`✅ Found working download URL: ${testResult.url}`);
      } else {
        console.log('❌ No working download URLs found');
      }
    }
    
    // Step 4: Test recent albums
    const recentAlbums = await this.getRecentAlbums();
    
    console.log('\n📊 TEST SUMMARY');
    console.log('===============');
    console.log(`Search results: ${albums.length} albums`);
    console.log(`Track extraction: ${tracks.length} tracks`);
    console.log(`Recent albums: ${recentAlbums.length} albums`);
    console.log('\n✅ Comprehensive test completed!');
    
    return {
      searchResults: albums.length,
      tracksFound: tracks.length,
      recentAlbums: recentAlbums.length,
      testResults: { albums, tracks, recentAlbums }
    };
  }
}

export default KhinsiderScraper;