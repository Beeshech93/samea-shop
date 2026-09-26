const dashboardOrders = [
  { id: 'S1012', customer: 'María López', status: 'En preparación', total: 459.00 },
  { id: 'S1013', customer: 'Ana Torres', status: 'Enviado', total: 289.00 },
  { id: 'S1014', customer: 'Lucía Sánchez', status: 'Pendiente pago', total: 379.00 },
];

const inventoryItems = [
  { id: 1, name: 'Tanga de encaje blanca', stock: 12 },
  { id: 2, name: 'Body Seducción Negro', stock: 6 },
  { id: 3, name: 'Braga Encaje Nude', stock: 18 },
  { id: 4, name: 'Sujetador Básico Blanco', stock: 3 },
  { id: 5, name: 'Conjunto Satén Vainilla', stock: 7 },
  { id: 6, name: 'Top Bralette Lavanda', stock: 5 },
];

const LOW_STOCK = 5;
const STOCK_SCALE = 20;

const statusClass = {
  Enviado: 'status-ok',
  'En preparación': 'status-progress',
  'Pendiente pago': 'status-warn',
};

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

function renderDashboard() {
  const todayRevenue = dashboardOrders.reduce((sum, order) => sum + order.total, 0);
  const lowStock = inventoryItems.filter((item) => item.stock <= LOW_STOCK).length;

  document.querySelector('.admin-topbar h1').textContent = greeting();
  document.getElementById('todayRevenue').textContent = formatCurrency(todayRevenue);
  document.getElementById('orderCount').textContent = `${dashboardOrders.length} pedidos`;
  document.getElementById('pendingOrders').textContent = dashboardOrders.filter((order) => order.status !== 'Enviado').length;
  document.getElementById('stockCount').textContent = inventoryItems.reduce((sum, item) => sum + item.stock, 0);
  document.getElementById('lowStockCount').textContent = `${lowStock} con stock bajo`;

  document.getElementById('ordersTable').innerHTML = dashboardOrders
    .map(
      (order) => `
        <tr>
          <td><strong>#${order.id}</strong></td>
          <td>${order.customer}</td>
          <td><span class="status ${statusClass[order.status] || ''}">${order.status}</span></td>
          <td>${formatCurrency(order.total)}</td>
        </tr>
      `
    )
    .join('');

  document.getElementById('inventoryList').innerHTML = inventoryItems
    .map((item) => {
      const low = item.stock <= LOW_STOCK;
      const width = Math.min(100, (item.stock / STOCK_SCALE) * 100);
      return `
        <li>
          <div class="inventory-row">
            <span>${item.name}</span>
            <strong class="${low ? 'low' : ''}">${item.stock} u.</strong>
          </div>
          <div class="stock-track"><div class="stock-bar ${low ? 'low' : ''}" style="width:${width}%"></div></div>
        </li>
      `;
    })
    .join('');

  document.getElementById('lastUpdated').textContent = new Date().toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function setupControls() {
  document.getElementById('refreshButton').addEventListener('click', () => {
    renderDashboard();
    if (adminUser) loadProtectedData();
    showToast('Datos actualizados.');
  });

  const toggles = {
    maintenanceToggle: 'Modo mantenimiento',
    notificationsToggle: 'Notificaciones',
    stockAlertsToggle: 'Alertas de stock bajo',
  };
  Object.entries(toggles).forEach(([id, label]) => {
    document.getElementById(id).addEventListener('change', (event) => {
      showToast(`${label} ${event.target.checked ? 'activado' : 'desactivado'}.`);
    });
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
const protectedPanels = [document.getElementById('clientas'), document.getElementById('comentarios')];
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
  if (loggedIn && adminUser) {
    document.getElementById('adminSessionText').textContent = `Sesión iniciada como ${adminUser.name} (${adminUser.email}).`;
  }
  adminLogin.classList.toggle('hidden', loggedIn);
  adminSession.classList.toggle('hidden', !loggedIn);
  protectedPanels.forEach((panel) => panel.classList.toggle('hidden', !loggedIn));
  if (!loggedIn) {
    commentSummary.textContent = '';
    moderationList.innerHTML = '';
    document.getElementById('userSummary').textContent = '';
    document.getElementById('usersTable').innerHTML = '';
  }
}

async function loadUsers() {
  const { users } = await adminRequest('GET', null, '/api/admin/users');
  document.getElementById('userSummary').textContent = `${users.length} ${users.length === 1 ? 'clienta' : 'clientas'}`;
  document.getElementById('newCustomers').textContent = users.filter(
    (user) => Date.now() - new Date(user.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;

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

async function loadProtectedData() {
  await loadModeration();
  if (!adminUser) return;
  try {
    await loadUsers();
  } catch (error) {
    showToast(error.message);
  }
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

renderDashboard();
setupControls();
checkAdminSession();
