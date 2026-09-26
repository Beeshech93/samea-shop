import { ensureUsersSchema } from '../../api/_db.js';
import { getSessionUser } from '../../api/_auth.js';
import { isAdminUser } from '../../api/_admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await ensureUsersSchema();
    const user = await getSessionUser(req);
    return res.status(200).json({
      user: user ? { name: user.name, email: user.email, isAdmin: isAdminUser(user) } : null,
    });
  } catch (error) {
    console.error('me error', error);
    return res.status(500).json({ error: 'No se pudo comprobar la sesión.' });
  }
}
