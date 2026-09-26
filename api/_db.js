import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);

// Crea la tabla y añade las columnas nuevas sobre la tabla original
// `comments (comment TEXT)` sin perder filas existentes.
let schemaReady;
export function ensureSchema() {
  schemaReady ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS comments (comment TEXT)`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS name TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS product_id INT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

let usersReady;
export function ensureUsersSchema() {
  usersReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      )`;
  })().catch((error) => {
    usersReady = undefined;
    throw error;
  });
  return usersReady;
}
