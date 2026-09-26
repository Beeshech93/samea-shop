const dashboardOrders = [
  { id: 'S1012', customer: 'María López', status: 'En preparación', total: 459.00 },
  { id: 'S1013', customer: 'Ana Torres', status: 'Enviado', total: 289.00 },
  { id: 'S1014', customer: 'Lucía Sánchez', status: 'Pendiente pago', total: 379.00 },
];

const inventoryItems = [
  { name: 'Tanga de encaje blanca', stock: 12 },
  { name: 'Body Seducción Negro', stock: 6 },
  { name: 'Braga Encaje Nude', stock: 18 },
  { name: 'Sujetador Básico Blanco', stock: 3 },
  { name: 'Conjunto Satén Vainilla', stock: 7 },
  { name: 'Top Bralette Lavanda', stock: 5 },
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

renderDashboard();
setupControls();
