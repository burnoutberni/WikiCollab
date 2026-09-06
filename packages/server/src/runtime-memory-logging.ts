import { logger } from './logging.js';
import { envInt } from './utils/env.js';

type RuntimeMemoryLogger = Pick<typeof logger, 'info'>;

const BYTES_PER_MB = 1024 * 1024;
export const MEMORY_LOG_INTERVAL_MS_ENV = 'MEMORY_LOG_INTERVAL_MS';
export const MEMORY_LOG_INTERVAL_MS_DEFAULT = 30_000;
export const MEMORY_LOG_INTERVAL_MS_MAX = 2_147_483_647;

function bytesToMb(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MB);
}

export function startRuntimeMemoryLogging(
  log: RuntimeMemoryLogger = logger
): NodeJS.Timeout | undefined {
  if (process.env.ENABLE_MEMORY_LOGGING !== 'true') return undefined;

  const timer = setInterval(
    () => {
      const memory = process.memoryUsage();

      log.info(
        {
          rssMb: bytesToMb(memory.rss),
          heapUsedMb: bytesToMb(memory.heapUsed),
          heapTotalMb: bytesToMb(memory.heapTotal),
          externalMb: bytesToMb(memory.external),
          arrayBuffersMb: bytesToMb(memory.arrayBuffers),
        },
        'Memory usage'
      );
    },
    envInt(MEMORY_LOG_INTERVAL_MS_ENV, MEMORY_LOG_INTERVAL_MS_DEFAULT, MEMORY_LOG_INTERVAL_MS_MAX)
  );

  timer.unref();
  return timer;
}
