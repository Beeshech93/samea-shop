// Se llena con el stock real cuando una administradora inicia sesión
// (dashboard-catalog.js). No se muestran datos de ejemplo.
let inventoryItems = [];

const LOW_STOCK = 5;
const STOCK_SCALE = 20;

function formatCurrency(value) {
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), Math.max(2800, message.length * 70));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

// Inventario y KPI de stock (llamado por dashboard-catalog.js al cargar productos).
function renderDashboard() {
  const lowStock = inventoryItems.filter((item) => item.stock <= LOW_STOCK).length;
  setText('stockCount', inventoryItems.reduce((sum, item) => sum + item.stock, 0));
  setText('lowStockCount', `${lowStock} con stock bajo`);

  const list = document.getElementById('inventoryList');
  list.innerHTML = '';
  if (inventoryItems.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'comment-empty';
    empty.textContent = 'Todavía no hay productos.';
    list.append(empty);
  }
  [...inventoryItems]
    .sort((a, b) => a.stock - b.stock)
    .forEach((item) => {
      const low = item.stock <= LOW_STOCK;
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'inventory-row';
      const name = document.createElement('span');
      name.textContent = item.name;
      const stock = document.createElement('strong');
      stock.className = low ? 'low' : '';
      stock.textContent = `${item.stock} u.`;
      row.append(name, stock);
      const track = document.createElement('div');
      track.className = 'stock-track';
      const bar = document.createElement('div');
      bar.className = `stock-bar${low ? ' low' : ''}`;
      bar.style.width = `${Math.min(100, (item.stock / STOCK_SCALE) * 100)}%`;
      track.append(bar);
      li.append(row, track);
      list.append(li);
    });

  setText('lastUpdated', new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }));
}

function setupControls() {
  document.getElementById('refreshButton').addEventListener('click', async () => {
    if (!adminUser) return;
    await loadProtectedData();
    showToast('Datos actualizados.');
  });

  const navLinks = document.querySelectorAll('.admin-nav a[href^="#"]');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.forEach((other) => other.classList.toggle('active', other === link));
    });
  });
}

// ---------- Moderación de comentarios ----------

const adminLogin = document.getElementById('adminLogin');
const adminSession = document.getElementById('adminSession');
const protectedPanels = [...document.querySelectorAll('[data-protected]')];
const moderationList = document.getElementById('moderationList');
const commentSummary = document.getElementById('commentSummary');
let adminUser = null;

async function apiRequest(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Error del servidor.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function adminRequest(method, body, path = '/api/admin/comments') {
  return apiRequest(path, method, body);
}

function showModeration(loggedIn) {
  document.body.classList.toggle('is-locked', !loggedIn);
  if (loggedIn && adminUser) {
    setText('adminSessionText', `Sesión iniciada como ${adminUser.name} (${adminUser.email}).`);
    setText('greeting', `${greeting()}, ${adminUser.name.split(' ')[0]}`);
    setText('topbarText', 'Productos, promociones, clientas y comentarios de samea.shop.');
  } else {
    setText('greeting', 'Panel de administración');
    setText('topbarText', 'Inicia sesión con tu cuenta de administradora para gestionar la tienda.');
  }
  adminLogin.classList.toggle('hidden', loggedIn);
  adminSession.classList.toggle('hidden', !loggedIn);
  protectedPanels.forEach((panel) => panel.classList.toggle('hidden', !loggedIn));
  if (!loggedIn) {
    commentSummary.textContent = '';
    moderationList.innerHTML = '';
    document.getElementById('userSummary').textContent = '';
    document.getElementById('usersTable').innerHTML = '';
    document.getElementById('subscribersTable').innerHTML = '';
    inventoryItems = [];
  }
}

async function loadUsers() {
  const { users } = await adminRequest('GET', null, '/api/admin/users');
  const recent = users.filter((user) => Date.now() - new Date(user.created_at).getTime() < 7 * 24 * 60 * 60 * 1000).length;
  setText('userSummary', `${users.length} ${users.length === 1 ? 'cuenta' : 'cuentas'}`);
  setText('kpiUsers', users.length);
  setText('newCustomers', `${recent} en los últimos 7 días`);

  const tbody = document.getElementById('usersTable');
  tbody.innerHTML = '';
  if (users.length === 0) {
    const row = tbody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.className = 'comment-empty';
    cell.textContent = 'Todavía no hay clientas registradas.';
    return;
  }
  users.forEach((user) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = user.name;
    const emailCell = row.insertCell();
    const link = document.createElement('a');
    link.href = `mailto:${user.email}`;
    link.textContent = user.email;
    emailCell.append(link);
    row.insertCell().textContent = new Date(user.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' });
    const roleCell = row.insertCell();
    const role = document.createElement('span');
    role.className = `status ${user.is_admin || user.fixed_admin ? 'status-progress' : ''}`;
    role.textContent = user.is_admin || user.fixed_admin ? 'Administradora' : 'Clienta';
    roleCell.append(role);

    const actionCell = row.insertCell();
    actionCell.className = 'row-actions';
    if (!user.fixed_admin && !(user.is_self && user.is_admin)) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'text-button';
      toggle.textContent = user.is_admin ? 'Quitar admin' : 'Hacer admin';
      toggle.dataset.adminUser = user.id;
      toggle.dataset.makeAdmin = String(!user.is_admin);
      toggle.dataset.email = user.email;
      actionCell.append(toggle);
    }
    if (user.is_self) return;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Eliminar';
    remove.dataset.deleteUser = user.id;
    remove.dataset.email = user.email;
    actionCell.append(remove);
  });
}

