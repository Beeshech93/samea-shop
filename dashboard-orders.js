// Pedidos y envíos del panel. Usa adminRequest, showToast, formatCurrency y setText de dashboard.js.

const ORDER_STATUS_CLASS = {
  pending_payment: 'status-warn',
  paid: 'status-progress',
  preparing: 'status-progress',
  shipped: 'status-progress',
  delivered: 'status-ok',
  cancelled: 'status-cancel',
};
const OPEN_STATUSES = ['pending_payment', 'paid', 'preparing'];

let adminOrders = [];
let orderCarriers = {};
let selectedOrderId = null;
let shippingZones = [];
let allStates = [];
let editingZoneId = null;

const ordersTable = document.getElementById('ordersTable');
const orderDetail = document.getElementById('orderDetail');
const ordersFilter = document.getElementById('ordersFilter');

function node(tag, props = {}, children = []) {
  const element = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}

const formatDateTime = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

function paymentLabel(order) {
  if (order.paymentMethod === 'transfer') return 'Transferencia';
  return order.stripeMethod === 'oxxo' ? 'OXXO (Stripe)' : 'Tarjeta (Stripe)';
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ---------- Pedidos ----------

function renderOrderKpis() {
  const open = adminOrders.filter((order) => OPEN_STATUSES.includes(order.status));
  const toShip = open.filter((order) => order.status !== 'pending_payment').length;
  setText('kpiOpenOrders', open.length);
  setText('kpiOpenOrdersNote', `${toShip} por enviar · ${open.length - toShip} esperando pago`);

  const now = new Date();
  const paidThisMonth = adminOrders.filter((order) => {
    if (!order.paidAt || order.status === 'cancelled') return false;
    const paid = new Date(order.paidAt);
    return paid.getFullYear() === now.getFullYear() && paid.getMonth() === now.getMonth();
  });
  setText('kpiSales', formatCurrency(paidThisMonth.reduce((sum, order) => sum + order.total, 0)));
  setText('kpiSalesNote', `${paidThisMonth.length} ${paidThisMonth.length === 1 ? 'pedido pagado' : 'pedidos pagados'} este mes`);
}

function visibleOrders() {
  const filter = ordersFilter.value;
  if (filter === 'all') return adminOrders;
  if (filter === 'open') return adminOrders.filter((order) => OPEN_STATUSES.includes(order.status));
  return adminOrders.filter((order) => order.status === filter);
}

function renderOrdersTable() {
  const list = visibleOrders();
  setText('ordersSummary', `${list.length} de ${adminOrders.length}`);
  ordersTable.innerHTML = '';
  if (list.length === 0) {
    const cell = ordersTable.insertRow().insertCell();
    cell.colSpan = 5;
    cell.className = 'comment-empty';
    cell.textContent = adminOrders.length ? 'No hay pedidos con este filtro.' : 'Todavía no hay pedidos.';
    return;
  }
  list.forEach((order) => {
    const row = ordersTable.insertRow();
    if (order.id === selectedOrderId) row.className = 'is-selected';
    row.insertCell().append(
      node('strong', { textContent: order.code }),
      node('small', { className: 'muted-line', textContent: formatDateTime(order.createdAt) })
    );
    row.insertCell().append(
      node('span', { textContent: order.name }),
      node('small', { className: 'muted-line', textContent: `${order.address.city}, ${order.address.state}` })
    );
    row.insertCell().append(
      node('strong', { textContent: formatCurrency(order.total) }),
      node('small', { className: 'muted-line', textContent: paymentLabel(order) })
    );
    const statusCell = row.insertCell();
    statusCell.append(node('span', { className: `status ${ORDER_STATUS_CLASS[order.status] || ''}`, textContent: order.statusLabel }));
    if (order.status === 'pending_payment' && order.paymentMethod === 'transfer' && daysSince(order.createdAt) >= 3) {
      statusCell.append(node('small', { className: 'muted-line low', textContent: `hace ${daysSince(order.createdAt)} días` }));
    }
    const actions = row.insertCell();
    actions.className = 'row-actions';
    const open = node('button', { type: 'button', className: 'text-button', textContent: 'Ver' });
    open.dataset.openOrder = order.id;
    actions.append(open);
  });
}

async function loadAdminOrders() {
  const data = await adminRequest('GET', null, '/api/admin/orders');
  adminOrders = data.orders;
  orderCarriers = data.carriers;
  renderOrdersTable();
  renderOrderKpis();
  if (selectedOrderId) {
    const still = adminOrders.find((order) => order.id === selectedOrderId);
    if (still) openOrder(still.id);
    else closeOrder();
  }
}

function closeOrder() {
  selectedOrderId = null;
  orderDetail.classList.add('hidden');
  orderDetail.innerHTML = '';
  renderOrdersTable();
}

function orderActionButton(label, action, className = 'btn btn-primary btn-small') {
  const button = node('button', { type: 'button', className, textContent: label });
  button.dataset.orderAction = action;
  return button;
}

async function openOrder(id) {
  selectedOrderId = id;
  renderOrdersTable();
  let order;
  try {
    ({ order } = await adminRequest('GET', null, `/api/admin/orders?id=${id}`));
  } catch (error) {
    showToast(error.message);
    return;
  }
  orderDetail.innerHTML = '';
  orderDetail.classList.remove('hidden');

  const head = node('div', { className: 'order-detail-head' }, [
    node('h3', { textContent: `${order.code} · ${order.name}` }),
    node('span', { className: `status ${ORDER_STATUS_CLASS[order.status] || ''}`, textContent: order.statusLabel }),
    node('button', { type: 'button', className: 'text-button', textContent: 'Cerrar' }),
  ]);
  head.lastChild.dataset.closeOrder = '1';

  // Productos
  const items = node('ul', { className: 'summary-lines' });
  order.items.forEach((item) => {
    items.append(node('li', {}, [
      item.image ? node('img', { src: item.image, alt: '' }) : node('span'),
      node('div', {}, [
        node('strong', { textContent: item.name }),
        node('small', { textContent: `${item.size ? `Talla ${item.size} · ` : ''}${item.quantity} × ${formatCurrency(item.unitPrice)}` }),
      ]),
      node('span', { textContent: formatCurrency(item.lineTotal) }),
    ]));
  });
  const totals = node('p', { className: 'muted-line' });
  totals.textContent = `Subtotal ${formatCurrency(order.subtotal)}${order.discount ? ` · Descuento −${formatCurrency(order.discount)}${order.promoCode ? ` (${order.promoCode})` : ''}` : ''} · Envío ${order.shippingCost ? formatCurrency(order.shippingCost) : 'gratis'} · Total ${formatCurrency(order.total)}`;

  // Dirección
  const a = order.address;
  const addressText = [order.name, a.street, `${a.neighborhood}, C.P. ${a.zip}`, `${a.city}, ${a.state}`, a.notes ? `Ref.: ${a.notes}` : '', `Tel. ${order.phone}`]
    .filter(Boolean).join('\n');
  const address = node('pre', { className: 'address-box', textContent: addressText });
  const copy = node('button', { type: 'button', className: 'text-button', textContent: 'Copiar dirección' });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(addressText);
      showToast('Dirección copiada.');
    } catch {
      showToast('No se pudo copiar.');
    }
  });
  const contact = node('p', { className: 'muted-line' });
  const mail = node('a', { href: `mailto:${order.email}`, textContent: order.email });
  contact.append(mail, ` · ${order.shippingZone} (${order.shippingDays}) · ${paymentLabel(order)}`);
  if (order.status === 'pending_payment' && order.stripeMethod === 'oxxo' && order.oxxoExpiresAt) {
    contact.append(node('br'), `Ficha OXXO vence el ${formatDateTime(order.oxxoExpiresAt)}`);
  }

  // Acciones según el estado
  const actions = node('div', { className: 'order-actions' });
  if (order.status === 'pending_payment') {
    actions.append(order.paymentMethod === 'transfer'
      ? orderActionButton('Marcar como pagado', 'mark_paid')
      : orderActionButton('Verificar pago con Stripe', 'verify_payment'));
  }
  if (order.status === 'paid') actions.append(orderActionButton('Empezar a preparar', 'preparing'));
  if (order.status === 'shipped') actions.append(orderActionButton('Marcar como entregado', 'deliver'));
  if (OPEN_STATUSES.includes(order.status)) actions.append(orderActionButton('Cancelar pedido', 'cancel', 'text-button danger-link'));

  let shipForm = null;
  if (['paid', 'preparing'].includes(order.status)) {
    const carrier = node('select', { name: 'carrier' });
    carrier.append(new Option('Elige paquetería', ''));
    Object.entries(orderCarriers).forEach(([key, label]) => carrier.append(new Option(label, key)));
    shipForm = node('form', { className: 'ship-form' }, [
      node('h4', { textContent: 'Enviar pedido' }),
      node('label', { className: 'form-field' }, [node('span', { textContent: 'Paquetería' }), carrier]),
      node('label', { className: 'form-field' }, [node('span', { textContent: 'Número de guía' }), node('input', { name: 'trackingNumber', maxLength: 60, required: true })]),
      node('label', { className: 'form-field' }, [node('span', { textContent: 'Enlace de rastreo (opcional)' }), node('input', { name: 'trackingUrl', type: 'url', placeholder: 'https://…' })]),
      node('button', { type: 'submit', className: 'btn btn-primary btn-small', textContent: 'Marcar como enviado' }),
    ]);
    shipForm.addEventListener('submit', (event) => {
      event.preventDefault();
      runOrderAction(order.id, 'ship', {
        carrier: shipForm.carrier.value,
        trackingNumber: shipForm.trackingNumber.value,
        trackingUrl: shipForm.trackingUrl.value.trim(),
      });
    });
  }

  if (order.trackingNumber) {
    const tracking = node('p', {}, [`Guía: ${order.carrier || ''} ${order.trackingNumber} `]);
    if (order.trackingUrl) tracking.append(node('a', { href: order.trackingUrl, target: '_blank', rel: 'noopener', textContent: 'Rastrear' }));
    actions.prepend(tracking);
  }

  // Historial
  const history = node('ul', { className: 'order-history' });
  order.events.slice().reverse().forEach((event) => {
    const li = node('li', {}, [node('strong', { textContent: event.label }), node('small', { textContent: formatDateTime(event.at) })]);
    if (event.note) li.append(node('p', { textContent: event.note }));
    history.append(li);
  });

  // Notas internas
  const notes = node('textarea', { rows: 3, maxLength: 1000, value: order.adminNotes || '', placeholder: 'Notas internas (la clienta no las ve)' });
  const saveNotes = node('button', { type: 'button', className: 'btn btn-ghost btn-small', textContent: 'Guardar notas' });
  saveNotes.addEventListener('click', () => runOrderAction(order.id, 'notes', { adminNotes: notes.value }));

  orderDetail.append(
    head,
    node('div', { className: 'order-detail-grid' }, [
      node('div', {}, [node('h4', { textContent: 'Productos' }), items, totals, node('h4', { textContent: 'Historial' }), history]),
      node('div', {}, [
        node('h4', { textContent: 'Envío' }), address, copy, contact,
        actions,
        ...(shipForm ? [shipForm] : []),
        node('h4', { textContent: 'Notas internas' }),
        node('label', { className: 'form-field' }, [notes]),
        saveNotes,
      ]),
    ])
  );
  orderDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const ACTION_CONFIRM = {
  mark_paid: '¿Confirmas que recibiste la transferencia de este pedido?',
  cancel: '¿Cancelar este pedido? El stock de sus productos se devolverá al inventario.',
  deliver: '¿Marcar el pedido como entregado?',
};
const ACTION_DONE = {
  mark_paid: 'Pedido marcado como pagado.',
  verify_payment: 'Pago verificado con Stripe.',
  preparing: 'Pedido en preparación.',
  ship: 'Pedido marcado como enviado.',
  deliver: 'Pedido entregado.',
  cancel: 'Pedido cancelado y stock devuelto.',
  notes: 'Notas guardadas.',
};

