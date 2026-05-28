import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve(__dirname, '../../server.log');

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: string, message: string, meta?: any) {
  const entry = `[${timestamp()}] [${level}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, entry);
  } catch {}
}

export const logger = {
  info: (message: string, meta?: any) => write('INFO', message, meta),
  warn: (message: string, meta?: any) => write('WARN', message, meta),
  error: (message: string, meta?: any) => write('ERROR', message, meta),
};
