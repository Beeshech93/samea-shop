import { sql } from '../../api/_db.js';
import { requireAdmin } from '../../api/_admin.js';
import { adminPromotion, ensureCatalogSchema, validatePromotion } from '../../api/_catalog.js';

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureCatalogSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM promotions ORDER BY active DESC, created_at DESC`;
      return res.status(200).json({ promotions: rows.map(adminPromotion) });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const { value: p, error } = validatePromotion(req.body);
      if (error) return res.status(400).json({ error });

      try {
        if (req.method === 'POST') {
          const rows = await sql`
            INSERT INTO promotions (code, description, kind, value, min_subtotal, category, starts_at, ends_at, active)
            VALUES (${p.code}, ${p.description}, ${p.kind}, ${p.value}, ${p.minSubtotal}, ${p.category}, ${p.startsAt}, ${p.endsAt}, ${p.active})
            RETURNING *`;
          return res.status(201).json({ promotion: adminPromotion(rows[0]) });
        }

        const id = parseId(req.body?.id);
        if (!id) return res.status(400).json({ error: 'Datos inválidos.' });
        const rows = await sql`
          UPDATE promotions SET
            code = ${p.code}, description = ${p.description}, kind = ${p.kind}, value = ${p.value},
            min_subtotal = ${p.minSubtotal}, category = ${p.category},
            starts_at = ${p.startsAt}, ends_at = ${p.endsAt}, active = ${p.active}
          WHERE id = ${id}
          RETURNING *`;
        if (!rows.length) return res.status(404).json({ error: 'Promoción no encontrada.' });
        return res.status(200).json({ promotion: adminPromotion(rows[0]) });
      } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una promoción con ese código.' });
        throw error;
      }
    }

    if (req.method === 'DELETE') {
      const id = parseId(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Datos inválidos.' });
      await sql`DELETE FROM promotions WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin promotions error', error);
    return res.status(500).json({ error: 'No se pudo guardar la promoción.' });
  }
}