async function runOrderAction(id, action, extra = {}) {
  if (ACTION_CONFIRM[action] && !confirm(ACTION_CONFIRM[action])) return;
  try {
    const result = await adminRequest('PATCH', { id, action, ...extra }, '/api/admin/orders');
    showToast(result.message || ACTION_DONE[action] || 'Listo.');
    await loadAdminOrders();
    if (['cancel', 'ship'].includes(action) && typeof loadCatalogAdmin === 'function') loadCatalogAdmin();
  } catch (error) {
    showToast(error.message);
  }
}

ordersFilter.addEventListener('change', renderOrdersTable);

ordersTable.addEventListener('click', (event) => {
  const button = event.target.closest('[data-open-order]');
  if (button) openOrder(Number(button.dataset.openOrder));
});

orderDetail.addEventListener('click', (event) => {
  if (event.target.closest('[data-close-order]')) {
    closeOrder();
    return;
  }
  const button = event.target.closest('[data-order-action]');
  if (button && selectedOrderId) runOrderAction(selectedOrderId, button.dataset.orderAction);
});

// ---------- Envíos ----------

const zoneForm = document.getElementById('zoneForm');
const zonesTable = document.getElementById('zonesTable');

function renderCoverage() {
  const covered = new Set(shippingZones.filter((zone) => zone.active).flatMap((zone) => zone.states));
  const missing = allStates.filter((state) => !covered.has(state));
  const note = document.getElementById('coverageNote');
  note.textContent = missing.length
    ? `Sin envío a: ${missing.join(', ')}. Las clientas de esos estados no podrán comprar.`
    : 'Envías a los 32 estados de México.';
  note.classList.toggle('low', missing.length > 0);
}

