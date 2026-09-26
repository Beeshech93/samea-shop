import { sql } from './_db.js';

// IP del cliente según las cabeceras que añade Vercel.
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || 'desconocida');
}

// Devuelve true si alguna de las reglas { key, limit, minutes } ya se superó.
export async function isLimited(rules) {
  for (const { key, limit, minutes } of rules) {
    const rows = await sql`
      SELECT count(*)::int AS total
      FROM auth_attempts
      WHERE key = ${key} AND created_at > now() - make_interval(mins => ${minutes})`;
    if (rows[0].total >= limit) return true;
  }
  return false;
}

export async function recordAttempt(...keys) {
  for (const key of keys) {
    await sql`INSERT INTO auth_attempts (key) VALUES (${key})`;
  }
  await sql`DELETE FROM auth_attempts WHERE created_at < now() - interval '1 day'`;
}

export async function clearAttempts(key) {
  await sql`DELETE FROM auth_attempts WHERE key = ${key}`;
}

export function tooMany(res, minutes) {
  res.setHeader('Retry-After', String(minutes * 60));
  return res.status(429).json({ error: `Demasiados intentos. Vuelve a intentarlo en ${minutes} minutos.` });
}
