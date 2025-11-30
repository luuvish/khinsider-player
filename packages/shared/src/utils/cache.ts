/**
 * TTL(Time-To-Live) 지원 LRU(Least Recently Used) 캐시
 *
 * 특징:
 * - 최대 항목 수 제한
 * - TTL 기반 자동 만료
 * - O(1) get/set 성능
 * - 메모리 효율적인 자동 정리
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface LRUCacheOptions {
  /** 최대 캐시 항목 수 (기본: 100) */
  maxSize?: number;
  /** 기본 TTL in milliseconds (기본: 5분) */
  defaultTTL?: number;
  /** 자동 정리 간격 in milliseconds (기본: 1분, 0이면 비활성화) */
  cleanupInterval?: number;
}

export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LRUCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.defaultTTL = options.defaultTTL ?? 5 * 60 * 1000; // 5분
    this.cache = new Map();

    // 자동 정리 타이머 설정
    const cleanupInterval = options.cleanupInterval ?? 60 * 1000; // 1분
    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, cleanupInterval);

      // Node.js에서 프로세스 종료를 방해하지 않도록 설정
      if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * 캐시에서 값 가져오기
   * 만료된 항목은 자동으로 제거됨
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // 만료 확인
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU: 최근 접근한 항목을 맨 뒤로 이동
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 캐시에 값 저장
   * @param key - 캐시 키
   * @param value - 저장할 값
   * @param ttl - TTL in milliseconds (기본값 사용 시 생략)
   */
  set(key: K, value: V, ttl?: number): void {
    const effectiveTTL = ttl ?? this.defaultTTL;

    // 기존 항목이 있으면 삭제 (순서 갱신을 위해)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 용량 초과 시 가장 오래된 항목 제거 (LRU)
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + effectiveTTL,
    });
  }

  /**
   * 캐시에서 항목 삭제
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 캐시에 키가 존재하는지 확인 (만료 무시)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // 만료된 항목은 false 반환
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 전체 캐시 초기화
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 현재 캐시 크기
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 만료된 항목 정리
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 리소스 정리 (타이머 중지)
   * 애플리케이션 종료 시 호출 권장
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }

  /**
   * 캐시 통계 정보
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * 모든 캐시 키 반환 (디버깅용)
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * 함수 결과를 캐시하는 래퍼
 *
 * @example
 * const cachedFetch = memoizeWithTTL(
 *   async (url: string) => fetch(url).then(r => r.json()),
 *   { maxSize: 50, defaultTTL: 10 * 60 * 1000 }
 * );
 */
export function memoizeWithTTL<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  options: LRUCacheOptions = {}
): (...args: Args) => Promise<R> {
  const cache = new LRUCache<string, R>(options);

  return async (...args: Args): Promise<R> => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * 비동기 함수용 캐시 (진행 중인 요청 공유)
 * 동일한 키에 대해 중복 요청을 방지
 */
export class AsyncCache<K, V> {
  private cache: LRUCache<K, V>;
  private pending: Map<K, Promise<V>>;

  constructor(options: LRUCacheOptions = {}) {
    this.cache = new LRUCache<K, V>(options);
    this.pending = new Map();
  }

  /**
   * 캐시에서 값을 가져오거나, 없으면 factory 함수 실행
   * 동시에 같은 키로 여러 요청이 오면 하나의 Promise를 공유
   */
  async getOrSet(key: K, factory: () => Promise<V>, ttl?: number): Promise<V> {
    // 캐시 확인
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // 진행 중인 요청 확인
    const pendingPromise = this.pending.get(key);
    if (pendingPromise) {
      return pendingPromise;
    }

    // 새 요청 시작
    const promise = factory()
      .then((value) => {
        this.cache.set(key, value, ttl);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, promise);
    return promise;
  }

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  set(key: K, value: V, ttl?: number): void {
    this.cache.set(key, value, ttl);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  destroy(): void {
    this.cache.destroy();
    this.pending.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
