// Una sola función para todas las rutas /api/admin/* (límite de funciones de Vercel).
import comments from '../../lib/admin/comments.js';
import users from '../../lib/admin/users.js';
import products from '../../lib/admin/products.js';
import promotions from '../../lib/admin/promotions.js';

const routes = { comments, users, products, promotions };

export default function handler(req, res) {
  const route = Object.hasOwn(routes, req.query.resource) ? routes[req.query.resource] : null;
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada.' });
  return route(req, res);
}
