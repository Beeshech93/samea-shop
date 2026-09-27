import { sql } from '../../_db.js';
import { requireAdmin } from '../../_admin.js';
import { MX_STATES, ensureLogisticsSchema, getSetting, publicZone, setSetting, validateZone } from '../../_logistics.js';

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureLogisticsSchema();

    if (req.method === 'GET') {
      const zones = await sql`SELECT * FROM shipping_zones ORDER BY price, id`;
      return res.status(200).json({ zones: zones.map(publicZone), states: MX_STATES, bankDetails: await getSetting('bank_details') });
    }

    // Datos bancarios para transferencias.
    if (req.method === 'PUT') {
      const bankDetails = typeof req.body?.bankDetails === 'string' ? req.body.bankDetails.trim().slice(0, 1000) : '';
      await setSetting('bank_details', bankDetails);
      return res.status(200).json({ bankDetails });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const { value: z, error } = validateZone(req.body);
      if (error) return res.status(400).json({ error });
      const id = req.method === 'PATCH' ? Number(req.body?.id) : null;

      // Un estado solo puede estar en una zona activa.
      if (z.active) {
        const others = await sql`SELECT name, states FROM shipping_zones WHERE active AND id IS DISTINCT FROM ${id}`;
        const clash = others.find((other) => other.states.some((state) => z.states.includes(state)));
        if (clash) {
          const repeated = clash.states.filter((state) => z.states.includes(state));
          return res.status(400).json({ error: `${repeated.slice(0, 3).join(', ')} ya está en «${clash.name}». Quítalo de allí primero.` });
        }
      }

      const rows = req.method === 'POST'
        ? await sql`
            INSERT INTO shipping_zones (name, states, price, free_from, days_min, days_max, active)
            VALUES (${z.name}, ${z.states}, ${z.price}, ${z.freeFrom}, ${z.daysMin}, ${z.daysMax}, ${z.active})
            RETURNING *`
        : await sql`
            UPDATE shipping_zones SET name = ${z.name}, states = ${z.states}, price = ${z.price}, free_from = ${z.freeFrom},
              days_min = ${z.daysMin}, days_max = ${z.daysMax}, active = ${z.active}
            WHERE id = ${id} RETURNING *`;
      if (!rows.length) return res.status(404).json({ error: 'Zona no encontrada.' });
      return res.status(req.method === 'POST' ? 201 : 200).json({ zone: publicZone(rows[0]) });
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM shipping_zones WHERE id = ${Number(req.body?.id)}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin shipping error', error);
    return res.status(500).json({ error: 'No se pudo guardar la configuración de envíos.' });
  }
}
