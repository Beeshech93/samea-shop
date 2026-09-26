import { sql } from './_db.js';
import { CATEGORIES, ensureCatalogSchema, publicProduct } from './_catalog.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    await ensureCatalogSchema();
    const rows = await sql`SELECT * FROM products WHERE active ORDER BY created_at DESC, id DESC`;
    // Sin caché: los cambios del panel deben verse al instante en la tienda.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ products: rows.map(publicProduct), categories: CATEGORIES });
  } catch (error) {
    console.error('products error', error);
    return res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
  }
}
