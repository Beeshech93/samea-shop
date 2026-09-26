# SAMÉA — Lencería fina

Tienda en línea de lencería publicada en Vercel (https://samea-shop.vercel.app) con base de datos Postgres en Neon.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `script.js`, `styles.css` | Tienda: catálogo, tallas, carrito, códigos promocionales, cuentas, comentarios y boletín |
| `dashboard.html`, `dashboard.js`, `dashboard-catalog.js` | Panel de administración (solo cuentas administradoras) |
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
| `/api/auth/{register,login,logout,me,forgot,reset}` | Cuentas y sesión (cookie `HttpOnly`) |
| `/api/admin/{products,promotions,users,subscribers,comments}` | Gestión desde el panel |

El plan Hobby de Vercel admite como máximo 12 funciones: por eso las rutas de `auth` y `admin` comparten una función cada una (`[action].js`, `[resource].js`).

## Desarrollo

```bash
npm install
npm run check   # comprueba la sintaxis de todo el JavaScript
npm test        # pruebas automáticas
```

Para ver las páginas en local basta un servidor estático (por ejemplo `python3 -m http.server`). La API solo funciona desplegada en Vercel o con `vercel dev`; sin ella la tienda muestra un catálogo de respaldo.

Despliegue y variables de entorno: ver [DEPLOYMENT.md](DEPLOYMENT.md).
