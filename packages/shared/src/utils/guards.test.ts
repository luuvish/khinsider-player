import { describe, it, expect } from 'vitest';
import {
  isAxiosError,
  isNodeSystemError,
  isNodeErrorWithCode,
  isFileNotFoundError,
  isPermissionError,
  isFileExistsError,
  isConnectionRefusedError,
  isTimeoutError,
  isNetworkRelatedError,
  isHttpStatusError,
  isClientError,
  isServerError,
  isRetryableError,
  isError,
  getErrorMessage,
  getErrorStack,
  isString,
  isNumber,
  isInteger,
  isPositiveInteger,
  isArray,
  isNonEmptyArray,
  isObject,
  isNullish,
  isNonEmptyString,
  isPromise,
  isFunction,
} from './guards.js';

describe('Error Type Guards', () => {
  describe('isAxiosError', () => {
    it('should return true for axios errors', () => {
      const error = { isAxiosError: true, message: 'test' };
      expect(isAxiosError(error)).toBe(true);
    });

    it('should return false for non-axios errors', () => {
      expect(isAxiosError(new Error('test'))).toBe(false);
      expect(isAxiosError(null)).toBe(false);
      expect(isAxiosError(undefined)).toBe(false);
      expect(isAxiosError({ isAxiosError: false })).toBe(false);
    });
  });

  describe('isNodeSystemError', () => {
    it('should return true for node system errors', () => {
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      expect(isNodeSystemError(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      expect(isNodeSystemError(new Error('test'))).toBe(false);
      expect(isNodeSystemError(null)).toBe(false);
    });
  });

  describe('isNodeErrorWithCode', () => {
    it('should return true for matching error codes', () => {
      const error = Object.assign(new Error('test'), { code: 'ENOENT' });
      expect(isNodeErrorWithCode(error, 'ENOENT')).toBe(true);
    });

    it('should return false for non-matching codes', () => {
      const error = Object.assign(new Error('test'), { code: 'EACCES' });
      expect(isNodeErrorWithCode(error, 'ENOENT')).toBe(false);
    });
  });

  describe('specific error code checks', () => {
    it('isFileNotFoundError should detect ENOENT', () => {
      const error = Object.assign(new Error('test'), { code: 'ENOENT' });
      expect(isFileNotFoundError(error)).toBe(true);
    });

    it('isPermissionError should detect EACCES', () => {
      const error = Object.assign(new Error('test'), { code: 'EACCES' });
      expect(isPermissionError(error)).toBe(true);
    });

    it('isFileExistsError should detect EEXIST', () => {
      const error = Object.assign(new Error('test'), { code: 'EEXIST' });
      expect(isFileExistsError(error)).toBe(true);
    });

    it('isConnectionRefusedError should detect ECONNREFUSED', () => {
      const error = Object.assign(new Error('test'), { code: 'ECONNREFUSED' });
      expect(isConnectionRefusedError(error)).toBe(true);
    });

    it('isTimeoutError should detect ETIMEDOUT', () => {
      const error = Object.assign(new Error('test'), { code: 'ETIMEDOUT' });
      expect(isTimeoutError(error)).toBe(true);
    });
  });

  describe('isNetworkRelatedError', () => {
    it('should detect axios network errors', () => {
      const axiosError = { isAxiosError: true, code: 'ECONNREFUSED' };
      expect(isNetworkRelatedError(axiosError)).toBe(true);
    });

    it('should detect axios errors without response', () => {
      const axiosError = { isAxiosError: true };
      expect(isNetworkRelatedError(axiosError)).toBe(true);
    });

    it('should detect node network errors', () => {
      const error = Object.assign(new Error('test'), { code: 'ENOTFOUND' });
      expect(isNetworkRelatedError(error)).toBe(true);
    });
  });

  describe('HTTP status checks', () => {
    it('isHttpStatusError should check status code', () => {
      const error = { isAxiosError: true, response: { status: 404 } };
      expect(isHttpStatusError(error, 404)).toBe(true);
      expect(isHttpStatusError(error, 500)).toBe(false);
      expect(isHttpStatusError(error)).toBe(true); // Any 4xx/5xx
    });

    it('isClientError should detect 4xx errors', () => {
      const error = { isAxiosError: true, response: { status: 404 } };
      expect(isClientError(error)).toBe(true);
    });

    it('isServerError should detect 5xx errors', () => {
      const error = { isAxiosError: true, response: { status: 500 } };
      expect(isServerError(error)).toBe(true);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for network errors', () => {
      const error = Object.assign(new Error('test'), { code: 'ETIMEDOUT' });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 5xx errors', () => {
      const error = { isAxiosError: true, response: { status: 503 } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 429 errors', () => {
      const error = { isAxiosError: true, response: { status: 429 } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for 4xx errors (except 429, 408)', () => {
      const error = { isAxiosError: true, response: { status: 404 } };
      expect(isRetryableError(error)).toBe(false);
    });
  });
});

describe('Error Utilities', () => {
  describe('isError', () => {
    it('should return true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
    });

    it('should return false for non-errors', () => {
      expect(isError('error')).toBe(false);
      expect(isError({ message: 'test' })).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      expect(getErrorMessage(new Error('test message'))).toBe('test message');
    });

    it('should return string as is', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    it('should extract message from object with message property', () => {
      expect(getErrorMessage({ message: 'object message' })).toBe('object message');
    });

    it('should return default for unknown types', () => {
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(123)).toBe('Unknown error');
    });
  });

  describe('getErrorStack', () => {
    it('should return stack from Error', () => {
      const error = new Error('test');
      expect(getErrorStack(error)).toBeDefined();
    });

    it('should return undefined for non-errors', () => {
      expect(getErrorStack('not an error')).toBeUndefined();
    });
  });
});

describe('Primitive Type Guards', () => {
  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-1.5)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });
  });

  describe('isInteger', () => {
    it('should return true for integers', () => {
      expect(isInteger(123)).toBe(true);
      expect(isInteger(0)).toBe(true);
      expect(isInteger(-5)).toBe(true);
    });

    it('should return false for floats', () => {
      expect(isInteger(1.5)).toBe(false);
    });
  });

  describe('isPositiveInteger', () => {
    it('should return true for positive integers', () => {
      expect(isPositiveInteger(1)).toBe(true);
      expect(isPositiveInteger(100)).toBe(true);
    });

    it('should return false for zero and negatives', () => {
      expect(isPositiveInteger(0)).toBe(false);
      expect(isPositiveInteger(-1)).toBe(false);
    });
  });
});