// ---------- Boletín ----------

let subscribers = [];

async function loadSubscribers() {
  ({ subscribers } = await adminRequest('GET', null, '/api/admin/subscribers'));
  setText('subscriberSummary', `${subscribers.length} ${subscribers.length === 1 ? 'suscriptora' : 'suscriptoras'}`);
  const tbody = document.getElementById('subscribersTable');
  tbody.innerHTML = '';
  if (subscribers.length === 0) {
    const cell = tbody.insertRow().insertCell();
    cell.colSpan = 3;
    cell.className = 'comment-empty';
    cell.textContent = 'Todavía no hay suscripciones.';
    return;
  }
  subscribers.forEach((entry) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = entry.email;
    row.insertCell().textContent = new Date(entry.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' });
    const actions = row.insertCell();
    actions.className = 'row-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Dar de baja';
    remove.dataset.unsubscribe = entry.id;
    remove.dataset.email = entry.email;
    actions.append(remove);
  });
}

document.getElementById('subscribersTable').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-unsubscribe]');
  if (!button || !confirm(`¿Dar de baja a ${button.dataset.email} del boletín?`)) return;
  try {
    await adminRequest('DELETE', { id: Number(button.dataset.unsubscribe) }, '/api/admin/subscribers');
    showToast('Suscripción eliminada.');
    await loadSubscribers();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('copySubscribers').addEventListener('click', async () => {
  if (subscribers.length === 0) {
    showToast('No hay correos que copiar.');
    return;
  }
  try {
    await navigator.clipboard.writeText(subscribers.map((entry) => entry.email).join(', '));
    showToast(`${subscribers.length} correos copiados.`);
  } catch {
    showToast('No se pudo copiar. Selecciona los correos de la tabla.');
  }
});

async function loadProtectedData() {
  await loadModeration();
  if (!adminUser) return;
  const tasks = [loadUsers(), loadSubscribers()];
  if (typeof loadCatalogAdmin === 'function') tasks.push(loadCatalogAdmin());
  const results = await Promise.allSettled(tasks);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) showToast(failed.reason.message);
}

