import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
});

const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    new winston.transports.File({
      filename: `${process.env.LOG_DIR || './logs'}/error.log`,
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: `${process.env.LOG_DIR || './logs'}/combined.log`,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

/**
 * WinstonLogger
 * Wraps winston for use as NestJS LoggerService and standalone logger.
 */
export class WinstonLogger implements LoggerService {
  private static instance: WinstonLogger;

  static getInstance(): WinstonLogger {
    if (!WinstonLogger.instance) {
      WinstonLogger.instance = new WinstonLogger();
    }
    return WinstonLogger.instance;
  }

  static getNestLogger(): LoggerService {
    return WinstonLogger.getInstance();
  }

  log(message: string, context?: string) {
    winstonLogger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    winstonLogger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    winstonLogger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    winstonLogger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    winstonLogger.verbose(message, { context });
  }
}
