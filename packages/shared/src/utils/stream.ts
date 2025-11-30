/**
 * 스트림 처리 유틸리티
 *
 * 파일 스트림, HTTP 스트림 등의 안전한 정리를 위한 유틸리티
 */

import type { Readable, Writable } from 'stream';
import type { WriteStream } from 'fs';

/**
 * 스트림 정리 옵션
 */
export interface StreamCleanupOptions {
  /** 에러 발생 시 로깅 여부 (기본: true) */
  logErrors?: boolean;
  /** 정리할 파일 경로 (제공 시 파일 삭제 시도) */
  filePath?: string;
  /** 파일 삭제 함수 (기본: fs.unlink) */
  unlinkFn?: (path: string) => Promise<void>;
}

/**
 * 스트림 안전하게 정리 (destroy)
 *
 * 이미 닫힌 스트림이나 에러 상황에서도 안전하게 처리
 */
export async function destroyStream(
  stream: Readable | Writable | WriteStream | null | undefined,
  options: { logErrors?: boolean } = {}
): Promise<void> {
  const { logErrors = false } = options;

  if (!stream) return;

  try {
    // 이미 닫힌 스트림인지 확인
    const s = stream as { destroyed?: boolean; closed?: boolean };
    if (s.destroyed || s.closed) {
      return;
    }

    // destroy 메서드 호출
    if ('destroy' in stream && typeof stream.destroy === 'function') {
      stream.destroy();
    }
  } catch (error: unknown) {
    if (logErrors) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Stream destroy error:', message);
    }
    // 에러 무시 - 이미 닫힌 스트림 등
  }
}

/**
 * 여러 스트림을 한번에 정리
 */
export async function destroyStreams(
  streams: Array<Readable | Writable | WriteStream | null | undefined>,
  options: { logErrors?: boolean } = {}
): Promise<void> {
  await Promise.all(
    streams.map((stream) => destroyStream(stream, options))
  );
}

/**
 * 스트림과 파일을 함께 정리
 *
 * 다운로드 실패 등의 상황에서 부분 파일 정리에 유용
 */
export async function cleanupStreamAndFile(
  readStream: Readable | null | undefined,
  writeStream: Writable | WriteStream | null | undefined,
  filePath?: string,
  options: StreamCleanupOptions = {}
): Promise<{ errors: Error[] }> {
  const { logErrors = true, unlinkFn } = options;
  const errors: Error[] = [];

  // 스트림 정리
  try {
    await destroyStream(readStream, { logErrors });
  } catch (error: unknown) {
    if (error instanceof Error) errors.push(error);
  }

  try {
    await destroyStream(writeStream, { logErrors });
  } catch (error: unknown) {
    if (error instanceof Error) errors.push(error);
  }

  // 파일 정리
  if (filePath && unlinkFn) {
    try {
      await unlinkFn(filePath);
    } catch (error: unknown) {
      // ENOENT는 무시 (파일이 이미 없음)
      const isNotFound =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'ENOENT';

      if (!isNotFound) {
        if (error instanceof Error) errors.push(error);
        if (logErrors) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('File cleanup error:', message);
        }
      }
    }
  }

  return { errors };
}

/**
 * 스트림 종료 대기
 *
 * 스트림이 완전히 종료될 때까지 대기
 */
export function waitForStreamEnd(
  stream: Readable | Writable,
  timeout = 30000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      resolved = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      stream.removeListener('end', onEnd);
      stream.removeListener('finish', onFinish);
      stream.removeListener('close', onClose);
      stream.removeListener('error', onError);
    };

    const onEnd = () => {
      if (!resolved) {
        cleanup();
        resolve();
      }
    };

    const onFinish = () => {
      if (!resolved) {
        cleanup();
        resolve();
      }
    };

    const onClose = () => {
      if (!resolved) {
        cleanup();
        resolve();
      }
    };

    const onError = (error: Error) => {
      if (!resolved) {
        cleanup();
        reject(error);
      }
    };

    // 이미 종료된 경우
    const s = stream as { destroyed?: boolean; closed?: boolean; readableEnded?: boolean; writableEnded?: boolean };
    if (s.destroyed || s.closed || s.readableEnded || s.writableEnded) {
      resolve();
      return;
    }

    stream.on('end', onEnd);
    stream.on('finish', onFinish);
    stream.on('close', onClose);
    stream.on('error', onError);

    // 타임아웃 설정
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new Error(`Stream did not end within ${timeout}ms`));
        }
      }, timeout);
    }
  });
}

/**
 * Readable 스트림을 Buffer로 변환
 */
export function streamToBuffer(stream: Readable, maxSize = 100 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    stream.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        stream.destroy();
        reject(new Error(`Stream exceeded maximum size of ${maxSize} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', reject);
  });
}

/**
 * Readable 스트림을 문자열로 변환
 */
export async function streamToString(
  stream: Readable,
  encoding: BufferEncoding = 'utf8',
  maxSize = 10 * 1024 * 1024
): Promise<string> {
  const buffer = await streamToBuffer(stream, maxSize);
  return buffer.toString(encoding);
}

/**
 * 파이프 에러 핸들링이 포함된 스트림 파이프
 */
export function pipeWithErrorHandling<T extends Writable>(
  source: Readable,
  destination: T,
  onError?: (error: Error, source: 'source' | 'destination') => void
): T {
  source.on('error', (error) => {
    destination.destroy();
    onError?.(error, 'source');
  });

  destination.on('error', (error) => {
    source.destroy();
    onError?.(error, 'destination');
  });

  return source.pipe(destination);
}
