const products = [
  {
    id: 1,
    name: 'Tanga de encaje blanca',
    description: 'Tanga de encaje blanco con detalle floral y corte minimalista; tejido elástico y acabado suave para máximo confort.',
    price: 159.00,
    image: 'https://img-va.myshopline.com/image/store/1728356136669/dc07d0df-6418-4c1d-a46d-558d027409e7_1080x.jpg?w=1080&h=1620&q=80',
  },
  {
    id: 2,
    name: 'Body Seducción Negro',
    description: 'Body negro con transparencias y encaje, tirantes finos y corte ceñido que realza la silueta.',
    price: 379.00,
    image: 'https://resources.sears.com.mx/products/cdn/product-channel/306368/2026/5/8/0129974d93f2abccc3fbeb69a1dba0d0.png?scale=500&qlty=75',
  },
  {
    id: 3,
    name: 'Braga Encaje Nude',
    description: 'Braga nude de encaje de talle medio; corte cómodo y costuras planas para un ajuste invisible bajo la ropa.',
    price: 89.00,
    image: 'https://img.staticdj.com/edc6f84fb342cdd85ff8cd0df4027f06_750x.jpeg',
  },
  {
    id: 4,
    name: 'Sujetador Básico Blanco',
    description: 'Sujetador blanco sin aros con copa suave y tirantes regulables; soporte cómodo para el uso diario.',
    price: 249.00,
    image: 'https://seuke.com/cdn/shop/files/SYV008056_WR-2_1000x.jpg?v=1760872505',
  },
  {
    id: 5,
    name: 'Conjunto Satén Vainilla',
    description: 'Conjunto de satén color vainilla compuesto por top y braga; tejido suave y brillo sutil para un look sofisticado.',
    price: 379.00,
    image: 'https://resources.sears.com.mx/products/cdn/product-channel/71222/2026/5/11/72c909836679bf15b5faf9040bcaf0e1.jpg?scale=500&qlty=75',
  },
  {
    id: 6,
    name: 'Top Bralette Lavanda',
    description: 'Bralette lavanda acolchado sin aro con tirantes finos; diseño cómodo y femenino ideal para uso diario.',
    price: 249.00,
    image: 'https://img.staticdj.com/3337be03f93c0ec540882b0a5cf26fe1_750x.jpeg',
  },
];

const logoMeta = {
  name: 'SAMÉA — Piel de Seda',
  description: 'Logotipo elegante en tonos rosa pálido y dorado que transmite sofisticación; representa una marca de lencería fina, femenina y con estilo.',
};

const cart = [];
const productGrid = document.getElementById('productGrid');
const cartButton = document.getElementById('cartButton');
const cartModal = document.getElementById('cartModal');
const closeCartButton = document.getElementById('closeCartButton');
const cartItemsContainer = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal');
const cartCount = document.getElementById('cartCount');
const checkoutButton = document.getElementById('checkoutButton');
const authModal = document.getElementById('authModal');
const loginButton = document.getElementById('loginButton');
const registerButton = document.getElementById('registerButton');
const logoutButton = document.getElementById('logoutButton');
const closeAuthButton = document.getElementById('closeAuthButton');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authStatus = document.getElementById('authStatus');
const authUserName = document.getElementById('authUserName');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const registerName = document.getElementById('registerName');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
const submitLogin = document.getElementById('submitLogin');
const submitRegister = document.getElementById('submitRegister');

