import { sql } from '../_db.js';
import { requireAdmin } from '../_admin.js';
import { adminProduct, ensureCatalogSchema, validateProduct } from '../_catalog.js';

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureCatalogSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM products ORDER BY created_at DESC, id DESC`;
      return res.status(200).json({ products: rows.map(adminProduct) });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const { value: p, error } = validateProduct(req.body);
      if (error) return res.status(400).json({ error });

      if (req.method === 'POST') {
        const rows = await sql`
          INSERT INTO products (name, description, category, price, discount_percent, sizes, stock, image_url, badge, active)
          VALUES (${p.name}, ${p.description}, ${p.category}, ${p.price}, ${p.discountPercent}, ${p.sizes}, ${p.stock}, ${p.imageUrl}, ${p.badge}, ${p.active})
          RETURNING *`;
        return res.status(201).json({ product: adminProduct(rows[0]) });
      }

      const id = parseId(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Datos inválidos.' });
      const rows = await sql`
        UPDATE products SET
          name = ${p.name}, description = ${p.description}, category = ${p.category},
          price = ${p.price}, discount_percent = ${p.discountPercent}, sizes = ${p.sizes},
          stock = ${p.stock}, image_url = ${p.imageUrl}, badge = ${p.badge}, active = ${p.active},
          updated_at = now()
        WHERE id = ${id}
        RETURNING *`;
      if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
      return res.status(200).json({ product: adminProduct(rows[0]) });
    }

    if (req.method === 'DELETE') {
      const id = parseId(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Datos inválidos.' });
      await sql`DELETE FROM products WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin products error', error);
    return res.status(500).json({ error: 'No se pudo guardar el producto.' });
  }
}
