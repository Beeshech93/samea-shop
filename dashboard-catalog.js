// Gestión de productos y promociones del panel (requiere sesión de administradora).
// Usa adminRequest, showToast, formatCurrency, renderDashboard e inventoryItems de dashboard.js.

const CATEGORY_LABELS = {
  sujetadores: 'Sujetadores',
  panties: 'Panties',
  conjuntos: 'Conjuntos',
  dormir: 'Dormir',
  accesorios: 'Accesorios',
};

const productForm = document.getElementById('productForm');
const promoForm = document.getElementById('promoForm');
const productsTable = document.getElementById('productsTable');
const promosTable = document.getElementById('promosTable');
let adminProducts = [];
let adminPromotions = [];
let editingProductId = null;
let editingPromoId = null;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function actionButton(label, dataset, className = 'text-button') {
  const button = el('button', { type: 'button', className, textContent: label });
  Object.assign(button.dataset, dataset);
  return button;
}

function emptyRow(tbody, colSpan, message) {
  const cell = tbody.insertRow().insertCell();
  cell.colSpan = colSpan;
  cell.className = 'comment-empty';
  cell.textContent = message;
}

// ---------- Productos ----------

function syncInventory() {
  inventoryItems = adminProducts.map((product) => ({ id: product.id, name: product.name, stock: product.stock }));
  const visible = adminProducts.filter((product) => product.active).length;
  setText('kpiProducts', visible);
  setText('kpiProductsNote', `${adminProducts.length - visible} ocultos · ${adminProducts.length} en total`);
  renderDashboard();
}

function renderProductsTable() {
  productsTable.innerHTML = '';
  if (adminProducts.length === 0) {
    emptyRow(productsTable, 6, 'Todavía no hay productos. Crea el primero con «Nuevo producto».');
    return;
  }
  adminProducts.forEach((product) => {
    const row = productsTable.insertRow();

    const info = el('div', { className: 'catalog-product' }, [
      product.image ? el('img', { src: product.image, alt: '', loading: 'lazy' }) : el('span', { className: 'thumb-empty' }),
      el('div', {}, [
        el('strong', { textContent: product.name }),
        el('small', { textContent: `${CATEGORY_LABELS[product.category] || product.category}${product.badge ? ` · ${product.badge}` : ''}` }),
      ]),
    ]);
    row.insertCell().append(info);

    const priceCell = row.insertCell();
    priceCell.append(el('strong', { textContent: formatCurrency(product.finalPrice) }));
    if (product.discountPercent > 0) {
      priceCell.append(el('small', { className: 'muted-line', textContent: `${formatCurrency(product.price)} · -${product.discountPercent}%` }));
    }

    row.insertCell().textContent = product.sizes.length ? product.sizes.join(', ') : '—';

    const stockCell = row.insertCell();
    stockCell.textContent = `${product.stock} u.`;
    if (product.stock <= 5) stockCell.className = 'low';

    const statusCell = row.insertCell();
    statusCell.append(el('span', {
      className: `status ${product.active ? 'status-ok' : 'status-warn'}`,
      textContent: product.active ? 'Visible' : 'Oculto',
    }));

    const actions = row.insertCell();
    actions.className = 'row-actions';
    actions.append(
      actionButton('Editar', { editProduct: product.id }),
      actionButton('Eliminar', { deleteProduct: product.id })
    );
  });
}

async function loadAdminProducts() {
  const { products } = await adminRequest('GET', null, '/api/admin/products');
  adminProducts = products;
  renderProductsTable();
  syncInventory();
}

function updatePricePreview() {
  const price = Number(productForm.price.value);
  const discount = Number(productForm.discountPercent.value) || 0;
  const preview = document.getElementById('pricePreview');
  if (!price) {
    preview.textContent = '';
    return;
  }
  const final = Math.round(price * (100 - discount)) / 100;
  preview.textContent = discount > 0
    ? `Precio en tienda: ${formatCurrency(final)} (antes ${formatCurrency(price)}, -${discount}%)`
    : `Precio en tienda: ${formatCurrency(final)}`;
}

