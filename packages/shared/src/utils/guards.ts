/**
 * 타입 가드 함수 모음
 *
 * 런타임에서 안전한 타입 체크를 위한 유틸리티
 */

import type { AxiosError as AxiosErrorType } from 'axios';

/**
 * Axios 에러 타입 가드
 */
export function isAxiosError(error: unknown): error is AxiosErrorType {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, unknown>;

  return (
    'isAxiosError' in err &&
    err.isAxiosError === true
  );
}

/**
 * Node.js 시스템 에러 타입 가드 (ENOENT, EACCES 등)
 */
export interface NodeSystemError extends Error {
  code: string;
  errno?: number;
  syscall?: string;
  path?: string;
}

export function isNodeSystemError(error: unknown): error is NodeSystemError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, unknown>;

  return (
    err instanceof Error &&
    typeof err.code === 'string'
  );
}

/**
 * 특정 에러 코드를 가진 Node.js 에러 확인
 */
export function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return isNodeSystemError(error) && error.code === code;
}

/**
 * 파일 없음 에러 (ENOENT)
 */
export function isFileNotFoundError(error: unknown): boolean {
  return isNodeErrorWithCode(error, 'ENOENT');
}

/**
 * 권한 없음 에러 (EACCES)
 */
export function isPermissionError(error: unknown): boolean {
  return isNodeErrorWithCode(error, 'EACCES');
}

/**
 * 파일 이미 존재 에러 (EEXIST)
 */
export function isFileExistsError(error: unknown): boolean {
  return isNodeErrorWithCode(error, 'EEXIST');
}

/**
 * 연결 거부 에러 (ECONNREFUSED)
 */
export function isConnectionRefusedError(error: unknown): boolean {
  return isNodeErrorWithCode(error, 'ECONNREFUSED');
}

/**
 * 타임아웃 에러 (ETIMEDOUT)
 */
export function isTimeoutError(error: unknown): boolean {
  return isNodeErrorWithCode(error, 'ETIMEDOUT');
}

/**
 * 네트워크 관련 에러인지 확인 (Axios/Node 에러용)
 */
export function isNetworkRelatedError(error: unknown): boolean {
  if (isAxiosError(error)) {
    return (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ERR_NETWORK' ||
      !error.response
    );
  }

  if (isNodeSystemError(error)) {
    const networkCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'];
    return networkCodes.includes(error.code);
  }

  return false;
}

/**
 * HTTP 상태 코드별 에러 확인 (Axios 에러용)
 */
export function isHttpStatusError(error: unknown, statusCode?: number): boolean {
  if (!isAxiosError(error) || !error.response) {
    return false;
  }

  if (statusCode === undefined) {
    return error.response.status >= 400;
  }

  return error.response.status === statusCode;
}

/**
 * 4xx 클라이언트 에러
 */
export function isClientError(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) {
    return false;
  }
  return error.response.status >= 400 && error.response.status < 500;
}

/**
 * 5xx 서버 에러
 */
export function isServerError(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) {
    return false;
  }
  return error.response.status >= 500;
}

/**
 * 재시도 가능한 에러인지 확인
 */
export function isRetryableError(error: unknown): boolean {
  // 네트워크 에러는 재시도 가능
  if (isNetworkRelatedError(error)) {
    return true;
  }

  // 서버 에러 (5xx)는 재시도 가능
  if (isServerError(error)) {
    return true;
  }

  // 429 Too Many Requests는 재시도 가능
  if (isHttpStatusError(error, 429)) {
    return true;
  }

  // 408 Request Timeout은 재시도 가능
  if (isHttpStatusError(error, 408)) {
    return true;
  }

  return false;
}

/**
 * Error 인스턴스 타입 가드
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Error 메시지 안전하게 추출
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error';
}

/**
 * Error 스택 안전하게 추출
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * 문자열 타입 가드
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * 숫자 타입 가드 (NaN 제외)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * 정수 타입 가드
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * 양수 정수 타입 가드
 */
export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

/**
 * 배열 타입 가드
 */
export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * 비어있지 않은 배열 타입 가드
 */
export function isNonEmptyArray<T>(value: unknown): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * 객체 타입 가드 (null, 배열 제외)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * null 또는 undefined 체크
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * 비어있지 않은 문자열 타입 가드
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Promise 타입 가드
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    value instanceof Promise ||
    (isObject(value) &&
      typeof (value as { then?: unknown }).then === 'function')
  );
}

/**
 * 함수 타입 가드
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}
