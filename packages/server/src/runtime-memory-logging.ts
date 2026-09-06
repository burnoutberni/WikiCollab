import { logger } from './logging.js';
import { envInt } from './utils/env.js';

type RuntimeMemoryLogger = Pick<typeof logger, 'info'>;

const BYTES_PER_MB = 1024 * 1024;

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
    envInt('MEMORY_LOG_INTERVAL_MS', 30_000)
  );

  timer.unref();
  return timer;
}
