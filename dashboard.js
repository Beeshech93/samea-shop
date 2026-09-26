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
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
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
  document.getElementById('newCustomers').textContent = '24';

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

const TOKEN_KEY = 'sameaAdminToken';
const adminLogin = document.getElementById('adminLogin');
const moderation = document.getElementById('moderation');
const moderationList = document.getElementById('moderationList');
const commentSummary = document.getElementById('commentSummary');

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // sessionStorage no disponible: la clave se pedirá de nuevo.
  }
}

async function adminRequest(method, body) {
  const response = await fetch('/api/admin/comments', {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
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

function showModeration(loggedIn) {
  adminLogin.classList.toggle('hidden', loggedIn);
  moderation.classList.toggle('hidden', !loggedIn);
  if (!loggedIn) commentSummary.textContent = '';
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
    if (error.status === 401) setToken(null);
    showModeration(false);
    showToast(error.message);
  }
}

adminLogin.addEventListener('submit', (event) => {
  event.preventDefault();
  setToken(document.getElementById('adminToken').value.trim());
  adminLogin.reset();
  loadModeration();
});

document.getElementById('adminLogout').addEventListener('click', () => {
  setToken(null);
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

renderDashboard();
setupControls();
if (getToken()) loadModeration();
