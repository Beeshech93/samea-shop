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
