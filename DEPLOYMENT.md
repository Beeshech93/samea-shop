# Despliegue

Cada push a `main` en GitHub se publica automáticamente en Vercel (proyecto `samea-shop`, equipo WISHEBEE). GitHub Actions ejecuta `npm run check` y `npm test` en cada push (requiere que la cuenta de GitHub no tenga bloqueos de facturación).

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a Neon. La crea la integración de Neon |
| `ADMIN_EMAILS` | Sí | Correos con acceso fijo al panel, separados por comas |
| `RESEND_API_KEY` | Para recuperar contraseñas | Clave de [Resend](https://resend.com) |
| `MAIL_FROM` | Para recuperar contraseñas | Remitente verificado en Resend, p. ej. `SAMÉA <hola@samea.shop>` |
| `SITE_URL` | No | Dominio para los enlaces de los correos. Ahora: `https://samea.shop` |

Las variables nuevas solo se aplican tras un nuevo despliegue (Deployments → ⋯ → Redeploy).

Las tablas de la base se crean y actualizan solas la primera vez que se usa cada parte de la API.

## Dominio samea.shop

- **samea.shop** es el dominio principal (sirve la tienda).
- **www.samea.shop** redirige a samea.shop (308), configurado en Vercel → Settings → Domains.
- Los DNS están en HostGator (`ns122`/`ns123.hostgator.mx`). Registros de la web en su Zone Editor:

| Tipo | Nombre | Valor actual | Valor recomendado por Vercel |
|---|---|---|---|
| A | `samea.shop` | `76.76.21.21` | `216.198.79.1` |
| CNAME | `www` | `cname.vercel-dns.com` | `84b65fe1dc340ad0.vercel-dns-017.com` |

Los dos valores funcionan; los recomendados quitan el aviso "DNS Change Recommended" de Vercel. No toques los registros MX, TXT y CNAME de Google (correo).
