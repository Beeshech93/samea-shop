import { sql } from './_db.js';

export const CATEGORIES = {
  sujetadores: 'Sujetadores',
  panties: 'Panties',
  conjuntos: 'Conjuntos',
  dormir: 'Dormir',
  accesorios: 'Accesorios',
};

const SEED_PRODUCTS = [
  [1, 'Tanga de encaje blanca', 'Encaje floral y corte minimalista; tejido elástico y acabado suave para máximo confort.', 'panties', 159, 'Más vendido', ['S', 'M', 'L', 'XL'], 12, 'https://img-va.myshopline.com/image/store/1728356136669/dc07d0df-6418-4c1d-a46d-558d027409e7_1080x.jpg?w=1080&h=1620&q=80'],
  [2, 'Body Seducción Negro', 'Transparencias y encaje, tirantes finos y corte ceñido que realza la silueta.', 'conjuntos', 379, 'Nuevo', ['S', 'M', 'L'], 6, 'https://resources.sears.com.mx/products/cdn/product-channel/306368/2026/5/8/0129974d93f2abccc3fbeb69a1dba0d0.png?scale=500&qlty=75'],
  [3, 'Braga Encaje Nude', 'Talle medio y costuras planas para un ajuste invisible bajo la ropa.', 'panties', 89, null, ['S', 'M', 'L', 'XL'], 18, 'https://img.staticdj.com/edc6f84fb342cdd85ff8cd0df4027f06_750x.jpeg'],
  [4, 'Sujetador Básico Blanco', 'Sin aros, copa suave y tirantes regulables; soporte cómodo para el día a día.', 'sujetadores', 249, null, ['32B', '34B', '36B', '38B'], 3, 'https://seuke.com/cdn/shop/files/SYV008056_WR-2_1000x.jpg?v=1760872505'],
  [5, 'Conjunto Satén Vainilla', 'Top y braga de satén con brillo sutil para un look sofisticado.', 'conjuntos', 379, 'Total Look', ['S', 'M', 'L'], 7, 'https://resources.sears.com.mx/products/cdn/product-channel/71222/2026/5/11/72c909836679bf15b5faf9040bcaf0e1.jpg?scale=500&qlty=75'],
  [6, 'Top Bralette Lavanda', 'Bralette acolchado sin aro con tirantes finos; cómodo y femenino.', 'sujetadores', 249, 'Nuevo', ['S', 'M', 'L'], 5, 'https://img.staticdj.com/3337be03f93c0ec540882b0a5cf26fe1_750x.jpeg'],
];

