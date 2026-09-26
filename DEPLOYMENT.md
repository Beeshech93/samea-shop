# Despliegue

Cada push a `main` en GitHub se publica automáticamente en Vercel (proyecto `samea-shop`, equipo WISHEBEE). GitHub Actions ejecuta `npm run check` y `npm test` en cada push.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a Neon. La crea la integración de Neon |
| `ADMIN_EMAILS` | Sí | Correos con acceso fijo al panel, separados por comas |
| `RESEND_API_KEY` | Para recuperar contraseñas | Clave de [Resend](https://resend.com) |
| `MAIL_FROM` | Para recuperar contraseñas | Remitente verificado en Resend, p. ej. `SAMÉA <hola@samea.shop>` |
| `SITE_URL` | No | Dominio para los enlaces de los correos (por defecto `https://samea-shop.vercel.app`) |

Las variables nuevas solo se aplican tras un nuevo despliegue (Deployments → ⋯ → Redeploy).

Las tablas de la base se crean y actualizan solas la primera vez que se usa cada parte de la API.

## Dominio samea.shop

El dominio usa los DNS de HostGator. En su editor de zona deben existir:

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `www` | `cname.vercel-dns.com.` |
| A | `@` | `76.76.21.21` |

Si Vercel (Settings → Domains) muestra otros valores, usa los de Vercel.
