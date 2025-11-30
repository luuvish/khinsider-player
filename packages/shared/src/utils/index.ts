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
 * Path traversal 공격 방지를 위해 .. 및 경로 구분자 제거
 */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let sanitized = name
    // Remove path traversal patterns (.. and variations)
    .replace(/\.{2,}/g, '')
    // Remove path separators (both Unix and Windows)
    .replace(/[/\\]/g, '')
    // Remove other dangerous characters
    .replace(/[<>:"|?*]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Prevent hidden files (starting with .)
  if (sanitized.startsWith('.')) {
    sanitized = sanitized.slice(1);
  }

  // Prevent empty result after sanitization
  if (!sanitized) {
    return 'unnamed';
  }

  return sanitized.slice(0, 200);
}

/**
 * HTML 특수 문자 이스케이프 (XSS 방지)
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}

// SECURITY: Pre-compiled regex patterns for IP validation (avoids repeated compilation)
// IPv4 octet pattern: matches 0-255 only (not 0-999 like \d{1,3})
const IPV4_OCTET = '(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])';
const IPV4_OCTET_PATTERN = new RegExp(`^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`);

const PRIVATE_IPV4_PATTERNS = [
  new RegExp(`^10\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),           // 10.0.0.0/8
  new RegExp(`^172\\.(1[6-9]|2[0-9]|3[01])\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`), // 172.16.0.0/12
  new RegExp(`^192\\.168\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),                    // 192.168.0.0/16
  new RegExp(`^169\\.254\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),                    // Link-local 169.254.0.0/16
  new RegExp(`^127\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),          // Loopback 127.0.0.0/8
];

// SECURITY: IPv6 validation helper - checks if hostname is a valid IPv6 address
// and if so, whether it falls within private/reserved ranges
function isPrivateIPv6(hostname: string): boolean {
  // Remove brackets if present (URL format: [::1])
  const cleanHostname = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // Basic IPv6 format check - should contain colons and only hex digits/colons
  if (!/^[0-9a-f:]+$/i.test(cleanHostname)) {
    return false; // Not an IPv6 address
  }

  // SECURITY: Reject addresses with leading/trailing colons (except :: patterns)
  // This prevents bypass attempts like ":1:2:3:4:5:6:7" or "1:2:3:4:5:6:7:"
  if (cleanHostname.startsWith(':') && !cleanHostname.startsWith('::')) {
    return false;
  }
  if (cleanHostname.endsWith(':') && !cleanHostname.endsWith('::')) {
    return false;
  }

  // Expand IPv6 address for proper prefix checking
  // NOTE: We rely solely on expansion for loopback/unspecified detection
  // to handle all equivalent forms (::1, 0::1, 0:0::1, etc.)
  const expandIPv6 = (addr: string): string | null => {
    // Handle :: expansion
    const parts = addr.split('::');
    if (parts.length > 2) return null; // Invalid: more than one ::

    let segments: string[];
    if (parts.length === 2) {
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];

      // SECURITY: Reject empty segments from malformed input like "1::2::"
      if (left.some(s => s === '' && parts[0] !== '') ||
          right.some(s => s === '' && parts[1] !== '')) {
        return null;
      }

      const missing = 8 - left.length - right.length;
      if (missing < 0) return null;
      segments = [...left, ...Array(missing).fill('0'), ...right];
    } else {
      segments = addr.split(':');
      // SECURITY: Reject empty segments in non-:: addresses
      if (segments.some(s => s === '')) {
        return null;
      }
    }

    if (segments.length !== 8) return null;

    // Validate and normalize each segment
    const validated: string[] = [];
    for (const seg of segments) {
      // SECURITY: Validate segment format (1-4 hex chars, or '0' for expanded)
      if (!/^[0-9a-f]{1,4}$/i.test(seg) && seg !== '0') return null;
      // SECURITY: Validate numeric range (0x0000-0xFFFF)
      const num = parseInt(seg || '0', 16);
      if (isNaN(num) || num < 0 || num > 0xFFFF) return null;
      validated.push(num.toString(16).padStart(4, '0'));
    }
    return validated.join(':');
  };

  const expanded = expandIPv6(cleanHostname);
  if (!expanded) return false; // Invalid IPv6 format

  // SECURITY: Check for loopback (::1 and all equivalent forms)
  // After expansion, loopback is always 0000:0000:0000:0000:0000:0000:0000:0001
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return true;
  }

  // SECURITY: Check for unspecified address (:: and all equivalent forms)
  // After expansion, unspecified is always 0000:0000:0000:0000:0000:0000:0000:0000
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') {
    return true;
  }

  const firstSegment = expanded.substring(0, 4);
  // SECURITY: Use numeric comparison to avoid string comparison pitfalls
  const firstSegmentNum = parseInt(firstSegment, 16);

  // fc00::/7 - Unique local addresses (fc00-fdff)
  // 0xfc00 = 64512, 0xfdff = 65023
  if (firstSegmentNum >= 0xfc00 && firstSegmentNum <= 0xfdff) {
    return true;
  }

  // fe80::/10 - Link-local addresses (fe80-febf)
  // 0xfe80 = 65152, 0xfebf = 65215
  if (firstSegmentNum >= 0xfe80 && firstSegmentNum <= 0xfebf) {
    return true;
  }

  // ff00::/8 - Multicast addresses (ff00-ffff)
  // 0xff00 = 65280, 0xffff = 65535
  if (firstSegmentNum >= 0xff00 && firstSegmentNum <= 0xffff) {
    return true;
  }

  // 2001:db8::/32 - Documentation range
  if (expanded.startsWith('2001:0db8:')) {
    return true;
  }

  // 100::/64 - Discard prefix (black hole)
  if (expanded.startsWith('0100:0000:0000:0000:')) {
    return true;
  }

  return false;
}

// Legacy patterns kept for simple prefix matching (backup check)
const PRIVATE_IPV6_PATTERNS = [
  /^fc[0-9a-f]{2}:/i,                          // IPv6 unique local fc00::/7
  /^fd[0-9a-f]{2}:/i,                          // IPv6 unique local fd00::/8
  /^fe80:/i,                                    // IPv6 link-local
  /^ff[0-9a-f]{2}:/i,                          // IPv6 multicast ff00::/8
  /^2001:0?db8:/i,                             // Documentation 2001:db8::/32
];

const RESERVED_IP_PATTERNS = [
  new RegExp(`^224\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),  // Multicast 224.0.0.0/4
  new RegExp(`^240\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),  // Reserved 240.0.0.0/4
  new RegExp(`^0\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),    // "This" network 0.0.0.0/8
  new RegExp(`^100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`), // Shared address space 100.64.0.0/10
  new RegExp(`^198\\.1[89]\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`),          // Benchmark testing 198.18.0.0/15
];

const IPV4_MAPPED_IPV6_PATTERN = new RegExp(`^::ffff:(${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET})$`, 'i');

// SECURITY: Blocked ports commonly used by internal services (SSRF prevention)
// These ports are blocked to prevent attackers from reaching internal services
const BLOCKED_PORTS = new Set([
  // Databases
  6379, 6380,           // Redis
  27017, 27018, 27019,  // MongoDB
  5432, 5433,           // PostgreSQL
  3306, 3307,           // MySQL
  9200, 9300,           // Elasticsearch
  5984,                 // CouchDB
  8086,                 // InfluxDB
  9042, 7199,           // Cassandra
  // Message queues
  5672, 15672,          // RabbitMQ
  9092,                 // Kafka
  4222,                 // NATS
  // Other services
  11211,                // Memcached
  2181,                 // Zookeeper
  8500, 8600,           // Consul
  2379, 2380,           // etcd
  4369,                 // Erlang port mapper
  // Mail protocols
  25, 465, 587,         // SMTP
  110, 995,             // POP3
  143, 993,             // IMAP
  // Admin/monitoring
  9090,                 // Prometheus
  3000,                 // Grafana (common)
  8080, 8443,           // Common admin ports
]);

/**
 * URL 검증 - 허용된 프로토콜만 허용
 * SSRF 방지를 위해 내부 IP 주소 및 위험한 포트 차단
 *
 * @param url - 검증할 URL
 * @param allowedProtocols - 허용할 프로토콜 목록 (기본: http:, https:)
 * @returns URL이 유효하고 안전하면 true
 */
export function isValidUrl(
  url: string,
  allowedProtocols = ['http:', 'https:']
): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Validate URL length to prevent DoS
  if (url.length > 8192) {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Check protocol
    if (!allowedProtocols.includes(parsed.protocol)) {
      return false;
    }

    // SECURITY: Block commonly exploited internal service ports
    if (parsed.port) {
      const portNum = parseInt(parsed.port, 10);
      if (BLOCKED_PORTS.has(portNum)) {
        return false;
      }
    }

    // SECURITY: Normalize hostname using NFKC to prevent Unicode homograph attacks
    // This converts lookalike characters (e.g., Cyrillic 'а' U+0430) to their canonical form
    const hostname = parsed.hostname.toLowerCase().normalize('NFKC');

    // SECURITY: Reject hostnames containing non-ASCII characters after normalization
    // Valid hostnames should only contain ASCII letters, digits, hyphens, and dots
    // eslint-disable-next-line no-control-regex
    if (!/^[\x00-\x7F]*$/.test(hostname)) {
      // Allow punycode (xn--) domains for internationalized domain names
      if (!hostname.startsWith('xn--') && !hostname.includes('.xn--')) {
        return false;
      }
    }

    // Validate hostname length
    if (hostname.length > 253 || hostname.length === 0) {
      return false;
    }

    // Block localhost variations (127.x.x.x is handled by PRIVATE_IPV4_PATTERNS)
    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return false;
    }

    // Block private IPv4 ranges (RFC 1918)
    for (const pattern of PRIVATE_IPV4_PATTERNS) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    // Block private IPv6 ranges (RFC 4193, link-local) using comprehensive validation
    // First use the new comprehensive IPv6 checker
    if (isPrivateIPv6(hostname)) {
      return false;
    }
    // Backup: also check with regex patterns for simple prefix matching
    for (const pattern of PRIVATE_IPV6_PATTERNS) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    // Block IPv4-mapped IPv6 addresses (::ffff:192.168.x.x)
    const ipv4MappedMatch = hostname.match(IPV4_MAPPED_IPV6_PATTERN);
    if (ipv4MappedMatch) {
      const ipv4 = ipv4MappedMatch[1];
      // Re-check the mapped IPv4 against private ranges (includes 127.x.x.x loopback)
      for (const pattern of PRIVATE_IPV4_PATTERNS) {
        if (pattern.test(ipv4)) {
          return false;
        }
      }
      // Also check reserved ranges for mapped IPv4
      for (const pattern of RESERVED_IP_PATTERNS) {
        if (pattern.test(ipv4)) {
          return false;
        }
      }
    }

    // Block .local, .internal, .localhost domains
    if (
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.localhost') ||
      hostname === 'localhost.localdomain'
    ) {
      return false;
    }

    // Block multicast and reserved ranges
    for (const pattern of RESERVED_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 상대 URL 검증 - javascript: 등의 위험한 프로토콜 차단
 * Protocol-relative URLs (//) 도 차단하여 외부 리소스 로드 방지
 * 인코딩 우회 공격 방지 포함
 */
// SECURITY: Maximum URL length to prevent DoS attacks
const MAX_URL_LENGTH = 8192;

export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // SECURITY: Reject excessively long URLs to prevent DoS
  if (url.length > MAX_URL_LENGTH) {
    return '';
  }

  // 트림
  let cleaned = url.trim();

  // Remove null bytes and control characters that could bypass checks
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');

  // Decode URL encoding to detect obfuscated dangerous protocols
  // Apply decoding multiple times to handle double/triple encoding
  let decoded = cleaned;
  for (let i = 0; i < 3; i++) {
    try {
      const newDecoded = decodeURIComponent(decoded);
      if (newDecoded === decoded) break; // No more decoding needed
      decoded = newDecoded;
    } catch {
      // Invalid encoding, use current value
      break;
    }
  }

  // SECURITY: Comprehensive Unicode whitespace pattern for consistent removal
  // Includes all ASCII whitespace and Unicode space characters
  const UNICODE_WHITESPACE = /[\s\t\n\r\u00A0\u2000-\u200B\u2028\u2029\u3000]/g;

  // Normalize: remove all whitespace for protocol checking
  const normalized = decoded.replace(UNICODE_WHITESPACE, '').toLowerCase();

  // 위험한 프로토콜 차단 (인코딩 우회 포함)
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'];
  for (const protocol of dangerousProtocols) {
    if (normalized.startsWith(protocol)) {
      return '';
    }
  }

  // SECURITY: Also check original cleaned string with same comprehensive whitespace removal
  // Using same pattern to ensure consistency and prevent bypass via Unicode spaces
  const cleanedNoSpace = cleaned.replace(UNICODE_WHITESPACE, '').toLowerCase();
  for (const protocol of dangerousProtocols) {
    if (cleanedNoSpace.startsWith(protocol)) {
      return '';
    }
  }

  // Block protocol-relative URLs (//example.com) to prevent loading external resources
  if (cleaned.startsWith('//') || normalized.startsWith('//')) {
    return '';
  }

  // Block URLs that try to use backslash as path separator (IE quirk)
  if (cleaned.startsWith('\\\\') || cleaned.startsWith('\\')) {
    return '';
  }

  // SECURITY: Block path traversal patterns
  // Check both decoded and original for .. sequences that could escape directories
  if (normalized.includes('..') || cleaned.includes('..')) {
    return '';
  }

  // Block Unicode homograph attacks - reject non-ASCII characters in protocol position
  const colonIndex = cleaned.indexOf(':');
  if (colonIndex > 0 && colonIndex < 20) {
    const potentialProtocol = cleaned.substring(0, colonIndex);
    // Protocol should only contain ASCII letters
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(potentialProtocol)) {
      return '';
    }
  }

  return cleaned;
}

/**
 * 사용자 입력 텍스트 새니타이즈
 */
export function sanitizeInput(text: string, maxLength = 1000): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  // 제어 문자 제거, 길이 제한
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}
