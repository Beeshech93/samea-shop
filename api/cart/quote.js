import { ensureCatalogSchema, quoteCart } from '../_catalog.js';
import { guardWrite } from '../_security.js';

// Calcula subtotal, descuento y total con los precios de la base de datos.
export default async function handler(req, res) {
  if (!guardWrite(req, res)) return undefined;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    await ensureCatalogSchema();
    const quote = await quoteCart(req.body?.items, req.body?.code);
    return res.status(quote.error && !quote.lines ? 400 : 200).json(quote);
  } catch (error) {
    console.error('quote error', error);
    return res.status(500).json({ error: 'No se pudo calcular el total.' });
  }
}