function formatCurrency(value) {
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

function renderProducts() {
  productGrid.innerHTML = products
    .map(
      (product) => `
      <article class="product-card">
        ${product.image ? `<img src="${product.image}" alt="${product.name}" />` : ''}
        <div class="product-body">
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <div class="price">${formatCurrency(product.price)}</div>
          <button class="btn btn-primary" onclick="addToCart(${product.id})">Añadir al carrito</button>
        </div>
      </article>
    `
    )
    .join('');
}

function updateCartCount() {
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = totalQuantity;
}

function renderCart() {
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<p>Tu carrito está vacío. Añade algún artículo para continuar.</p>';
    cartTotal.textContent = formatCurrency(0);
    updateCartCount();
    return;
  }

  cartItemsContainer.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        ${item.image ? `<img src="${item.image}" alt="${item.name}" />` : ''}
        <div class="cart-item-details">
          <h4>${item.name}</h4>
          <p>${formatCurrency(item.price)} x ${item.quantity}</p>
          <div class="cart-item-actions">
            <button class="action-button" onclick="changeQuantity(${item.id}, -1)">-</button>
            <button class="action-button" onclick="changeQuantity(${item.id}, 1)">+</button>
            <button class="action-button" onclick="removeFromCart(${item.id})">Eliminar</button>
          </div>
        </div>
      </div>
    `
    )
    .join('');

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  cartTotal.textContent = formatCurrency(total);
  updateCartCount();
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
  const item = cart.find((item) => item.id === productId);
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

function openCart() {
  cartModal.classList.add('open');
  cartModal.setAttribute('aria-hidden', 'false');
}

function closeCart() {
  cartModal.classList.remove('open');
  cartModal.setAttribute('aria-hidden', 'true');
}

cartButton.addEventListener('click', openCart);
closeCartButton.addEventListener('click', closeCart);
checkoutButton.addEventListener('click', () => {
  if (cart.length === 0) {
    alert('Añade algún producto al carrito antes de finalizar la compra.');
    return;
  }

  const cardNumber = document.getElementById('cardNumber').value.trim();
  const cardName = document.getElementById('cardName').value.trim();
  const cardExpiry = document.getElementById('cardExpiry').value.trim();
  const cardCvc = document.getElementById('cardCvc').value.trim();

  if (!cardNumber || !cardName || !cardExpiry || !cardCvc) {
    alert('Completa todos los datos de la tarjeta para continuar.');
    return;
  }

  if (!/^\d{4} \d{4} \d{4} \d{4}$/.test(cardNumber)) {
    alert('Ingresa un número de tarjeta válido con el formato 0000 0000 0000 0000.');
    return;
  }

  if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
    alert('Ingresa la fecha de expiración en formato MM/AA.');
    return;
  }

  if (!/^\d{3,4}$/.test(cardCvc)) {
    alert('Ingresa un CVC válido de 3 o 4 dígitos.');
    return;
  }

  alert('¡Pago aceptado! Gracias por tu compra. Esta tienda es una demo y el pago no se procesará realmente.');
  cart.length = 0;
  renderCart();
  document.getElementById('cardNumber').value = '';
  document.getElementById('cardName').value = '';
  document.getElementById('cardExpiry').value = '';
  document.getElementById('cardCvc').value = '';
  closeCart();
});

function openAuthModal(defaultTab = 'login') {
  authModal.classList.add('open');
  authModal.setAttribute('aria-hidden', 'false');
  if (defaultTab === 'register') {
    switchToRegister();
  } else {
    switchToLogin();
  }
}

function closeAuthModal() {
  authModal.classList.remove('open');
  authModal.setAttribute('aria-hidden', 'true');
}

function switchToLogin() {
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
}

function switchToRegister() {
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
}

function getStoredUsers() {
  return JSON.parse(localStorage.getItem('sameaUsers') || '[]');
}

function setStoredUsers(users) {
  localStorage.setItem('sameaUsers', JSON.stringify(users));
}

function getCurrentUser() {
  return JSON.parse(localStorage.getItem('sameaCurrentUser') || 'null');
}

function setCurrentUser(user) {
  localStorage.setItem('sameaCurrentUser', JSON.stringify(user));
}

function clearCurrentUser() {
  localStorage.removeItem('sameaCurrentUser');
}

function updateAuthState() {
  const currentUser = getCurrentUser();
  if (currentUser) {
    authStatus.classList.remove('hidden');
    authUserName.textContent = currentUser.name;
    loginButton.classList.add('hidden');
    registerButton.classList.add('hidden');
    logoutButton.classList.remove('hidden');
  } else {
    authStatus.classList.add('hidden');
    authUserName.textContent = '';
    logoutButton.classList.add('hidden');
    loginButton.classList.remove('hidden');
    registerButton.classList.remove('hidden');
  }
}

function handleLogin() {
  const email = loginEmail.value.trim().toLowerCase();
  const password = loginPassword.value.trim();
  if (!email || !password) {
    alert('Completa correo y contraseña para iniciar sesión.');
    return;
  }

  const users = getStoredUsers();
  const user = users.find((item) => item.email === email && item.password === password);
  if (!user) {
    alert('Credenciales inválidas. Verifica tu correo y contraseña.');
    return;
  }

  setCurrentUser({ name: user.name, email: user.email });
  updateAuthState();
  closeAuthModal();
  alert(`Bienvenida, ${user.name}! Has iniciado sesión.`);
}

function handleRegister() {
  const name = registerName.value.trim();
  const email = registerEmail.value.trim().toLowerCase();
  const password = registerPassword.value.trim();
  const confirmPassword = registerPasswordConfirm.value.trim();

  if (!name || !email || !password || !confirmPassword) {
    alert('Completa todos los campos para registrarte.');
    return;
  }

  if (password !== confirmPassword) {
    alert('Las contraseñas no coinciden.');
    return;
  }

  const users = getStoredUsers();
  if (users.some((item) => item.email === email)) {
    alert('Ya existe una cuenta con ese correo electrónico. Usa otro correo o inicia sesión.');
    return;
  }

  const newUser = { name, email, password };
  users.push(newUser);
  setStoredUsers(users);
  setCurrentUser({ name, email });
  updateAuthState();
  closeAuthModal();
  alert(`Cuenta creada con éxito. Bienvenida, ${name}!`);
}

window.addEventListener('click', (event) => {
  if (event.target === cartModal) {
    closeCart();
  }
  if (event.target === authModal) {
    closeAuthModal();
  }
});

loginButton.addEventListener('click', () => openAuthModal('login'));
registerButton.addEventListener('click', () => openAuthModal('register'));
logoutButton.addEventListener('click', () => {
  clearCurrentUser();
  updateAuthState();
  alert('Has cerrado sesión.');
});
closeAuthButton.addEventListener('click', closeAuthModal);
loginTab.addEventListener('click', switchToLogin);
registerTab.addEventListener('click', switchToRegister);
submitLogin.addEventListener('click', handleLogin);
submitRegister.addEventListener('click', handleRegister);

updateAuthState();

renderProducts();
renderCart();
