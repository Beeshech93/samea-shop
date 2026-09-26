import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(value).digest();
}

// Comprueba la cabecera `Authorization: Bearer <ADMIN_TOKEN>`.
// Devuelve true si la petición puede continuar; si no, ya respondió.
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'Falta configurar ADMIN_TOKEN en Vercel.' });
    return false;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !timingSafeEqual(digest(token), digest(expected))) {
    res.status(401).json({ error: 'Clave de administración incorrecta.' });
    return false;
  }
  return true;
}
