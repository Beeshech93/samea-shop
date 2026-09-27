import { ensureUsersSchema } from './_db.js';
import { getSessionUser } from './_auth.js';
import { isSameOrigin } from './_security.js';

// Correos con acceso de administradora fijado desde Vercel (ADMIN_EMAILS,
// separados por comas). Sirve para crear la primera administradora; el
// resto se gestiona desde el panel con la columna users.is_admin.
export function envAdminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user) {
  return Boolean(user && (user.is_admin || envAdminEmails().includes(user.email)));
}

// Devuelve la administradora con sesión iniciada; si no hay, responde y devuelve null.
export async function requireAdmin(req, res) {
  if (req.method !== 'GET' && !isSameOrigin(req)) {
    res.status(403).json({ error: 'Origen no permitido.' });
    return null;
  }
  await ensureUsersSchema();
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Inicia sesión para continuar.' });
    return null;
  }
  if (!isAdminUser(user)) {
    res.status(403).json({ error: 'Esta cuenta no tiene permisos de administración.' });
    return null;
  }
  return user;
}
