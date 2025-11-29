/**
 * 텍스트를 URL-safe slug로 변환
 * @param {string} text - 변환할 텍스트
 * @returns {string} slug
 */
export function slugify(text) {
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
 * @param {string} name - 파일명
 * @returns {string} 안전한 파일명
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
