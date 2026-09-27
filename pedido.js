const $ = (id) => document.getElementById(id);
const STEPS = ['pending_payment', 'paid', 'preparing', 'shipped', 'delivered'];
const STEP_LABELS = {
  pending_payment: 'Pago',
  paid: 'Pagado',
  preparing: 'Preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
};
const STATUS_CLASS = {
  pending_payment: 'status-warn',
  paid: 'status-progress',
  preparing: 'status-progress',
  shipped: 'status-progress',
  delivered: 'status-ok',
  cancelled: 'status-cancel',
};
const STATUS_TEXT = {
  pending_payment: 'Esperando tu pago.',
  paid: 'Recibimos tu pago. Pronto prepararemos tu pedido.',
  preparing: 'Estamos preparando tu pedido.',
  shipped: 'Tu pedido va en camino.',
  delivered: '¡Tu pedido fue entregado! Gracias por comprar en SAMÉA.',
  cancelled: 'Este pedido fue cancelado y no se hizo ningún cargo pendiente.',
};

function formatCurrency(value) {
  return Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

const formatDate = (iso, withTime = false) => new Date(iso).toLocaleString('es-MX', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' });

let toastTimer;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), Math.max(3200, message.length * 70));
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo conectar con el servidor.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function show(id) {
  ['orderView', 'myOrders', 'lookup'].forEach((section) => $(section).classList.toggle('hidden', section !== id));
}

function renderSteps(order) {
  const list = $('orderSteps');
  list.innerHTML = '';
  list.classList.toggle('hidden', order.status === 'cancelled');
  const current = STEPS.indexOf(order.status);
  STEPS.forEach((step, index) => {
    const li = document.createElement('li');
    li.textContent = STEP_LABELS[step];
    if (index < current) li.className = 'done';
    if (index === current) li.className = 'current';
    list.append(li);
  });
}

function renderOrder(order) {
  show('orderView');
  document.title = `Pedido ${order.code} · SAMÉA`;
  $('orderCode').textContent = order.code;
  $('orderDate').textContent = `Realizado el ${formatDate(order.createdAt)}`;
  const status = $('orderStatus');
  status.textContent = order.statusLabel;
  status.className = `status ${STATUS_CLASS[order.status] || ''}`;
  $('orderStatusText').textContent = STATUS_TEXT[order.status] || '';
  renderSteps(order);

  const waitingTransfer = order.status === 'pending_payment' && order.paymentMethod === 'transfer';
  $('bankBox').classList.toggle('hidden', !waitingTransfer || !order.bankDetails);
  $('bankDetails').textContent = order.bankDetails || '';
  $('bankAmount').textContent = formatCurrency(order.total);
  $('bankConcept').textContent = order.code;
  const waitingOxxo = order.status === 'pending_payment' && order.stripeMethod === 'oxxo' && Boolean(order.oxxoVoucherUrl);
  $('oxxoBox').classList.toggle('hidden', !waitingOxxo);
  if (waitingOxxo) {
    $('oxxoLink').href = order.oxxoVoucherUrl;
    $('oxxoAmount').textContent = formatCurrency(order.total);
    $('oxxoExpires').textContent = order.oxxoExpiresAt ? ` antes del ${formatDate(order.oxxoExpiresAt, true)}` : '';
  }
  $('cardPendingBox').classList.toggle('hidden', !(order.status === 'pending_payment' && order.paymentMethod === 'card' && !waitingOxxo));

  const hasTracking = Boolean(order.trackingNumber) && ['shipped', 'delivered'].includes(order.status);
  $('trackingBox').classList.toggle('hidden', !hasTracking);
  $('trackCarrier').textContent = order.carrier || '';
  $('trackNumber').textContent = order.trackingNumber || '';
  const link = $('trackLink');
  link.classList.toggle('hidden', !order.trackingUrl);
  if (order.trackingUrl) link.href = order.trackingUrl;

  const lines = $('orderLines');
  lines.innerHTML = '';
  order.items.forEach((item) => {
    const li = document.createElement('li');
    if (item.image) {
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = '';
      li.append(img);
    } else {
      li.append(document.createElement('span'));
    }
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name;
    const meta = document.createElement('small');
    meta.textContent = `${item.size ? `Talla ${item.size} · ` : ''}${item.quantity} × ${formatCurrency(item.unitPrice)}`;
    info.append(name, meta);
    const total = document.createElement('span');
    total.textContent = formatCurrency(item.lineTotal);
    li.append(info, total);
    lines.append(li);
  });
  $('oSubtotal').textContent = formatCurrency(order.subtotal);
  $('oDiscountRow').classList.toggle('hidden', !order.discount);
  $('oDiscount').textContent = `−${formatCurrency(order.discount)}`;
  $('oDiscountLabel').textContent = order.promoCode ? `Descuento (${order.promoCode})` : 'Descuento';
  $('oShipping').textContent = order.shippingCost ? formatCurrency(order.shippingCost) : 'Gratis';
  $('oTotal').textContent = formatCurrency(order.total);

  const a = order.address;
  $('oAddress').textContent = [order.name, a.street, `${a.neighborhood}, C.P. ${a.zip}`, `${a.city}, ${a.state}`, a.notes ? `Ref.: ${a.notes}` : '', order.phone]
    .filter(Boolean).join('\n');
  const payLabel = order.paymentMethod === 'transfer' ? 'transferencia' : order.stripeMethod === 'oxxo' ? 'OXXO' : 'tarjeta';
  $('oShippingInfo').textContent = `${order.shippingZone} · entrega estimada en ${order.shippingDays} · pago con ${payLabel}`;

  const history = $('orderHistory');
  history.innerHTML = '';
  order.events.slice().reverse().forEach((event) => {
    const li = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = event.label;
    const when = document.createElement('small');
    when.textContent = formatDate(event.at, true);
    li.append(label, when);
    if (event.note) {
      const note = document.createElement('p');
      note.textContent = event.note;
      li.append(note);
    }
    history.append(li);
  });
}

