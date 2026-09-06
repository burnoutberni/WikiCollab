import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MEMORY_LOG_INTERVAL_MS_DEFAULT,
  MEMORY_LOG_INTERVAL_MS_ENV,
  MEMORY_LOG_INTERVAL_MS_MAX,
  startRuntimeMemoryLogging,
} from '../runtime-memory-logging.js';

describe('startRuntimeMemoryLogging', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env = { ...originalEnv };
    delete process.env.ENABLE_MEMORY_LOGGING;
    delete process.env[MEMORY_LOG_INTERVAL_MS_ENV];
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('does not start a timer unless explicitly enabled', () => {
    const logger = { info: vi.fn() };

    expect(startRuntimeMemoryLogging(logger)).toBeUndefined();

    vi.advanceTimersByTime(30_000);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs memory usage at the configured interval', () => {
    process.env.ENABLE_MEMORY_LOGGING = 'true';
    process.env[MEMORY_LOG_INTERVAL_MS_ENV] = '1000';
    const logger = { info: vi.fn() };
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 10 * 1024 * 1024,
      heapUsed: 5 * 1024 * 1024,
      heapTotal: 8 * 1024 * 1024,
      external: 2 * 1024 * 1024,
      arrayBuffers: 1024 * 1024,
    });

    const timer = startRuntimeMemoryLogging(logger);

    expect(timer).toBeDefined();
    vi.advanceTimersByTime(999);
    expect(logger.info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      {
        rssMb: 10,
        heapUsedMb: 5,
        heapTotalMb: 8,
        externalMb: 2,
        arrayBuffersMb: 1,
      },
      'Memory usage'
    );
  });

  it('falls back to the default interval when the configured interval is invalid', () => {
    process.env.ENABLE_MEMORY_LOGGING = 'true';
    process.env[MEMORY_LOG_INTERVAL_MS_ENV] = '-1';
    const logger = { info: vi.fn() };

    startRuntimeMemoryLogging(logger);

    vi.advanceTimersByTime(MEMORY_LOG_INTERVAL_MS_DEFAULT - 1);
    expect(logger.info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('accepts the maximum Node.js timer delay and rejects larger values', () => {
    process.env.ENABLE_MEMORY_LOGGING = 'true';
    const logger = { info: vi.fn() };

    process.env[MEMORY_LOG_INTERVAL_MS_ENV] = String(MEMORY_LOG_INTERVAL_MS_MAX);
    startRuntimeMemoryLogging(logger);

    vi.advanceTimersByTime(MEMORY_LOG_INTERVAL_MS_MAX - 1);
    expect(logger.info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(logger.info).toHaveBeenCalledTimes(1);

    vi.clearAllTimers();
    logger.info.mockClear();

    process.env[MEMORY_LOG_INTERVAL_MS_ENV] = String(MEMORY_LOG_INTERVAL_MS_MAX + 1);
    startRuntimeMemoryLogging(logger);

    vi.advanceTimersByTime(MEMORY_LOG_INTERVAL_MS_DEFAULT - 1);
    expect(logger.info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('does not keep the process alive for memory logging alone', () => {
    process.env.ENABLE_MEMORY_LOGGING = 'true';

    const timer = startRuntimeMemoryLogging({ info: vi.fn() });

    expect(timer?.hasRef()).toBe(false);
  });
});
