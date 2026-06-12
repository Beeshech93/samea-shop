# Deployment de SAMÉA en samea.shop

## Opción 1: Netlify (Recomendado - Más fácil)

### Paso 1: Preparar el repositorio Git
```bash
cd /Users/wisly/neuvo\ protecto
git init
git add .
git commit -m "Initial SAMEA shop"
git branch -M main
```

### Paso 2: Subir a GitHub
1. Crea una cuenta en [github.com](https://github.com) si no tienes
2. Crea un nuevo repositorio (ej: `samea-shop`)
3. Sube tu código:
```bash
git remote add origin https://github.com/TU_USUARIO/samea-shop.git
git push -u origin main
```

### Paso 3: Desplegar en Netlify
1. Ve a [netlify.com](https://netlify.com) e inicia sesión
2. Click en **"New site from Git"**
3. Selecciona GitHub y el repositorio `samea-shop`
4. Configura:
   - Build command: (dejar en blanco, es estático)
   - Publish directory: `.` o `/`
5. Click **Deploy**

### Paso 4: Conectar dominio en Netlify
1. En Netlify, ve a **Site settings → Domain settings**
2. Click en **Custom domains → Add custom domain**
3. Ingresa: `samea.shop`
4. Netlify te dará nameservers (ej: `dns1.netlify.com`)

### Paso 5: Actualizar DNS en HostGator
1. Ve a HostGator: [cliente.hostgator.mx](https://cliente.hostgator.mx)
2. En **Administración de dominios → DNS**
3. Reemplaza los nameservers actuales con los de Netlify:
   - `ns1.netlify.com`
   - `ns2.netlify.com`
   - Otros que Netlify proporcione
4. Guarda y espera 24-48 horas para propagación DNS

---

## Opción 2: HostGator (Si ya tienes hosting)

Si ya tienes un plan de hosting en HostGator con espacio FTP:

### Paso 1: Acceder a cPanel
1. Ve a tu panel de HostGator (cliente.hostgator.mx)
2. Busca **cPanel** o **Administrador de archivos**

### Paso 2: Subir archivos
1. Entra en File Manager / Administrador de archivos
2. Navega a la carpeta `public_html` (o la carpeta del dominio)
3. Sube todos tus archivos:
   - `index.html`
   - `dashboard.html`
   - `script.js`
   - `dashboard.js`
   - `styles.css`
   - Carpeta `assets/`

### Paso 3: Configurar DNS
Los nameservers de HostGator ya deberían estar configurados si compraste el dominio ahí.
Si necesitas cambiarlos, usa:
- Servidor 1: `ns122.hostgator.mx`
- Servidor 2: `ns123.hostgator.mx`

### Paso 4: Esperar propagación
- Suele tomar 24-48 horas
- Verifica en [whatsmydns.net](https://whatsmydns.net)

---

## Verificación

Una vez deployado, accede a:
- **Tienda**: https://samea.shop
- **Dashboard**: https://samea.shop/dashboard.html

---

## Troubleshooting

**"Dominio no resuelve"**
- Verifica que los DNS estén propagados (whatsmydns.net)
- Limpia caché del navegador (Ctrl+Shift+Del)

**"Archivos no se suben"**
- Verifica permisos FTP en HostGator
- Asegúrate que todos los archivos tengan la carpeta `assets/`

**"Estilos/imágenes rotos"**
- Verifica que la ruta de `assets/` sea correcta
- Usa rutas relativas en el código