describe('Collection Type Guards', () => {
  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray('string')).toBe(false);
      expect(isArray({ length: 0 })).toBe(false);
    });
  });

  describe('isNonEmptyArray', () => {
    it('should return true for non-empty arrays', () => {
      expect(isNonEmptyArray([1])).toBe(true);
      expect(isNonEmptyArray([1, 2, 3])).toBe(true);
    });

    it('should return false for empty arrays', () => {
      expect(isNonEmptyArray([])).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it('should return false for null and arrays', () => {
      expect(isObject(null)).toBe(false);
      expect(isObject([])).toBe(false);
    });
  });

  describe('isNullish', () => {
    it('should return true for null and undefined', () => {
      expect(isNullish(null)).toBe(true);
      expect(isNullish(undefined)).toBe(true);
    });

    it('should return false for other values', () => {
      expect(isNullish(0)).toBe(false);
      expect(isNullish('')).toBe(false);
      expect(isNullish(false)).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString(' a ')).toBe(true);
    });

    it('should return false for empty or whitespace strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
    });
  });

  describe('isPromise', () => {
    it('should return true for promises', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
    });

    it('should return true for thenable objects', () => {
      expect(isPromise({ then: () => {} })).toBe(true);
    });

    it('should return false for non-promises', () => {
      expect(isPromise({})).toBe(false);
      expect(isPromise(null)).toBe(false);
    });
  });

  describe('isFunction', () => {
    it('should return true for functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function() {})).toBe(true);
      expect(isFunction(class {})).toBe(true);
    });

    it('should return false for non-functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction('function')).toBe(false);
    });
  });
});