let catalogReady;
export function ensureCatalogSchema() {
  catalogReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
        discount_percent INT NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
        sizes TEXT[] NOT NULL DEFAULT '{}',
        stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
        image_url TEXT NOT NULL DEFAULT '',
        badge TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS promotions (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
        value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
        min_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
        category TEXT,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY)`;

    // Carga inicial una sola vez: si luego se borra un producto o promoción, no vuelve.
    const seeded = await sql`
      INSERT INTO app_meta (key) VALUES ('catalog_seeded')
      ON CONFLICT DO NOTHING RETURNING key`;
    if (seeded.length) {
      for (const [id, name, description, category, price, badge, sizes, stock, image] of SEED_PRODUCTS) {
        await sql`
          INSERT INTO products (id, name, description, category, price, badge, sizes, stock, image_url)
          VALUES (${id}, ${name}, ${description}, ${category}, ${price}, ${badge}, ${sizes}, ${stock}, ${image})
          ON CONFLICT (id) DO NOTHING`;
      }
      await sql`SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT max(id) FROM products))`;
      await sql`
        INSERT INTO promotions (code, description, kind, value, category) VALUES
          ('APP10', '10% extra en toda la tienda', 'percent', 10, NULL),
          ('LOOKS15', '-15% en conjuntos (Total Looks)', 'percent', 15, 'conjuntos')
        ON CONFLICT (code) DO NOTHING`;
    }
  })().catch((error) => {
    catalogReady = undefined;
    throw error;
  });
  return catalogReady;
}

const round2 = (value) => Math.round(value * 100) / 100;

export function unitPrice(product) {
  return round2(Number(product.price) * (100 - product.discount_percent) / 100);
}

export function publicProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    discountPercent: row.discount_percent,
    finalPrice: unitPrice(row),
    sizes: row.sizes,
    image: row.image_url,
    badge: row.badge,
    inStock: row.stock > 0,
  };
}

export function adminProduct(row) {
  return { ...publicProduct(row), stock: row.stock, active: row.active, updatedAt: row.updated_at };
}

export function adminPromotion(row) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    kind: row.kind,
    value: Number(row.value),
    minSubtotal: Number(row.min_subtotal),
    category: row.category,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    active: row.active,
  };
}

// ---------- Validación de formularios del panel ----------

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1000000 ? round2(number) : null;
}

export function validateProduct(body = {}) {
  const name = text(body.name, 120);
  if (!name) return { error: 'El nombre es obligatorio.' };
  const category = text(body.category, 40);
  if (!CATEGORIES[category]) return { error: 'Elige una categoría válida.' };
  const price = money(body.price);
  if (price === null || price === 0) return { error: 'Escribe un precio mayor que 0.' };
  const discountPercent = Number(body.discountPercent ?? 0);
  if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 90) {
    return { error: 'El descuento debe ser un número entero entre 0 y 90.' };
  }
  const stock = Number(body.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
    return { error: 'El stock debe ser un número entero positivo.' };
  }
  const sizes = (Array.isArray(body.sizes) ? body.sizes : String(body.sizes || '').split(','))
    .map((size) => String(size).trim().toUpperCase())
    .filter(Boolean);
  if (sizes.length > 15 || sizes.some((size) => size.length > 10)) {
    return { error: 'Máximo 15 tallas de hasta 10 caracteres.' };
  }
  const imageUrl = text(body.imageUrl, 1000);
  if (imageUrl && !/^https:\/\/\S+$/i.test(imageUrl)) {
    return { error: 'La imagen debe ser una URL que empiece por https://' };
  }
  return {
    value: {
      name,
      description: text(body.description, 600),
      category,
      price,
      discountPercent,
      sizes: [...new Set(sizes)],
      stock,
      imageUrl,
      badge: text(body.badge, 30) || null,
      active: body.active !== false,
    },
  };
}

export function validatePromotion(body = {}) {
  const code = text(body.code, 30).toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    return { error: 'El código debe tener de 3 a 30 letras, números, - o _.' };
  }
  const kind = body.kind === 'fixed' ? 'fixed' : body.kind === 'percent' ? 'percent' : null;
  if (!kind) return { error: 'Elige el tipo de descuento.' };
  const value = money(body.value);
  if (!value) return { error: 'Escribe el valor del descuento.' };
  if (kind === 'percent' && value > 90) return { error: 'El porcentaje máximo es 90%.' };
  const minSubtotal = money(body.minSubtotal ?? 0);
  if (minSubtotal === null) return { error: 'La compra mínima no es válida.' };
  const category = text(body.category, 40) || null;
  if (category && !CATEGORIES[category]) return { error: 'Categoría no válida.' };
  const date = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  };
  const startsAt = date(body.startsAt);
  const endsAt = date(body.endsAt);
  if (startsAt === undefined || endsAt === undefined) return { error: 'Fecha no válida.' };
  if (startsAt && endsAt && endsAt <= startsAt) return { error: 'La fecha de fin debe ser posterior al inicio.' };
  return {
    value: {
      code,
      description: text(body.description, 200),
      kind,
      value,
      minSubtotal,
      category,
      startsAt,
      endsAt,
      active: body.active !== false,
    },
  };
}

// ---------- Cálculo del carrito (precios siempre desde la base) ----------

export async function quoteCart(rawItems, rawCode, db = sql) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    return { error: 'El carrito está vacío.' };
  }
  const ids = [...new Set(rawItems.map((item) => Number(item.productId)).filter(Number.isInteger))];
  const rows = ids.length ? await db`SELECT * FROM products WHERE active AND id = ANY(${ids})` : [];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const lines = [];
  for (const item of rawItems) {
    const product = byId.get(Number(item.productId));
    if (!product) return { error: 'Un producto del carrito ya no está disponible.' };
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return { error: 'Cantidad no válida.' };
    }
    const size = item.size ? String(item.size) : null;
    if (product.sizes.length && !product.sizes.includes(size)) {
      return { error: `Elige una talla válida para ${product.name}.` };
    }
    const unit = unitPrice(product);
    lines.push({ productId: product.id, size, quantity, unitPrice: unit, lineTotal: round2(unit * quantity), category: product.category });
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const result = { lines, subtotal, discount: 0, total: subtotal, promotion: null };

  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!code) return result;

  const promos = await db`
    SELECT * FROM promotions
    WHERE code = ${code} AND active
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at > now())`;
  const promo = promos[0];
  if (!promo) return { ...result, error: 'Código no válido o caducado.' };
  if (subtotal < Number(promo.min_subtotal)) {
    return { ...result, error: `Este código requiere una compra mínima de $${Number(promo.min_subtotal).toFixed(2)} MXN.` };
  }
  const eligible = promo.category
    ? round2(lines.filter((line) => line.category === promo.category).reduce((sum, line) => sum + line.lineTotal, 0))
    : subtotal;
  if (eligible === 0) {
    return { ...result, error: `Este código solo aplica a ${CATEGORIES[promo.category] || promo.category}.` };
  }
  const discount = promo.kind === 'percent'
    ? round2(eligible * Number(promo.value) / 100)
    : Math.min(round2(Number(promo.value)), eligible);

  return {
    ...result,
    discount,
    total: round2(subtotal - discount),
    promotion: { code: promo.code, description: promo.description },
  };
}
