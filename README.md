# SAMÉA — Lencería fina

Tienda en línea de lencería publicada en Vercel en **https://samea.shop** (también https://samea-shop.vercel.app) con base de datos Postgres en Neon.

## Direcciones del sitio

| Dirección | Página |
|---|---|
| `/` | Tienda |
| `/checkout` | Finalizar compra |
| `/pedido` | Seguimiento y «Mis pedidos» (también `/mis-pedidos`) |
| `/privacidad` | Aviso de privacidad |
| `/dashboard` | Panel de administración (también `/panel` y `/admin`) |

`vercel.json` activa `cleanUrls`: las direcciones antiguas con `.html` redirigen solas a la versión limpia.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `script.js`, `styles.css` | Tienda: catálogo, tallas, carrito, códigos promocionales, cuentas, comentarios y boletín |
| `checkout.html`, `checkout.js` | Checkout: dirección, envío por zona, pago con tarjeta (Stripe) o transferencia |
| `pedido.html`, `pedido.js` | Seguimiento de pedidos y «Mis pedidos» |
| `dashboard.html`, `dashboard*.js` | Panel de administración: WhatsApp, pedidos, envíos, pagos, productos, promociones, clientas, boletín, comentarios |
| `privacidad.html` | Aviso de privacidad |
| `api/*.js` | Funciones de Vercel (API). Los archivos que empiezan por `_` son módulos compartidos |
| `api/_lib/` | Manejadores de `/api/auth/*` y `/api/admin/*` |
| `tests/` | Pruebas automáticas (`node --test`) |

## API

| Ruta | Uso |
|---|---|
| `GET /api/products` | Catálogo visible |
| `POST /api/cart/quote` | Subtotal, descuento y total calculados con los precios de la base |
| `GET/POST /api/comments` | Comentarios aprobados / enviar comentario (queda pendiente de revisión) |
| `POST /api/newsletter` | Suscripción al boletín |
| `/api/orders/{options,quote,create,track,abandon,mine}` | Checkout y seguimiento de pedidos |
| `POST /api/stripe-webhook` | Confirmación de pagos de Stripe |
| `POST /api/whatsapp?token=…` | Webhook de Evolution API para el agente de WhatsApp |
| `/api/auth/{register,login,logout,me,forgot,reset}` | Cuentas y sesión (cookie `HttpOnly`) |
| `/api/admin/{orders,shipping,products,promotions,users,subscribers,comments}` | Gestión desde el panel |

El plan Hobby de Vercel admite como máximo 12 funciones: por eso las rutas de `auth` y `admin` comparten una función cada una (`[action].js`, `[resource].js`).

## Desarrollo

```bash
npm install
npm run check   # comprueba la sintaxis de todo el JavaScript
npm test        # pruebas automáticas
```

Para ver las páginas en local basta un servidor estático (por ejemplo `python3 -m http.server`). La API solo funciona desplegada en Vercel o con `vercel dev`; sin ella la tienda muestra un catálogo de respaldo.

Despliegue y variables de entorno: ver [DEPLOYMENT.md](DEPLOYMENT.md).
