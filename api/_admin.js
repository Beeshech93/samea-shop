import { ensureUsersSchema } from './_db.js';
import { getSessionUser } from './_auth.js';

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

// Las peticiones que modifican datos deben venir de la propia tienda.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Devuelve la administradora con sesión iniciada; si no hay, responde y devuelve null.
export async function requireAdmin(req, res) {
  if (req.method !== 'GET' && !sameOrigin(req)) {
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