function renderZones() {
  zonesTable.innerHTML = '';
  if (shippingZones.length === 0) {
    const cell = zonesTable.insertRow().insertCell();
    cell.colSpan = 6;
    cell.className = 'comment-empty';
    cell.textContent = 'No hay zonas de envío.';
  }
  shippingZones.forEach((zone) => {
    const row = zonesTable.insertRow();
    row.insertCell().append(node('strong', { textContent: zone.name }));
    const states = row.insertCell();
    states.append(node('span', { textContent: `${zone.states.length} estados` }), node('small', { className: 'muted-line', textContent: zone.states.join(', ') }));
    states.className = 'states-cell';
    row.insertCell().append(
      node('strong', { textContent: formatCurrency(zone.price) }),
      node('small', { className: 'muted-line', textContent: zone.freeFrom !== null ? `Gratis desde ${formatCurrency(zone.freeFrom)}` : 'Sin envío gratis' })
    );
    row.insertCell().textContent = zone.daysMin === zone.daysMax ? `${zone.daysMin} días` : `${zone.daysMin}–${zone.daysMax} días`;
    row.insertCell().append(node('span', { className: `status ${zone.active ? 'status-ok' : 'status-warn'}`, textContent: zone.active ? 'Activa' : 'Pausada' }));
    const actions = row.insertCell();
    actions.className = 'row-actions';
    const edit = node('button', { type: 'button', className: 'text-button', textContent: 'Editar' });
    edit.dataset.editZone = zone.id;
    const remove = node('button', { type: 'button', className: 'text-button', textContent: 'Eliminar' });
    remove.dataset.deleteZone = zone.id;
    actions.append(edit, remove);
  });
  renderCoverage();
}

