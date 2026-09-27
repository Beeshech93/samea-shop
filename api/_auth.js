import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { sql } from './_db.js';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
// Prefijo __Host-: el navegador solo la acepta con Secure, Path=/ y sin Domain.
const SESSION_COOKIE = '__Host-samea_session';
const LEGACY_COOKIE = 'samea_session';
const SESSION_DAYS = 30;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(key, expected);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function sessionCookie(value, maxAge, name = SESSION_COOKIE) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function sessionToken(req) {
  return readCookie(req, SESSION_COOKIE) || readCookie(req, LEGACY_COOKIE);
}

const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344',
  'password', 'password1', 'contraseña', 'contrasena', 'qwerty123', 'qwertyui', 'iloveyou', 'teamo123',
  'abc12345', 'abcd1234', 'samea123', 'lenceria', 'mexico123', 'admin123', 'welcome1', '1q2w3e4r',
]);

// Rechaza contraseñas cortas, muy comunes o iguales al correo.
export function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) return 'Esa contraseña es demasiado común. Elige otra más segura.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return 'La contraseña no debe contener tu correo.';
  return null;
}

export async function createSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  await sql`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  res.setHeader('Set-Cookie', [sessionCookie(token, SESSION_DAYS * 24 * 60 * 60), sessionCookie('', 0, LEGACY_COOKIE)]);
}

export async function getSessionUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.is_admin
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  return rows[0] || null;
}

export async function destroySession(req, res) {
  const token = sessionToken(req);
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  res.setHeader('Set-Cookie', [sessionCookie('', 0), sessionCookie('', 0, LEGACY_COOKIE)]);
}

const RESET_MINUTES = 60;

// Crea un enlace de recuperación de un solo uso; en la base solo queda su hash.
export async function createPasswordReset(userId) {
  const token = randomBytes(32).toString('base64url');
  await sql`DELETE FROM password_resets WHERE user_id = ${userId} OR expires_at < now()`;
  await sql`
    INSERT INTO password_resets (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, now() + make_interval(mins => ${RESET_MINUTES}))`;
  return token;
}

// Consume el token: devuelve el user_id si era válido y lo borra.
export async function consumePasswordReset(token) {
  const rows = await sql`
    DELETE FROM password_resets
    WHERE token_hash = ${hashToken(token)}
    RETURNING user_id, expires_at > now() AS valid`;
  return rows[0] && rows[0].valid ? rows[0].user_id : null;
}
