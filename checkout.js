const CART_STORAGE = 'samea_cart';
const $ = (id) => document.getElementById(id);
const form = $('checkoutForm');

let cartItems = [];
let promoCode = '';
let lastQuote = null;

function formatCurrency(value) {
  return Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

let toastTimer;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), Math.max(3200, message.length * 70));
}

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE) || 'null');
    return saved && Array.isArray(saved.items) ? saved : { items: [], code: '' };
  } catch {
    return { items: [], code: '' };
  }
}

function writeCart() {
  try {
    localStorage.setItem(CART_STORAGE, JSON.stringify({ items: cartItems, code: promoCode }));
  } catch {
    // Sin almacenamiento: el carrito no se recuerda.
  }
}

async function api(path, body) {
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

const itemsPayload = () => cartItems.map((item) => ({ productId: item.id, size: item.size, quantity: item.quantity }));

function renderSummary(quote) {
  const list = $('summaryLines');
  list.innerHTML = '';
  quote.lines.forEach((line) => {
    const li = document.createElement('li');
    if (line.image) {
      const img = document.createElement('img');
      img.src = line.image;
      img.alt = '';
      li.append(img);
    } else {
      li.append(document.createElement('span'));
    }
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = line.name;
    const meta = document.createElement('small');
    meta.textContent = `${line.size ? `Talla ${line.size} · ` : ''}${line.quantity} × ${formatCurrency(line.unitPrice)}`;
    info.append(name, meta);
    const total = document.createElement('span');
    total.textContent = formatCurrency(line.lineTotal);
    li.append(info, total);
    list.append(li);
  });

  $('sumSubtotal').textContent = formatCurrency(quote.subtotal);
  $('sumDiscountRow').classList.toggle('hidden', !quote.discount);
  $('sumDiscount').textContent = `−${formatCurrency(quote.discount)}`;
  $('sumDiscountLabel').textContent = quote.promotion ? `Descuento (${quote.promotion.code})` : 'Descuento';

  const note = $('shippingNote');
  if (quote.shipping) {
    $('sumShipping').textContent = quote.shipping.cost === 0 ? 'Gratis' : formatCurrency(quote.shipping.cost);
    const free = quote.shipping.cost > 0 && quote.shipping.freeFrom !== null
      ? ` · Gratis desde ${formatCurrency(quote.shipping.freeFrom)}`
      : '';
    note.textContent = `${quote.shipping.zone}: entrega en ${quote.shipping.days}${free}.`;
    note.classList.remove('is-error');
  } else {
    $('sumShipping').textContent = '—';
    note.textContent = quote.shippingError || 'Elige tu estado para calcular el envío.';
    note.classList.toggle('is-error', Boolean(quote.shippingError));
  }
  $('sumTotal').textContent = formatCurrency(quote.total);

  const status = $('checkoutPromoStatus');
  status.className = 'promo-status';
  status.textContent = '';
  if (quote.promotion) {
    status.textContent = `✓ ${quote.promotion.code}: ${quote.promotion.description}`;
    status.classList.add('is-ok');
  } else if (quote.promoError && promoCode) {
    status.textContent = quote.promoError;
    status.classList.add('is-error');
  }
}

let quoteRequest = 0;
async function refreshQuote() {
  const requestId = ++quoteRequest;
  try {
    const quote = await api('/api/orders/quote', { items: itemsPayload(), code: promoCode, state: form.state.value });
    if (requestId !== quoteRequest) return;
    lastQuote = quote;
    if (promoCode && !quote.promotion) {
      promoCode = '';
      writeCart();
    }
    renderSummary(quote);
  } catch (error) {
    if (requestId !== quoteRequest) return;
    showToast(error.message);
  }
}

$('applyPromo').addEventListener('click', () => {
  const code = $('checkoutPromo').value.trim().toUpperCase();
  if (!code) return;
  promoCode = code;
  $('checkoutPromo').value = '';
  writeCart();
  refreshQuote().then(() => {
    // Si el código no era válido, mostrar el motivo aunque ya se haya quitado.
    if (lastQuote && !lastQuote.promotion && lastQuote.promoError) {
      const status = $('checkoutPromoStatus');
      status.textContent = lastQuote.promoError;
      status.className = 'promo-status is-error';
    }
  });
});

form.state.addEventListener('change', refreshQuote);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const method = form.paymentMethod.value;
  if (!method) {
    showToast('Elige cómo quieres pagar.');
    return;
  }
  const customer = Object.fromEntries(
    ['name', 'email', 'phone', 'street', 'neighborhood', 'zip', 'city', 'state', 'addressNotes'].map((field) => [field, form[field].value])
  );
  const button = $('placeOrder');
  button.disabled = true;
  button.textContent = method === 'card' ? 'Abriendo pago seguro…' : 'Creando pedido…';
  try {
    const result = await api('/api/orders/create', { customer, items: itemsPayload(), code: promoCode, paymentMethod: method });
    if (method === 'transfer') {
      // El pedido ya existe: el carrito se vacía. Con tarjeta se vacía al confirmarse el pago.
      cartItems = [];
      promoCode = '';
      writeCart();
    }
    window.location.href = result.redirectUrl;
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
    button.textContent = 'Confirmar pedido';
  }
});

// Vuelta desde Stripe sin pagar: se cancela ese pedido para liberar el stock.
async function handleCancelledPayment() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('cancelado');
  const token = params.get('t');
  if (!code || !token) return;
  history.replaceState(null, '', window.location.pathname);
  try {
    await api('/api/orders/abandon', { c: code, t: token });
  } catch {
    // Si falla, el pedido caduca solo en una hora.
  }
  showToast('El pago no se completó y no se hizo ningún cargo. Puedes intentarlo de nuevo.');
}

async function init() {
  const saved = readCart();
  cartItems = saved.items;
  promoCode = saved.code || '';
  await handleCancelledPayment();

  if (cartItems.length === 0) {
    $('checkoutEmpty').classList.remove('hidden');
    return;
  }
  form.classList.remove('hidden');

  try {
    const options = await api('/api/orders/options');
    options.states.forEach((state) => form.state.append(new Option(state, state)));
    $('payCard').classList.toggle('hidden', !options.payments.card);
    const extras = [options.payments.installments && 'meses sin intereses', options.payments.oxxo && 'efectivo en OXXO'].filter(Boolean);
    if (extras.length) {
      $('payCardTitle').textContent = options.payments.oxxo ? 'Tarjeta u OXXO' : 'Tarjeta de crédito o débito';
      $('payCardText').textContent = `Pago seguro con Stripe: tarjeta${extras.length ? `, ${extras.join(' o ')}` : ''}. Tus datos no pasan por SAMÉA.`;
    }
    $('payTransfer').classList.toggle('hidden', !options.payments.transfer);
    const available = ['card', 'transfer'].filter((method) => options.payments[method]);
    if (available.length === 1) form.querySelector(`input[value="${available[0]}"]`).checked = true;
    if (available.length === 0) {
      $('payUnavailable').classList.remove('hidden');
      $('placeOrder').disabled = true;
    }
  } catch (error) {
    showToast(error.message);
  }

  try {
    const { user } = await api('/api/auth/me');
    if (user) {
      form.name.value ||= user.name;
      form.email.value ||= user.email;
    }
  } catch {
    // Sin sesión: se compra como invitada.
  }

  refreshQuote();
}

init();
