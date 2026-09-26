// Catálogo de respaldo: se usa solo si la API no responde (p. ej. en local).
const FALLBACK_PRODUCTS = [
  {
    id: 1,
    name: 'Tanga de encaje blanca',
    category: 'panties',
    badge: 'Más vendido',
    description: 'Encaje floral y corte minimalista; tejido elástico y acabado suave para máximo confort.',
    price: 159.00,
    image: 'https://img-va.myshopline.com/image/store/1728356136669/dc07d0df-6418-4c1d-a46d-558d027409e7_1080x.jpg?w=1080&h=1620&q=80',
  },
  {
    id: 2,
    name: 'Body Seducción Negro',
    category: 'conjuntos',
    badge: 'Nuevo',
    description: 'Transparencias y encaje, tirantes finos y corte ceñido que realza la silueta.',
    price: 379.00,
    image: 'https://resources.sears.com.mx/products/cdn/product-channel/306368/2026/5/8/0129974d93f2abccc3fbeb69a1dba0d0.png?scale=500&qlty=75',
  },
  {
    id: 3,
    name: 'Braga Encaje Nude',
    category: 'panties',
    description: 'Talle medio y costuras planas para un ajuste invisible bajo la ropa.',
    price: 89.00,
    image: 'https://img.staticdj.com/edc6f84fb342cdd85ff8cd0df4027f06_750x.jpeg',
  },
  {
    id: 4,
    name: 'Sujetador Básico Blanco',
    category: 'sujetadores',
    description: 'Sin aros, copa suave y tirantes regulables; soporte cómodo para el día a día.',
    price: 249.00,
    image: 'https://seuke.com/cdn/shop/files/SYV008056_WR-2_1000x.jpg?v=1760872505',
  },
  {
    id: 5,
    name: 'Conjunto Satén Vainilla',
    category: 'conjuntos',
    badge: 'Total Look',
    description: 'Top y braga de satén con brillo sutil para un look sofisticado.',
    price: 379.00,
    image: 'https://resources.sears.com.mx/products/cdn/product-channel/71222/2026/5/11/72c909836679bf15b5faf9040bcaf0e1.jpg?scale=500&qlty=75',
  },
  {
    id: 6,
    name: 'Top Bralette Lavanda',
    category: 'sujetadores',
    badge: 'Nuevo',
    description: 'Bralette acolchado sin aro con tirantes finos; cómodo y femenino.',
    price: 249.00,
    image: 'https://img.staticdj.com/3337be03f93c0ec540882b0a5cf26fe1_750x.jpeg',
  },
];

let products = FALLBACK_PRODUCTS.map((product) => ({
  ...product,
  discountPercent: 0,
  finalPrice: product.price,
  sizes: [],
  inStock: true,
}));

let categoryNames = {
  sujetadores: 'Sujetadores',
  panties: 'Panties',
  conjuntos: 'Conjuntos',
  dormir: 'Dormir',
  accesorios: 'Accesorios',
};

const FREE_SHIPPING_THRESHOLD = 899;

const cart = [];
let activeFilter = 'todo';
let appliedCode = '';
let cartQuote = null;
let openSizePicker = null;

const $ = (id) => document.getElementById(id);

const productGrid = $('productGrid');
const categoryGrid = $('categoryGrid');
const filterTabs = $('filterTabs');
const cartDrawer = $('cartDrawer');
const cartItemsContainer = $('cartItems');
const cartTotal = $('cartTotal');
const cartCount = $('cartCount');
const paymentSection = $('paymentSection');
const shippingText = $('shippingText');
const shippingBar = $('shippingBar');
const overlay = $('overlay');
const authModal = $('authModal');
const loginForm = $('loginForm');
const registerForm = $('registerForm');
const loginTab = $('loginTab');
const registerTab = $('registerTab');
const loginButton = $('loginButton');
const logoutButton = $('logoutButton');
const authStatus = $('authStatus');
const authUserName = $('authUserName');
const mainNav = $('mainNav');
const menuToggle = $('menuToggle');
const toast = $('toast');

function formatCurrency(value) {
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), Math.max(3200, message.length * 70));
}

// ---------- Catálogo ----------

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function activeCategories() {
  return Object.entries(categoryNames)
    .map(([id, name]) => ({ id, name, items: products.filter((product) => product.category === id) }))
    .filter((category) => category.items.length > 0);
}