function openProductForm(product = null) {
  editingProductId = product ? product.id : null;
  productForm.reset();
  document.getElementById('productFormTitle').textContent = product ? `Editar: ${product.name}` : 'Nuevo producto';
  if (product) {
    productForm.name.value = product.name;
    productForm.category.value = product.category;
    productForm.badge.value = product.badge || '';
    productForm.price.value = product.price;
    productForm.discountPercent.value = product.discountPercent;
    productForm.stock.value = product.stock;
    productForm.sizes.value = product.sizes.join(', ');
    productForm.imageUrl.value = product.image || '';
    productForm.description.value = product.description;
    productForm.active.checked = product.active;
  }
  updatePricePreview();
  productForm.classList.remove('hidden');
  productForm.name.focus();
}

productForm.addEventListener('input', updatePricePreview);

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    name: productForm.name.value,
    category: productForm.category.value,
    badge: productForm.badge.value,
    price: Number(productForm.price.value),
    discountPercent: Number(productForm.discountPercent.value || 0),
    stock: Number(productForm.stock.value || 0),
    sizes: productForm.sizes.value,
    imageUrl: productForm.imageUrl.value.trim(),
    description: productForm.description.value,
    active: productForm.active.checked,
  };
  if (editingProductId) body.id = editingProductId;

  const button = productForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await adminRequest(editingProductId ? 'PATCH' : 'POST', body, '/api/admin/products');
    showToast(editingProductId ? 'Producto actualizado.' : 'Producto creado.');
    productForm.classList.add('hidden');
    await loadAdminProducts();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('newProductButton').addEventListener('click', () => openProductForm());

productsTable.addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-product]');
  if (edit) {
    openProductForm(adminProducts.find((p) => p.id === Number(edit.dataset.editProduct)));
    productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const remove = event.target.closest('[data-delete-product]');
  if (!remove) return;
  const product = adminProducts.find((p) => p.id === Number(remove.dataset.deleteProduct));
  if (!product || !confirm(`¿Eliminar «${product.name}»? Si solo quieres retirarlo, edítalo y desmarca «Visible en la tienda».`)) return;
  try {
    await adminRequest('DELETE', { id: product.id }, '/api/admin/products');
    showToast('Producto eliminado.');
    await loadAdminProducts();
  } catch (error) {
    showToast(error.message);
  }
});

// ---------- Promociones ----------

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function promoState(promo) {
  const now = Date.now();
  if (!promo.active) return ['Pausada', 'status-warn'];
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return ['Programada', 'status-progress'];
  if (promo.endsAt && new Date(promo.endsAt).getTime() <= now) return ['Caducada', 'status-warn'];
  return ['Activa', 'status-ok'];
}

function renderPromosTable() {
  promosTable.innerHTML = '';
  if (adminPromotions.length === 0) {
    emptyRow(promosTable, 6, 'No hay promociones. Crea una con «Nueva promoción».');
    return;
  }
  adminPromotions.forEach((promo) => {
    const row = promosTable.insertRow();

    const codeCell = row.insertCell();
    codeCell.append(el('strong', { className: 'promo-code', textContent: promo.code }));
    if (promo.description) codeCell.append(el('small', { className: 'muted-line', textContent: promo.description }));

    row.insertCell().textContent = promo.kind === 'percent' ? `${promo.value}%` : formatCurrency(promo.value);

    const conditions = [
      promo.category ? `Solo ${CATEGORY_LABELS[promo.category] || promo.category}` : 'Toda la tienda',
      promo.minSubtotal > 0 ? `mín. ${formatCurrency(promo.minSubtotal)}` : null,
    ].filter(Boolean);
    row.insertCell().textContent = conditions.join(' · ');

    row.insertCell().textContent = promo.startsAt || promo.endsAt
      ? `${promo.startsAt ? formatDate(promo.startsAt) : 'Ya'} → ${promo.endsAt ? formatDate(promo.endsAt) : 'sin fin'}`
      : 'Sin fecha límite';

    const [label, className] = promoState(promo);
    row.insertCell().append(el('span', { className: `status ${className}`, textContent: label }));

    const actions = row.insertCell();
    actions.className = 'row-actions';
    actions.append(
      actionButton(promo.active ? 'Pausar' : 'Activar', { togglePromo: promo.id }),
      actionButton('Editar', { editPromo: promo.id }),
      actionButton('Eliminar', { deletePromo: promo.id })
    );
  });
}

