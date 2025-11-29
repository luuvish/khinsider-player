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

export function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