function renderCategories() {
  categoryGrid.innerHTML = activeCategories()
    .slice(0, 3)
    .map((category) => {
      const cover = category.items.find((item) => item.image) || category.items[0];
      const count = category.items.length;
      return `
        <a class="category-card" href="#coleccion" data-filter-link="${escapeHtml(category.id)}">
          ${cover.image ? `<img src="${escapeHtml(cover.image)}" alt="${escapeHtml(category.name)}" loading="lazy" />` : ''}
          <span class="category-label">
            <strong>${escapeHtml(category.name)}</strong>
            <small>${count} ${count === 1 ? 'pieza' : 'piezas'}</small>
          </span>
        </a>
      `;
    })
    .join('');
}

function renderFilterTabs() {
  const tabs = [{ id: 'todo', name: 'Todo' }, ...activeCategories()];
  if (!tabs.some((tab) => tab.id === activeFilter)) activeFilter = 'todo';
  filterTabs.innerHTML = tabs
    .map((tab) => `<button class="filter-tab${tab.id === activeFilter ? ' active' : ''}" type="button" data-filter="${escapeHtml(tab.id)}">${escapeHtml(tab.name)}</button>`)
    .join('');
}

function priceHtml(product) {
  if (product.discountPercent > 0) {
    return `
      <span class="price price-sale">${formatCurrency(product.finalPrice)}</span>
      <span class="price-old">${formatCurrency(product.price)}</span>`;
  }
  return `<span class="price">${formatCurrency(product.finalPrice)}</span>`;
}

function renderProducts() {
  const visible = activeFilter === 'todo'
    ? products
    : products.filter((product) => product.category === activeFilter);

  if (visible.length === 0) {
    productGrid.innerHTML = '<p class="comment-empty">No hay productos en esta categoría todavía.</p>';
    return;
  }

  productGrid.innerHTML = visible
    .map((product) => {
      const pickerOpen = openSizePicker === product.id;
      return `
      <article class="product-card">
        <div class="product-media">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />` : ''}
          <div class="badges">
            ${product.discountPercent > 0 ? `<span class="badge badge-sale">-${product.discountPercent}%</span>` : ''}
            ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
          </div>
          ${!product.inStock
            ? '<span class="quick-add is-disabled">Agotado</span>'
            : pickerOpen
              ? `<div class="size-picker" role="group" aria-label="Elige tu talla">
                  <span>Elige tu talla</span>
                  <div>${product.sizes.map((size) => `<button type="button" data-add="${product.id}" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join('')}</div>
                </div>`
              : `<button class="quick-add" type="button" data-add="${product.id}">${product.sizes.length ? 'Elegir talla' : 'Añadir al carrito'}</button>`}
        </div>
        <div class="product-body">
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description)}</p>
          ${product.sizes.length ? `<p class="sizes-line">Tallas: ${product.sizes.map(escapeHtml).join(' · ')}</p>` : ''}
          <div class="price-row">${priceHtml(product)}</div>
        </div>
      </article>
    `;
    })
    .join('');
}

function setFilter(filter) {
  activeFilter = filter;
  openSizePicker = null;
  renderFilterTabs();
  renderProducts();
}

function renderCatalog() {
  renderCategories();
  renderFilterTabs();
  renderProducts();
  fillCommentProducts();
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error(response.status);
    const data = await response.json();
    products = data.products;
    categoryNames = data.categories || categoryNames;
    // Quita del carrito lo que ya no existe y actualiza precios.
    for (let i = cart.length - 1; i >= 0; i -= 1) {
      const fresh = products.find((product) => product.id === cart[i].id);
      if (!fresh) cart.splice(i, 1);
      else Object.assign(cart[i], { name: fresh.name, image: fresh.image, finalPrice: fresh.finalPrice });
    }
    renderCatalog();
    renderCart();
  } catch {
    // Sin API (local): se mantiene el catálogo de respaldo.
  }
}

// ---------- Carrito ----------

const promoForm = $('promoForm');
const promoInput = $('promoInput');
const promoStatus = $('promoStatus');

function cartKey(id, size) {
  return `${id}|${size || ''}`;
}

function localSubtotal() {
  return Math.round(cart.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0) * 100) / 100;
}

