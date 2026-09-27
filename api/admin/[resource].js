// Una sola función para todas las rutas /api/admin/* (límite de funciones de Vercel).
import comments from '../_lib/admin/comments.js';
import users from '../_lib/admin/users.js';
import products from '../_lib/admin/products.js';
import promotions from '../_lib/admin/promotions.js';
import subscribers from '../_lib/admin/subscribers.js';
import orders from '../_lib/admin/orders.js';
import shipping from '../_lib/admin/shipping.js';

const routes = { comments, users, products, promotions, subscribers, orders, shipping };

export default function handler(req, res) {
  const route = Object.hasOwn(routes, req.query.resource) ? routes[req.query.resource] : null;
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada.' });
  return route(req, res);
}
