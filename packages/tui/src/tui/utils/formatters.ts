export function formatDuration(duration: string | undefined | null): string {
  if (!duration) return '--:--';
  return duration;
}

export function formatTrackNumber(num: number, total: number): string {
  const padLength = String(total).length;
  return String(num).padStart(padLength, '0');
}

export function formatProgress(current: number, total: number): string {
  if (!total) return '[----------] 0%';

  const percent = Math.round((current / total) * 100);
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

export function truncate(str: string | undefined | null, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

// Escape blessed markup characters in user-provided text
// Blessed uses {tag} syntax for colors/styles, so curly braces must be escaped
export function escapeBlessedMarkup(str: string | undefined | null): string {
  if (!str) return '';
  // Escape opening curly braces by replacing { with {{
  // This prevents blessed from interpreting {text} as markup tags
  return str.replace(/\{/g, '{{').replace(/\}/g, '}}');
}