function renderShipping(total) {
  const remaining = FREE_SHIPPING_THRESHOLD - total;
  shippingText.innerHTML = remaining > 0
    ? `Te faltan <strong>${formatCurrency(remaining)}</strong> para el envío gratis`
    : '<strong>¡Tienes envío gratis!</strong>';
  shippingBar.style.width = `${Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100)}%`;
}

function renderTotals() {
  const subtotal = cartQuote && !cartQuote.stale ? cartQuote.subtotal : localSubtotal();
  const discount = cartQuote && !cartQuote.stale ? cartQuote.discount : 0;
  const total = Math.round((subtotal - discount) * 100) / 100;

  $('cartSubtotal').textContent = formatCurrency(subtotal);
  $('discountRow').classList.toggle('hidden', !discount);
  $('cartDiscount').textContent = `−${formatCurrency(discount)}`;
  $('discountLabel').textContent = cartQuote?.promotion ? `Descuento (${cartQuote.promotion.code})` : 'Descuento';
  cartTotal.textContent = formatCurrency(total);
  renderShipping(total);

  promoStatus.textContent = '';
  promoStatus.className = 'promo-status';
  if (cartQuote?.promotion && !cartQuote.stale) {
    promoStatus.textContent = `✓ ${cartQuote.promotion.code}: ${cartQuote.promotion.description}`;
    promoStatus.classList.add('is-ok');
  } else if (cartQuote?.error) {
    promoStatus.textContent = cartQuote.error;
    promoStatus.classList.add('is-error');
  }
  $('removePromo').classList.toggle('hidden', !appliedCode);
}