async function loadAdminPromotions() {
  const { promotions } = await adminRequest('GET', null, '/api/admin/promotions');
  adminPromotions = promotions;
  renderPromosTable();
  const active = adminPromotions.filter((promo) => promoState(promo)[0] === 'Activa').length;
  setText('kpiPromos', `${active} ${active === 1 ? 'promoción activa' : 'promociones activas'}`);
}

function promoBody(promo) {
  return {
    code: promo.code,
    description: promo.description,
    kind: promo.kind,
    value: promo.value,
    minSubtotal: promo.minSubtotal,
    category: promo.category || '',
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    active: promo.active,
  };
}

function openPromoForm(promo = null) {
  editingPromoId = promo ? promo.id : null;
  promoForm.reset();
  document.getElementById('promoFormTitle').textContent = promo ? `Editar: ${promo.code}` : 'Nueva promoción';
  if (promo) {
    promoForm.code.value = promo.code;
    promoForm.kind.value = promo.kind;
    promoForm.value.value = promo.value;
    promoForm.minSubtotal.value = promo.minSubtotal;
    promoForm.category.value = promo.category || '';
    promoForm.description.value = promo.description;
    promoForm.startsAt.value = toLocalInput(promo.startsAt);
    promoForm.endsAt.value = toLocalInput(promo.endsAt);
    promoForm.active.checked = promo.active;
  }
  promoForm.classList.remove('hidden');
  promoForm.code.focus();
}

async function savePromotion(method, body) {
  await adminRequest(method, body, '/api/admin/promotions');
  await loadAdminPromotions();
}

promoForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    code: promoForm.code.value,
    kind: promoForm.kind.value,
    value: Number(promoForm.value.value),
    minSubtotal: Number(promoForm.minSubtotal.value || 0),
    category: promoForm.category.value,
    description: promoForm.description.value,
    startsAt: fromLocalInput(promoForm.startsAt.value),
    endsAt: fromLocalInput(promoForm.endsAt.value),
    active: promoForm.active.checked,
  };
  if (editingPromoId) body.id = editingPromoId;

  const button = promoForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await savePromotion(editingPromoId ? 'PATCH' : 'POST', body);
    showToast(editingPromoId ? 'Promoción actualizada.' : 'Promoción creada.');
    promoForm.classList.add('hidden');
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('newPromoButton').addEventListener('click', () => openPromoForm());

promosTable.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const id = Number(button.dataset.togglePromo || button.dataset.editPromo || button.dataset.deletePromo);
  const promo = adminPromotions.find((p) => p.id === id);
  if (!promo) return;

  try {
    if (button.dataset.editPromo) {
      openPromoForm(promo);
      promoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (button.dataset.togglePromo) {
      await savePromotion('PATCH', { ...promoBody(promo), id, active: !promo.active });
      showToast(promo.active ? `${promo.code} pausada.` : `${promo.code} activada.`);
    } else if (button.dataset.deletePromo) {
      if (!confirm(`¿Eliminar la promoción ${promo.code}?`)) return;
      await adminRequest('DELETE', { id }, '/api/admin/promotions');
      showToast('Promoción eliminada.');
      await loadAdminPromotions();
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll('[data-cancel-form]').forEach((button) => {
  button.addEventListener('click', () => button.closest('form').classList.add('hidden'));
});

// Llamada desde dashboard.js cuando una administradora inicia sesión.
function loadCatalogAdmin() {
  return Promise.all([loadAdminProducts(), loadAdminPromotions()]);
}
