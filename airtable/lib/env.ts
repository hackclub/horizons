import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Load backend/.env first, then let airtable/.env override.
dotenvConfig({ path: resolve(here, '../../backend/.env') });
dotenvConfig({ path: resolve(here, '../.env'), override: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

export const AIRTABLE_API_KEY = requireEnv('YSWS_AIRTABLE_API_KEY');
export const YSWS_BASE_ID = requireEnv('YSWS_BASE_ID');
export const APPROVED_PROJECTS_TABLE_ID = requireEnv(
  'YSWS_APPROVED_PROJECTS_TABLE_ID',
);
export const MANIFEST_BASE_URL = (process.env.MANIFEST_BASE_URL || '').replace(
  /\/$/,
  '',
);
export const MANIFEST_YSWS_ID = process.env.MANIFEST_YSWS_ID || '';
