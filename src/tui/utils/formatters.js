export function formatDuration(duration) {
  if (!duration) return '--:--';
  return duration;
}

export function formatTrackNumber(num, total) {
  const padLength = String(total).length;
  return String(num).padStart(padLength, '0');
}

export function formatProgress(current, total) {
  if (!total) return '[----------] 0%';

  const percent = Math.round((current / total) * 100);
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

export function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function padRight(str, length) {
  if (!str) str = '';
  if (str.length >= length) return str.slice(0, length);
  return str + ' '.repeat(length - str.length);
}

export function padLeft(str, length) {
  if (!str) str = '';
  if (str.length >= length) return str.slice(0, length);
  return ' '.repeat(length - str.length) + str;
}

export function formatAlbumInfo(album, index, total) {
  const progress = total ? `${index + 1}/${total}` : '';
  return `${album.title} ${progress ? `(${progress})` : ''}`;
}

export function formatTrackInfo(track, index, total) {
  const num = formatTrackNumber(index + 1, total);
  const duration = formatDuration(track.duration);
  return `${num}. ${track.name} [${duration}]`;
}

export function formatYearInfo(year, albumCount) {
  return `${year} (${albumCount} albums)`;
}
