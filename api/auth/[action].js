// Una sola función para todas las rutas /api/auth/* (límite de funciones de Vercel).
import login from '../../lib/auth/login.js';
import logout from '../../lib/auth/logout.js';
import me from '../../lib/auth/me.js';
import register from '../../lib/auth/register.js';
import forgot from '../../lib/auth/forgot.js';
import reset from '../../lib/auth/reset.js';

const routes = { login, logout, me, register, forgot, reset };

export default function handler(req, res) {
  const route = Object.hasOwn(routes, req.query.action) ? routes[req.query.action] : null;
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada.' });
  return route(req, res);
}