function renderStatesPicker(selected = []) {
  const takenBy = new Map();
  shippingZones
    .filter((zone) => zone.active && zone.id !== editingZoneId)
    .forEach((zone) => zone.states.forEach((state) => takenBy.set(state, zone.name)));
  const picker = document.getElementById('statesPicker');
  picker.innerHTML = '';
  allStates.forEach((state) => {
    const input = node('input', { type: 'checkbox', value: state, checked: selected.includes(state) });
    const label = node('label', { className: 'check-field' }, [input, node('span', { textContent: state })]);
    if (takenBy.has(state)) {
      label.append(node('small', { className: 'muted-line', textContent: `(${takenBy.get(state)})` }));
      label.classList.add('is-taken');
    }
    picker.append(label);
  });
}

function openZoneForm(zone = null) {
  editingZoneId = zone ? zone.id : null;
  zoneForm.reset();
  document.getElementById('zoneFormTitle').textContent = zone ? `Editar: ${zone.name}` : 'Nueva zona';
  if (zone) {
    zoneForm.zoneName.value = zone.name;
    zoneForm.price.value = zone.price;
    zoneForm.freeFrom.value = zone.freeFrom ?? '';
    zoneForm.daysMin.value = zone.daysMin;
    zoneForm.daysMax.value = zone.daysMax;
    zoneForm.active.checked = zone.active;
  }
  renderStatesPicker(zone ? zone.states : []);
  zoneForm.classList.remove('hidden');
  zoneForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadShipping() {
  const data = await adminRequest('GET', null, '/api/admin/shipping');
  shippingZones = data.zones;
  allStates = data.states;
  renderZones();
}

zoneForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    name: zoneForm.zoneName.value,
    price: Number(zoneForm.price.value),
    freeFrom: zoneForm.freeFrom.value === '' ? null : Number(zoneForm.freeFrom.value),
    daysMin: Number(zoneForm.daysMin.value),
    daysMax: Number(zoneForm.daysMax.value),
    active: zoneForm.active.checked,
    states: [...zoneForm.querySelectorAll('#statesPicker input:checked')].map((input) => input.value),
  };
  if (editingZoneId) body.id = editingZoneId;
  try {
    await adminRequest(editingZoneId ? 'PATCH' : 'POST', body, '/api/admin/shipping');
    showToast(editingZoneId ? 'Zona actualizada.' : 'Zona creada.');
    zoneForm.classList.add('hidden');
    await loadShipping();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('newZoneButton').addEventListener('click', () => openZoneForm());

zonesTable.addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-zone]');
  if (edit) {
    openZoneForm(shippingZones.find((zone) => zone.id === Number(edit.dataset.editZone)));
    return;
  }
  const remove = event.target.closest('[data-delete-zone]');
  if (!remove) return;
  const zone = shippingZones.find((z) => z.id === Number(remove.dataset.deleteZone));
  if (!zone || !confirm(`¿Eliminar la zona «${zone.name}»? Sus estados se quedarán sin envío.`)) return;
  try {
    await adminRequest('DELETE', { id: zone.id }, '/api/admin/shipping');
    showToast('Zona eliminada.');
    await loadShipping();
  } catch (error) {
    showToast(error.message);
  }
});

// ---------- Pagos ----------

const paymentsForm = document.getElementById('paymentsForm');

async function loadPayments() {
  const settings = await adminRequest('GET', null, '/api/admin/payments');
  paymentsForm.installments.checked = settings.installments;
  paymentsForm.oxxo.checked = settings.oxxo;
  paymentsForm.message.value = settings.message || '';
  paymentsForm.bankDetails.value = settings.bankDetails || '';
  const status = document.getElementById('stripeStatus');
  status.textContent = settings.stripeConfigured ? 'Stripe conectado' : 'Stripe sin configurar';
  status.className = `status ${settings.stripeConfigured ? 'status-ok' : 'status-warn'}`;
}

paymentsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await adminRequest('PUT', {
      installments: paymentsForm.installments.checked,
      oxxo: paymentsForm.oxxo.checked,
      message: paymentsForm.message.value,
      bankDetails: paymentsForm.bankDetails.value,
    }, '/api/admin/payments');
    showToast('Ajustes de pago guardados. Se aplican desde el próximo pedido.');
  } catch (error) {
    showToast(error.message);
  }
});

// Llamada desde dashboard.js al iniciar sesión.
function loadOrdersAdmin() {
  return Promise.all([loadAdminOrders(), loadShipping(), loadPayments()]);
}
