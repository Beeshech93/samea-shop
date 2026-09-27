import { requireAdmin } from '../../_admin.js';
import { ensureLogisticsSchema } from '../../_logistics.js';
import { getPaymentSettings, savePaymentSettings } from '../../_payments.js';

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureLogisticsSchema();
    if (req.method === 'GET') return res.status(200).json(await getPaymentSettings());
    if (req.method === 'PUT') return res.status(200).json(await savePaymentSettings(req.body));
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin payments error', error);
    return res.status(500).json({ error: 'No se pudieron guardar los ajustes de pago.' });
  }
}
