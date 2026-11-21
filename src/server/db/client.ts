import { PrismaClient } from '@prisma/client';
import fs from 'fs';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var, vars-on-top
  var prisma: PrismaClient | undefined;
}

const getDatabaseUrl = () => {
  const configPath = '/config/database.json';
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.connectionString) {
        let url = config.connectionString;
        try {
          const urlObj = new URL(url);
          if (config.connectionLimit) {
            urlObj.searchParams.set('connection_limit', String(config.connectionLimit));
          }
          if (config.poolTimeout) {
            urlObj.searchParams.set('pool_timeout', String(config.poolTimeout));
          }
          return urlObj.toString();
        } catch (err) {
          // If connectionString is a simple relative path or not a standard URL, append query manually
          let query = '';
          if (config.connectionLimit) {
            query += `connection_limit=${config.connectionLimit}`;
          }
          if (config.poolTimeout) {
            query += `${query ? '&' : ''}pool_timeout=${config.poolTimeout}`;
          }
          if (query) {
            url += (url.includes('?') ? '&' : '?') + query;
          }
          return url;
        }
      }
    } catch (e) {
      console.error('Failed to parse database.json config:', e);
    }
  }
  return process.env.DATABASE_URL;
};

const ensurePoolParams = (rawUrl?: string): string | undefined => {
  if (!rawUrl) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', '25');
    }
    if (!u.searchParams.has('pool_timeout')) {
      u.searchParams.set('pool_timeout', '30');
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
};

const dbUrl = ensurePoolParams(getDatabaseUrl());

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'],
    datasources: dbUrl
      ? {
          db: {
            url: dbUrl,
          },
        }
      : undefined,
  });

global.prisma = prisma;
