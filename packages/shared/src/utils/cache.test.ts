import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache, AsyncCache, memoizeWithTTL } from './cache.js';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 0 });
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 0 });
      expect(cache.get('missing')).toBeUndefined();
    });

    it('should check if key exists', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 0 });
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should delete values', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 0 });
      cache.set('a', 1);
      expect(cache.delete('a')).toBe(true);
      expect(cache.get('a')).toBeUndefined();
    });

    it('should clear all values', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 0 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should return keys', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 0 });
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.keys()).toEqual(['a', 'b']);
    });

    it('should return stats', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 0 });
      cache.set('a', 1);
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(10);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when maxSize is reached', () => {
      const cache = new LRUCache<string, number>({ maxSize: 2, cleanupInterval: 0 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // Should evict 'a'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('should update LRU order on get', () => {
      const cache = new LRUCache<string, number>({ maxSize: 2, cleanupInterval: 0 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // Access 'a' to make it recently used
      cache.set('c', 3); // Should evict 'b' instead of 'a'

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
    });
  });

  describe('TTL expiration', () => {
    it('should expire items after TTL', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });
      cache.set('a', 1);

      expect(cache.get('a')).toBe(1);

      vi.advanceTimersByTime(1001);

      expect(cache.get('a')).toBeUndefined();
    });

    it('should not expire items before TTL', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });
      cache.set('a', 1);

      vi.advanceTimersByTime(500);

      expect(cache.get('a')).toBe(1);
    });

    it('should allow custom TTL per item', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });
      cache.set('a', 1, 500);

      expect(cache.get('a')).toBe(1);

      vi.advanceTimersByTime(501);

      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should remove expired items on cleanup', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });
      cache.set('a', 1);
      cache.set('b', 2);

      vi.advanceTimersByTime(1001);

      cache.cleanup();
      expect(cache.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should clear cache and stop timer', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, cleanupInterval: 1000 });
      cache.set('a', 1);
      cache.destroy();
      expect(cache.size).toBe(0);
    });
  });
});

describe('AsyncCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should cache async function results with getOrSet', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const cache = new AsyncCache<string, string>({ maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });

    const result1 = await cache.getOrSet('key', fn);
    const result2 = await cache.getOrSet('key', fn);

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call function for different keys', async () => {
    const fn1 = vi.fn().mockResolvedValue('result1');
    const fn2 = vi.fn().mockResolvedValue('result2');
    const cache = new AsyncCache<string, string>({ maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });

    const result1 = await cache.getOrSet('key1', fn1);
    const result2 = await cache.getOrSet('key2', fn2);

    expect(result1).toBe('result1');
    expect(result2).toBe('result2');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('should share pending promises for same key', async () => {
    let resolvePromise: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    const fn = vi.fn().mockReturnValue(promise);
    const cache = new AsyncCache<string, string>({ maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });

    const promise1 = cache.getOrSet('key', fn);
    const promise2 = cache.getOrSet('key', fn);

    // Both should return the same promise
    expect(fn).toHaveBeenCalledTimes(1);

    resolvePromise!('result');
    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe('result');
    expect(result2).toBe('result');
  });

  it('should support get/set operations', () => {
    const cache = new AsyncCache<string, string>({ maxSize: 10, cleanupInterval: 0 });

    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('should support delete operation', () => {
    const cache = new AsyncCache<string, string>({ maxSize: 10, cleanupInterval: 0 });

    cache.set('key', 'value');
    expect(cache.delete('key')).toBe(true);
    expect(cache.get('key')).toBeUndefined();
  });

  it('should support clear operation', () => {
    const cache = new AsyncCache<string, string>({ maxSize: 10, cleanupInterval: 0 });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should support destroy operation', () => {
    const cache = new AsyncCache<string, string>({ maxSize: 10, cleanupInterval: 0 });

    cache.set('key', 'value');
    cache.destroy();
    expect(cache.size).toBe(0);
  });
});

describe('memoizeWithTTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should memoize function calls', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const memoized = memoizeWithTTL(fn, { maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });

    const result1 = await memoized('arg');
    const result2 = await memoized('arg');

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should cache based on serialized arguments', async () => {
    const fn = vi.fn().mockImplementation((a, b) => Promise.resolve(a + b));
    const memoized = memoizeWithTTL(fn, { maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });

    const result1 = await memoized(1, 2);
    const result2 = await memoized(1, 2);
    const result3 = await memoized(2, 1);

    expect(result1).toBe(3);
    expect(result2).toBe(3);
    expect(result3).toBe(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should expire cache after TTL', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce('result1')
      .mockResolvedValueOnce('result2');
    const memoized = memoizeWithTTL(fn, { maxSize: 10, defaultTTL: 1000, cleanupInterval: 0 });

    const result1 = await memoized('arg');
    expect(result1).toBe('result1');

    vi.advanceTimersByTime(1001);

    const result2 = await memoized('arg');
    expect(result2).toBe('result2');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