function clearCart() {
  try {
    localStorage.removeItem('samea_cart');
  } catch {
    // Sin almacenamiento: nada que limpiar.
  }
}

// Vuelta desde Stripe: el webhook puede tardar unos segundos; se reintenta.
async function loadOrder(code, token, cameFromPayment) {
  for (let attempt = 0; attempt < (cameFromPayment ? 5 : 1); attempt += 1) {
    const { order } = await api(`/api/orders/track?${new URLSearchParams(token ? { c: code, t: token } : { c: code })}`);
    renderOrder(order);
    const oxxoPending = order.status === 'pending_payment' && order.stripeMethod === 'oxxo';
    if (!cameFromPayment || order.status !== 'pending_payment' || oxxoPending) {
      if (cameFromPayment && order.status !== 'cancelled') clearCart();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

async function loadMine() {
  try {
    const { orders } = await api('/api/orders/mine');
    if (orders.length === 0) return false;
    show('myOrders');
    const list = $('myOrdersList');
    list.innerHTML = '';
    orders.forEach((order) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/pedido?c=${encodeURIComponent(order.code)}`;
      const code = document.createElement('strong');
      code.textContent = order.code;
      const date = document.createElement('small');
      date.textContent = `${formatDate(order.createdAt)} · ${order.items.reduce((sum, item) => sum + item.quantity, 0)} piezas`;
      const status = document.createElement('span');
      status.className = `status ${STATUS_CLASS[order.status] || ''}`;
      status.textContent = order.statusLabel;
      const total = document.createElement('span');
      total.textContent = formatCurrency(order.total);
      link.append(code, date, status, total);
      li.append(link);
      list.append(li);
    });
    return true;
  } catch {
    return false;
  }
}

$('lookupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const { order } = await api('/api/orders/track', { c: form.code.value.trim().toUpperCase(), email: form.email.value.trim() });
    renderOrder(order);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('c');
  const token = params.get('t');
  const cameFromPayment = params.get('pago') === 'ok';
  if (code) {
    try {
      await loadOrder(code, token, cameFromPayment);
      if (cameFromPayment) history.replaceState(null, '', `/pedido?c=${encodeURIComponent(code)}${token ? `&t=${encodeURIComponent(token)}` : ''}`);
      return;
    } catch (error) {
      showToast(error.status === 404 ? 'Para ver este pedido escribe el número y tu correo.' : error.message);
      $('lookupForm').code.value = code;
    }
  } else if (await loadMine()) {
    return;
  }
  show('lookup');
}

init();
