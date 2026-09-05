import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'wikicollab', version: process.env.APP_VERSION || '0.0.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