function renderCart() {
  cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  paymentSection.classList.toggle('hidden', cart.length === 0);
  promoForm.classList.toggle('hidden', cart.length === 0);
  renderTotals();

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <p>Tu carrito está vacío.</p>
        <a href="#coleccion" class="btn btn-ghost" data-close-cart>Ver colección</a>
      </div>`;
    return;
  }

  cartItemsContainer.innerHTML = cart
    .map((item) => {
      const key = escapeHtml(item.key);
      return `
      <div class="cart-item">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />` : '<span class="cart-item-placeholder"></span>'}
        <div class="cart-item-details">
          <h4>${escapeHtml(item.name)}</h4>
          <span class="cart-item-price">${item.size ? `Talla ${escapeHtml(item.size)} · ` : ''}${formatCurrency(item.finalPrice)}</span>
          <div class="cart-item-actions">
            <div class="qty">
              <button type="button" aria-label="Quitar uno" data-qty="${key}" data-change="-1">−</button>
              <span>${item.quantity}</span>
              <button type="button" aria-label="Añadir uno" data-qty="${key}" data-change="1">+</button>
            </div>
            <button class="text-button" type="button" data-remove="${key}">Eliminar</button>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

// Pide al servidor los totales con el código aplicado (precios de la base).
let quoteRequest = 0;
async function refreshQuote() {
  if (!appliedCode || cart.length === 0) {
    cartQuote = null;
    renderTotals();
    return;
  }
  if (cartQuote) cartQuote.stale = true;
  const requestId = ++quoteRequest;
  try {
    const response = await fetch('/api/cart/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: appliedCode,
        items: cart.map((item) => ({ productId: item.id, size: item.size, quantity: item.quantity })),
      }),
    });
    const data = await response.json();
    if (requestId !== quoteRequest) return;
    cartQuote = response.ok ? data : { error: data.error || 'No se pudo aplicar el código.' };
    if (!cartQuote.promotion) appliedCode = '';
  } catch {
    if (requestId !== quoteRequest) return;
    cartQuote = { error: 'No se pudo comprobar el código. Inténtalo de nuevo.' };
    appliedCode = '';
  }
  renderTotals();
}

function cartChanged() {
  renderCart();
  refreshQuote();
}

function addToCart(productId, size) {
  const product = products.find((item) => item.id === productId);
  if (!product || !product.inStock) return;

  if (product.sizes.length && !size) {
    openSizePicker = openSizePicker === productId ? null : productId;
    renderProducts();
    return;
  }

  openSizePicker = null;
  renderProducts();
  const key = cartKey(productId, size);
  const existingItem = cart.find((item) => item.key === key);
  if (existingItem) {
    existingItem.quantity = Math.min(20, existingItem.quantity + 1);
  } else {
    cart.push({
      key,
      id: product.id,
      size: size || null,
      name: product.name,
      image: product.image,
      finalPrice: product.finalPrice,
      quantity: 1,
    });
  }
  cartChanged();
  openCart();
}

function changeQuantity(key, change) {
  const item = cart.find((entry) => entry.key === key);
  if (!item) return;
  item.quantity = Math.min(20, item.quantity + change);
  if (item.quantity <= 0) {
    removeFromCart(key);
    return;
  }
  cartChanged();
}

function removeFromCart(key) {
  const index = cart.findIndex((item) => item.key === key);
  if (index !== -1) {
    cart.splice(index, 1);
    cartChanged();
  }
}

promoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = promoInput.value.trim().toUpperCase();
  if (!code) return;
  appliedCode = code;
  promoInput.value = '';
  refreshQuote();
});

$('removePromo').addEventListener('click', () => {
  appliedCode = '';
  cartQuote = null;
  renderTotals();
});

function showOverlay() {
  overlay.hidden = false;
  document.body.classList.add('no-scroll');
}

function hideOverlay() {
  overlay.hidden = true;
  document.body.classList.remove('no-scroll');
}

function openCart() {
  closeMenu();
  cartDrawer.classList.add('open');
  cartDrawer.setAttribute('aria-hidden', 'false');
  showOverlay();
}

function closeCart() {
  cartDrawer.classList.remove('open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  hideOverlay();
}

function handleCheckout() {
  if (cart.length === 0) {
    showToast('Añade algún producto antes de pagar.');
    return;
  }

  const cardNumber = $('cardNumber').value.trim();
  const cardName = $('cardName').value.trim();
  const cardExpiry = $('cardExpiry').value.trim();
  const cardCvc = $('cardCvc').value.trim();

  if (!cardNumber || !cardName || !cardExpiry || !cardCvc) {
    showToast('Completa todos los datos de la tarjeta.');
    return;
  }
  if (!/^\d{4} \d{4} \d{4} \d{4}$/.test(cardNumber)) {
    showToast('Número de tarjeta inválido (0000 0000 0000 0000).');
    return;
  }
  if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
    showToast('Fecha de vencimiento en formato MM/AA.');
    return;
  }
  if (!/^\d{3,4}$/.test(cardCvc)) {
    showToast('CVC inválido: 3 o 4 dígitos.');
    return;
  }

  cart.length = 0;
  appliedCode = '';
  cartQuote = null;
  renderCart();
  ['cardNumber', 'cardName', 'cardExpiry', 'cardCvc'].forEach((id) => { $(id).value = ''; });
  closeCart();
  showToast('¡Gracias por tu compra! (Demo: el pago no se procesó.)');
}

function formatCardInput(event) {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 16);
  event.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiryInput(event) {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
  event.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

// ---------- Cuenta ----------

const forgotForm = $('forgotForm');
const resetForm = $('resetForm');
const authTabs = document.querySelector('.auth-tabs');
const authViews = { login: loginForm, register: registerForm, forgot: forgotForm, reset: resetForm };
let resetToken = null;

function showAuthView(view) {
  Object.entries(authViews).forEach(([name, form]) => form.classList.toggle('hidden', name !== view));
  authTabs.classList.toggle('hidden', view === 'forgot' || view === 'reset');
  loginTab.classList.toggle('active', view === 'login');
  registerTab.classList.toggle('active', view === 'register');
}

function openAuthModal(view = 'login') {
  closeMenu();
  authModal.classList.add('open');
  authModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  showAuthView(view);
}

function closeAuthModal() {
  authModal.classList.remove('open');
  authModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

function switchToLogin() {
  showAuthView('login');
}

function switchToRegister() {
  showAuthView('register');
}

// Las cuentas viven en el servidor (Neon). Borra los datos que la versión
// anterior guardaba en este navegador, incluidas contraseñas sin cifrar.
try {
  localStorage.removeItem('sameaUsers');
  localStorage.removeItem('sameaCurrentUser');
} catch {
  // Almacenamiento no disponible: nada que limpiar.
}

let currentUser = null;

async function authRequest(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el servidor.');
  return data;
}

function updateAuthState() {
  const loggedIn = Boolean(currentUser);
  const isAdmin = Boolean(currentUser?.isAdmin);
  authStatus.classList.toggle('hidden', !loggedIn);
  logoutButton.classList.toggle('hidden', !loggedIn);
  loginButton.classList.toggle('hidden', loggedIn);
  authUserName.textContent = loggedIn ? currentUser.name.split(' ')[0] : '';

  document.querySelectorAll('[data-guest-only]').forEach((node) => node.classList.toggle('hidden', loggedIn));
  document.querySelectorAll('[data-user-only]').forEach((node) => node.classList.toggle('hidden', !loggedIn));
  document.querySelectorAll('[data-admin-only]').forEach((node) => node.classList.toggle('hidden', !isAdmin));
  $('footerUser').textContent = loggedIn ? `Conectada como ${currentUser.email}` : '';
}

async function loadCurrentUser() {
  try {
    const { user } = await authRequest('/api/auth/me');
    currentUser = user;
  } catch {
    currentUser = null;
  }
  updateAuthState();
}

async function submitAuth(form, path, body, welcome) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { user } = await authRequest(path, body);
    currentUser = user;
    updateAuthState();
    loadCurrentUser(); // trae el rol (isAdmin) de la sesión recién creada
    closeAuthModal();
    form.reset();
    showToast(welcome(user));
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function handleLogin(event) {
  event.preventDefault();
  const email = $('loginEmail').value.trim().toLowerCase();
  const password = $('loginPassword').value;
  if (!email || !password) {
    showToast('Completa correo y contraseña.');
    return;
  }
  submitAuth(loginForm, '/api/auth/login', { email, password }, (user) => `Bienvenida, ${user.name}.`);
}

function handleRegister(event) {
  event.preventDefault();
  const name = $('registerName').value.trim();
  const email = $('registerEmail').value.trim().toLowerCase();
  const password = $('registerPassword').value;
  const confirmPassword = $('registerPasswordConfirm').value;

  if (!name || !email || !password || !confirmPassword) {
    showToast('Completa todos los campos.');
    return;
  }
  if (password.length < 8) {
    showToast('La contraseña debe tener al menos 8 caracteres.');
    return;
  }
  if (password !== confirmPassword) {
    showToast('Las contraseñas no coinciden.');
    return;
  }
  if (!$('registerPrivacy').checked) {
    showToast('Debes aceptar el aviso de privacidad.');
    return;
  }
  submitAuth(registerForm, '/api/auth/register', { name, email, password, privacyAccepted: true }, (user) => `Cuenta creada. Bienvenida, ${user.name}.`);
}

async function handleForgot(event) {
  event.preventDefault();
  const email = $('forgotEmail').value.trim().toLowerCase();
  if (!email) return;
  const button = forgotForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { message } = await authRequest('/api/auth/forgot', { email });
    forgotForm.reset();
    showAuthView('login');
    showToast(message);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function handleReset(event) {
  event.preventDefault();
  const password = $('resetPassword').value;
  if (password.length < 8) {
    showToast('La contraseña debe tener al menos 8 caracteres.');
    return;
  }
  if (password !== $('resetPasswordConfirm').value) {
    showToast('Las contraseñas no coinciden.');
    return;
  }
  submitAuth(resetForm, '/api/auth/reset', { token: resetToken, password }, (user) => `Contraseña actualizada. Bienvenida, ${user.name}.`);
}

// Enlace del correo de recuperación: /?reset=<token>. Se quita de la URL
// para que no quede en el historial.
function checkResetLink() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reset');
  if (!token) return;
  resetToken = token;
  params.delete('reset');
  const query = params.toString();
  history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  openAuthModal('reset');
}

// ---------- Menú móvil ----------

function closeMenu() {
  mainNav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

menuToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
mainNav.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});

// ---------- Eventos ----------

document.addEventListener('click', (event) => {
  const addButton = event.target.closest('[data-add]');
  if (addButton) {
    addToCart(Number(addButton.dataset.add), addButton.dataset.size);
    return;
  }

  const qtyButton = event.target.closest('[data-qty]');
  if (qtyButton) {
    changeQuantity(qtyButton.dataset.qty, Number(qtyButton.dataset.change));
    return;
  }

  const removeButton = event.target.closest('[data-remove]');
  if (removeButton) {
    removeFromCart(removeButton.dataset.remove);
    return;
  }

  const filterLink = event.target.closest('[data-filter-link]');
  if (filterLink) {
    setFilter(filterLink.dataset.filterLink);
  }

  if (event.target.closest('[data-close-cart]')) {
    closeCart();
  }

  const authLink = event.target.closest('[data-open-auth]');
  if (authLink) {
    openAuthModal(authLink.dataset.openAuth);
  }
});

filterTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.filter-tab');
  if (tab) setFilter(tab.dataset.filter);
});

$('cartButton').addEventListener('click', openCart);
$('closeCartButton').addEventListener('click', closeCart);
overlay.addEventListener('click', closeCart);
$('checkoutButton').addEventListener('click', handleCheckout);
$('cardNumber').addEventListener('input', formatCardInput);
$('cardExpiry').addEventListener('input', formatExpiryInput);

loginButton.addEventListener('click', () => openAuthModal('login'));
async function handleLogout() {
  try {
    await authRequest('/api/auth/logout', {});
    currentUser = null;
    updateAuthState();
    showToast('Has cerrado sesión.');
  } catch (error) {
    showToast(error.message);
  }
}
logoutButton.addEventListener('click', handleLogout);
document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', handleLogout));
$('closeAuthButton').addEventListener('click', closeAuthModal);
authModal.addEventListener('click', (event) => {
  if (event.target === authModal) closeAuthModal();
});
loginTab.addEventListener('click', switchToLogin);
registerTab.addEventListener('click', switchToRegister);
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
forgotForm.addEventListener('submit', handleForgot);
resetForm.addEventListener('submit', handleReset);
authModal.addEventListener('click', (event) => {
  const link = event.target.closest('[data-auth-view]');
  if (link) showAuthView(link.dataset.authView);
});

$('newsletterForm').addEventListener('submit', (event) => {
  event.preventDefault();
  event.target.reset();
  showToast('¡Gracias! Te escribiremos pronto.');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeCart();
  closeAuthModal();
  closeMenu();
});

// ---------- Comentarios ----------

const commentList = $('commentList');
const commentForm = $('commentForm');

function renderCommentMessage(message) {
  commentList.innerHTML = '';
  const item = document.createElement('li');
  item.className = 'comment-empty';
  item.textContent = message;
  commentList.append(item);
}

const commentProduct = $('commentProduct');

function fillCommentProducts() {
  const selected = commentProduct.value;
  commentProduct.length = 1;
  products.forEach((product) => {
    commentProduct.append(new Option(product.name, product.id));
  });
  commentProduct.value = selected;
  if (commentProduct.selectedIndex === -1) commentProduct.value = '';
}

function buildComment(entry) {
  const item = document.createElement('li');
  item.className = 'comment';

  const text = document.createElement('p');
  text.textContent = entry.comment;

  const meta = document.createElement('footer');
  const author = document.createElement('strong');
  author.textContent = entry.name || 'Clienta SAMÉA';
  meta.append(author);

  const product = products.find((p) => p.id === entry.product_id);
  const details = [
    product ? product.name : null,
    new Date(entry.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' }),
  ].filter(Boolean);
  meta.append(` · ${details.join(' · ')}`);

  item.append(text, meta);
  return item;
}

async function loadComments() {
  try {
    const response = await fetch('/api/comments');
    if (!response.ok) throw new Error(response.status);
    const { comments } = await response.json();
    if (comments.length === 0) {
      renderCommentMessage('Aún no hay comentarios. ¡Sé la primera!');
      return;
    }
    commentList.innerHTML = '';
    comments.forEach((entry) => commentList.append(buildComment(entry)));
  } catch {
    renderCommentMessage('Los comentarios no están disponibles en este momento.');
  }
}

commentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const comment = $('commentInput').value.trim();
  const name = $('commentName').value.trim();
  const productId = commentProduct.value ? Number(commentProduct.value) : null;
  if (!comment || !name) return;

  const button = commentForm.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, productId, comment }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    commentForm.reset();
    showToast('¡Gracias! Tu comentario se publicará tras revisarlo.');
  } catch (error) {
    showToast(error.message || 'No se pudo publicar el comentario.');
  } finally {
    button.disabled = false;
  }
});

$('year').textContent = new Date().getFullYear();

updateAuthState();
loadCurrentUser();
checkResetLink();
renderCatalog();
renderCart();
loadProducts().then(loadComments);
