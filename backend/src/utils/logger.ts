import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Define custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} ${level}: ${stack || message}`;
});

// Configure the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // capture stack traces for errors
    logFormat
  ),
  transports: [
    // Console transport for general logs
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
    // File transport for error logs (optional)
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(timestamp(), logFormat),
    }),
    // File transport for all logs (optional)
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(timestamp(), logFormat),
    }),
  ],
});

export default logger;
