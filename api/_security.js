// Dominios desde los que se sirve la tienda. Cualquier otro «Host» u
// «Origin» se considera ajeno.
const FIXED_HOSTS = new Set(['samea.shop', 'www.samea.shop', 'samea-shop.vercel.app']);
const PREVIEW_HOST = /^samea-shop-[a-z0-9-]+-wishebee\.vercel\.app$/;

export function isAllowedHost(host) {
  const value = String(host || '').toLowerCase();
  return FIXED_HOSTS.has(value) || PREVIEW_HOST.test(value);
}

// Las peticiones que cambian datos deben llevar un Origin del mismo sitio
// al que llegan (protección CSRF además de las cookies SameSite=Lax).
export function isSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Responde 403 y devuelve false si una escritura no viene de la propia tienda.
export function guardWrite(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD' || isSameOrigin(req)) return true;
  res.status(403).json({ error: 'Origen no permitido.' });
  return false;
}

// Origen para enlaces de vuelta (Stripe, correos): solo dominios propios.
export function siteOrigin(req) {
  const host = req?.headers?.host;
  if (isAllowedHost(host)) return `https://${String(host).toLowerCase()}`;
  return (process.env.SITE_URL || 'https://samea.shop').replace(/\/$/, '');
}