function buildModerationItem(entry) {
  const item = document.createElement('li');
  item.className = `moderation-item${entry.approved ? '' : ' is-pending'}`;

  const head = document.createElement('div');
  head.className = 'moderation-head';
  const author = document.createElement('strong');
  author.textContent = entry.name || 'Sin nombre';
  const status = document.createElement('span');
  status.className = `status ${entry.approved ? 'status-ok' : 'status-warn'}`;
  status.textContent = entry.approved ? 'Publicado' : 'Pendiente';
  head.append(author, status);

  const product = inventoryItems.find((p) => p.id === entry.product_id);
  const meta = document.createElement('small');
  meta.textContent = [
    product ? product.name : 'Opinión general',
    new Date(entry.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
  ].join(' · ');

  const text = document.createElement('p');
  text.textContent = entry.comment;

  const actions = document.createElement('div');
  actions.className = 'moderation-actions';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = entry.approved ? 'btn btn-ghost' : 'btn btn-primary';
  toggle.textContent = entry.approved ? 'Ocultar' : 'Aprobar';
  toggle.dataset.approve = String(!entry.approved);
  toggle.dataset.id = entry.id;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'text-button';
  remove.textContent = 'Eliminar';
  remove.dataset.delete = entry.id;
  actions.append(toggle, remove);

  item.append(head, meta, text, actions);
  return item;
}

async function loadModeration() {
  try {
    const { comments } = await adminRequest('GET');
    showModeration(true);
    const pending = comments.filter((c) => !c.approved).length;
    commentSummary.textContent = `${pending} pendientes · ${comments.length} en total`;
    setText('kpiPending', pending);
    moderationList.innerHTML = '';
    if (comments.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'comment-empty';
      empty.textContent = 'Todavía no hay comentarios.';
      moderationList.append(empty);
      return;
    }
    comments.forEach((entry) => moderationList.append(buildModerationItem(entry)));
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      adminUser = null;
      showModeration(false);
    }
    showToast(error.message);
  }
}

async function checkAdminSession() {
  try {
    const { user } = await apiRequest('/api/auth/me');
    adminUser = user && user.isAdmin ? user : null;
    if (user && !user.isAdmin) showToast('Tu cuenta no tiene permisos de administración.');
  } catch {
    adminUser = null;
  }
  showModeration(Boolean(adminUser));
  if (adminUser) loadProtectedData();
}

adminLogin.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = adminLogin.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest('/api/auth/login', 'POST', {
      email: document.getElementById('adminEmail').value.trim().toLowerCase(),
      password: document.getElementById('adminPassword').value,
    });
    adminLogin.reset();
    await checkAdminSession();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  try {
    await apiRequest('/api/auth/logout', 'POST', {});
  } catch {
    // Aunque falle, se oculta el área protegida.
  }
  adminUser = null;
  showModeration(false);
});

moderationList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.dataset.approve) {
      await adminRequest('PATCH', { id: Number(button.dataset.id), approved: button.dataset.approve === 'true' });
      showToast(button.dataset.approve === 'true' ? 'Comentario publicado.' : 'Comentario oculto.');
    } else if (button.dataset.delete) {
      if (!confirm('¿Eliminar este comentario definitivamente?')) return;
      await adminRequest('DELETE', { id: Number(button.dataset.delete) });
      showToast('Comentario eliminado.');
    } else {
      return;
    }
    loadModeration();
  } catch (error) {
    showToast(error.message);
  }
});

// Cancelación de datos (derechos ARCO): elimina la cuenta y sus sesiones.
document.getElementById('usersTable').addEventListener('click', async (event) => {
  const toggle = event.target.closest('[data-admin-user]');
  if (toggle) {
    const makeAdmin = toggle.dataset.makeAdmin === 'true';
    const question = makeAdmin
      ? `¿Dar acceso de administración a ${toggle.dataset.email}? Podrá ver clientas y moderar comentarios.`
      : `¿Quitar el acceso de administración a ${toggle.dataset.email}?`;
    if (!confirm(question)) return;
    try {
      await adminRequest('PATCH', { id: Number(toggle.dataset.adminUser), isAdmin: makeAdmin }, '/api/admin/users');
      showToast(makeAdmin ? 'Acceso de administración concedido.' : 'Acceso de administración retirado.');
      await loadUsers();
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const button = event.target.closest('[data-delete-user]');
  if (!button) return;
  if (!confirm(`¿Eliminar definitivamente la cuenta ${button.dataset.email}? No se puede deshacer.`)) return;
  try {
    await adminRequest('DELETE', { id: Number(button.dataset.deleteUser) }, '/api/admin/users');
    showToast('Cuenta eliminada.');
    await loadUsers();
  } catch (error) {
    showToast(error.message);
  }
});

setupControls();
checkAdminSession();
