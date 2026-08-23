import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWebSocket, type NeonTransaction } from 'drizzle-orm/neon-serverless';
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations';
import * as schema from '@/db/schema';

export type DatabaseTransaction = NeonTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return url;
}

export function getDb() {
  const sql = neon(databaseUrl());
  return drizzleHttp({ client: sql, schema });
}

export async function withTransaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  if (typeof globalThis.WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = globalThis.WebSocket;
  }
  const pool = new Pool({ connectionString: databaseUrl() });
  const db = drizzleWebSocket({ client: pool, schema });
  try {
    return await db.transaction(callback, { isolationLevel: 'serializable' });
  } finally {
    await pool.end();
  }
}
