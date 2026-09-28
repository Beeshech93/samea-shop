# Despliegue

Cada push a `main` en GitHub se publica automáticamente en Vercel (proyecto `samea-shop`, equipo WISHEBEE). GitHub Actions ejecuta `npm run check` y `npm test` en cada push (requiere que la cuenta de GitHub no tenga bloqueos de facturación).

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a Neon. La crea la integración de Neon |
| `ADMIN_EMAILS` | Sí | Correos con acceso fijo al panel, separados por comas |
| `RESEND_API_KEY` | Para recuperar contraseñas | Clave de [Resend](https://resend.com) |
| `MAIL_FROM` | Para recuperar contraseñas | Remitente verificado en Resend, p. ej. `SAMÉA <hola@samea.shop>` |
| `STRIPE_SECRET_KEY` | Para pagos con tarjeta | La crea la integración de Stripe en Vercel |
| `STRIPE_WEBHOOK_SECRET` | Recomendada | Secreto del webhook `https://samea.shop/api/stripe-webhook` (eventos `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` y `checkout.session.async_payment_failed`; los dos últimos son para OXXO). Sin él, el pago se confirma cuando la clienta vuelve a la tienda o desde el panel («Verificar pago») |
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

## Logística

- **Zonas de envío** (panel → Envíos): cada estado pertenece a una zona con precio, envío gratis desde cierto importe y días de entrega. Se crean tres zonas iniciales editables.
- **Pagos** (panel → Pagos): datos bancarios para transferencia (sin ellos la opción no aparece), meses sin intereses, OXXO y un mensaje junto al botón de pago de Stripe. Meses sin intereses y OXXO deben estar activados también en Stripe (Settings → Payment methods); si no lo están, el pago se hace solo con tarjeta.
- **Marca en Stripe**: logo, colores y nombre de la página de pago se configuran en Stripe → Settings → Branding.
- **Flujo de un pedido**: Pendiente de pago → Pagado → En preparación → Enviado (paquetería + guía) → Entregado. Cancelar devuelve el stock.
- El stock se descuenta al crear el pedido. Los pagos con tarjeta no completados caducan en 1 hora y el stock vuelve solo.

## Seguridad

- Cabeceras en `vercel.json`: CSP estricta (solo scripts propios), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; la API responde con `Cache-Control: no-store`.
- Toda escritura (registro, login, pedidos, comentarios, boletín, panel) exige un `Origin` del propio dominio; el webhook de Stripe se valida por firma.
- Sesión en cookie `__Host-samea_session` (HttpOnly, Secure, SameSite=Lax); contraseñas con scrypt; se rechazan contraseñas comunes o que contienen el correo.
- Límites de intentos por IP y correo en login, registro, recuperación, pedidos, comentarios, boletín y búsqueda de pedidos.
- Cancelar un pedido pagado con Stripe lo reembolsa; si estaba pendiente (enlace de pago o ficha OXXO) lo anula. Un pago que llegue a un pedido ya cancelado se reembolsa solo.
- `robots.txt` excluye panel, checkout, pedidos y API; contacto de seguridad en `/.well-known/security.txt`.

## Agente de WhatsApp (Evolution API + Claude)

1. **Servidor de Evolution API** (v2): instálalo en un VPS o servicio con Docker (Railway, Render, DigitalOcean…); no corre en Vercel. Crea una instancia y conéctala escaneando el QR con el WhatsApp de SAMÉA.
2. **Variables en Vercel** (Production) y redeploy:

| Variable | Valor |
|---|---|
| `EVOLUTION_API_URL` | URL de tu servidor, p. ej. `https://evolution.midominio.com` |
| `EVOLUTION_API_KEY` | API key de Evolution |
| `EVOLUTION_INSTANCE` | Nombre de la instancia |
| `WHATSAPP_WEBHOOK_SECRET` | Texto aleatorio largo (p. ej. `openssl rand -hex 24`) |
| `ANTHROPIC_API_KEY` | Clave de https://console.anthropic.com |
| `WHATSAPP_OWNER_NUMBER` | Opcional: tu número (con lada, p. ej. `5215512345678`) para recibir avisos cuando una clienta pide a una persona |

3. **Webhook en Evolution API** (instancia → Webhook): URL `https://samea.shop/api/whatsapp?token=<WHATSAPP_WEBHOOK_SECRET>`, evento `MESSAGES_UPSERT`, sin «webhook by events».

Funcionamiento: el bot responde solo a chats individuales de texto; las herramientas del agente son de solo lectura (productos, envíos, promociones, pagos y estado de pedidos verificado por correo o por el número de WhatsApp de la compra). Pasa a una persona cuando lo pide la clienta o hay quejas; también se pausa si alguien del equipo responde desde el teléfono o desde el panel (sección WhatsApp). Límite: 30 mensajes por hora por chat.

Evolution API usa la conexión de WhatsApp Web (no la API oficial de Meta): WhatsApp puede restringir números que envían mensajes masivos o no solicitados. Úsalo solo para responder a quien te escribe.
