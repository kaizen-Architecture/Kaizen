import path from 'path';
import pino from 'pino';
import fs from 'fs';

const getLogDir = () => {
  if (typeof process !== 'undefined') {
    if (process.env.KAIZEN_LOG_PATH) return process.env.KAIZEN_LOG_PATH;
    if (process.env.KAIZOKU_LOG_PATH) return process.env.KAIZOKU_LOG_PATH;
  }
  if (fs.existsSync('/logs')) return '/logs';
  return '';
};

const levelMap: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

let fileStream: any = null;
try {
  const logDir = getLogDir();
  const logFile = path.resolve(logDir || process.cwd(), 'kaizen.log');
  fileStream = fs.createWriteStream(logFile, { flags: 'a' });
  fileStream.on('error', (err: any) => {
    console.error(`[Logger Error] Failed to write to ${logFile}:`, err.message);
    fileStream = null;
  });
} catch (err) {
  console.error('[Logger Error] Failed to initialize log file stream:', err);
}

const customStream = {
  write(msg: string) {
    if (fileStream) {
      fileStream.write(msg);
    }
    try {
      const obj = JSON.parse(msg);
      const time = obj.time ? new Date(obj.time).toLocaleTimeString() : new Date().toLocaleTimeString();
      const level = obj.level ? levelMap[obj.level] || 'info' : 'info';
      process.stdout.write(`[${time}] ${level.toUpperCase()}: ${obj.msg}\n`);
    } catch {
      process.stdout.write(msg);
    }
  },
};

export const logger = pino(
  {
    level: 'debug',
  },
  customStream,
);
