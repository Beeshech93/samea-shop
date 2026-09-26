const products = [
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

const categories = [
  { id: 'sujetadores', name: 'Sujetadores', productId: 6 },
  { id: 'panties', name: 'Panties', productId: 1 },
  { id: 'conjuntos', name: 'Conjuntos', productId: 2 },
];

const FREE_SHIPPING_THRESHOLD = 899;

const cart = [];
let activeFilter = 'todo';

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

function renderCategories() {
  categoryGrid.innerHTML = categories
    .map((category) => {
      const product = products.find((item) => item.id === category.productId);
      const count = products.filter((item) => item.category === category.id).length;
      return `
        <a class="category-card" href="#coleccion" data-filter-link="${category.id}">
          <img src="${product.image}" alt="${category.name}" loading="lazy" />
          <span class="category-label">
            <strong>${category.name}</strong>
            <small>${count} ${count === 1 ? 'pieza' : 'piezas'}</small>
          </span>
        </a>
      `;
    })
    .join('');
}

function renderProducts() {
  const visible = activeFilter === 'todo'
    ? products
    : products.filter((product) => product.category === activeFilter);

  productGrid.innerHTML = visible
    .map(
      (product) => `
      <article class="product-card">
        <div class="product-media">
          <img src="${product.image}" alt="${product.name}" loading="lazy" />
          ${product.badge ? `<span class="badge">${product.badge}</span>` : ''}
          <button class="quick-add" type="button" data-add="${product.id}">Añadir al carrito</button>
        </div>
        <div class="product-body">
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <span class="price">${formatCurrency(product.price)}</span>
        </div>
      </article>
    `
    )
    .join('');
}

function setFilter(filter) {
  activeFilter = filter;
  filterTabs.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });
  renderProducts();
}

// ---------- Carrito ----------

function cartSubtotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderShipping(total) {
  const remaining = FREE_SHIPPING_THRESHOLD - total;
  shippingText.innerHTML = remaining > 0
    ? `Te faltan <strong>${formatCurrency(remaining)}</strong> para el envío gratis`
    : '<strong>¡Tienes envío gratis!</strong>';
  shippingBar.style.width = `${Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100)}%`;
}

function renderCart() {
  const total = cartSubtotal();
  cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartTotal.textContent = formatCurrency(total);
  renderShipping(total);
  paymentSection.classList.toggle('hidden', cart.length === 0);

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <p>Tu carrito está vacío.</p>
        <a href="#coleccion" class="btn btn-ghost" data-close-cart>Ver colección</a>
      </div>`;
    return;
  }

  cartItemsContainer.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}" />
        <div class="cart-item-details">
          <h4>${item.name}</h4>
          <span class="cart-item-price">${formatCurrency(item.price)}</span>
          <div class="cart-item-actions">
            <div class="qty">
              <button type="button" aria-label="Quitar uno" data-qty="${item.id}" data-change="-1">−</button>
              <span>${item.quantity}</span>
              <button type="button" aria-label="Añadir uno" data-qty="${item.id}" data-change="1">+</button>
            </div>
            <button class="text-button" type="button" data-remove="${item.id}">Eliminar</button>
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;

  const existingItem = cart.find((item) => item.id === productId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }
  renderCart();
  openCart();
}

function changeQuantity(productId, change) {
  const item = cart.find((entry) => entry.id === productId);
  if (!item) return;
  item.quantity += change;
  if (item.quantity <= 0) {
    removeFromCart(productId);
    return;
  }
  renderCart();
}

function removeFromCart(productId) {
  const index = cart.findIndex((item) => item.id === productId);
  if (index !== -1) {
    cart.splice(index, 1);
    renderCart();
  }
}

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
  authStatus.classList.toggle('hidden', !currentUser);
  logoutButton.classList.toggle('hidden', !currentUser);
  loginButton.classList.toggle('hidden', Boolean(currentUser));
  authUserName.textContent = currentUser ? currentUser.name.split(' ')[0] : '';
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
    addToCart(Number(addButton.dataset.add));
    return;
  }

  const qtyButton = event.target.closest('[data-qty]');
  if (qtyButton) {
    changeQuantity(Number(qtyButton.dataset.qty), Number(qtyButton.dataset.change));
    return;
  }

  const removeButton = event.target.closest('[data-remove]');
  if (removeButton) {
    removeFromCart(Number(removeButton.dataset.remove));
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
logoutButton.addEventListener('click', async () => {
  try {
    await authRequest('/api/auth/logout', {});
    currentUser = null;
    updateAuthState();
    showToast('Has cerrado sesión.');
  } catch (error) {
    showToast(error.message);
  }
});
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
products.forEach((product) => {
  commentProduct.append(new Option(product.name, product.id));
});

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
renderCategories();
renderProducts();
renderCart();
loadComments();
