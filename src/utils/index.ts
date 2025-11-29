/**
 * 텍스트를 URL-safe slug로 변환
 */
export function slugify(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 100);
}

/**
 * 파일명에서 위험한 문자 제거
 */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
