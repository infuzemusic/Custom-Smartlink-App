import postgres from 'postgres';

/**
 * Lazily connected Postgres client.
 *
 * The connection is opened on first query rather than at import time, so `next build`
 * (and anything else that merely imports a module) doesn't require DATABASE_URL.
 */
let client: postgres.Sql | undefined;

function getClient(): postgres.Sql {
  const g = globalThis as unknown as { __sql?: postgres.Sql };
  if (g.__sql) return g.__sql;
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    client = postgres(url, { max: 5, idle_timeout: 20 });
    if (process.env.NODE_ENV !== 'production') g.__sql = client;
  }
  return client;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getClient() as any)(...args);
  },
  get(_target, prop) {
    return (getClient() as any)[prop];
  },
});
