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
];

function formatCurrency(value) {
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

function renderDashboard() {
  const todayRevenue = dashboardOrders.reduce((sum, order) => sum + order.total, 0);
  document.getElementById('todayRevenue').textContent = formatCurrency(todayRevenue);
  document.getElementById('pendingOrders').textContent = dashboardOrders.filter((order) => order.status !== 'Enviado').length;
  document.getElementById('stockCount').textContent = inventoryItems.reduce((sum, item) => sum + item.stock, 0);
  document.getElementById('newCustomers').textContent = '24';

  const ordersTable = document.getElementById('ordersTable');
  ordersTable.innerHTML = dashboardOrders
    .map(
      (order) => `
        <tr>
          <td>${order.id}</td>
          <td>${order.customer}</td>
          <td>${order.status}</td>
          <td>${formatCurrency(order.total)}</td>
        </tr>
      `
    )
    .join('');

  const inventoryList = document.getElementById('inventoryList');
  inventoryList.innerHTML = inventoryItems
    .map(
      (item) => `
        <li>
          <span>${item.name}</span>
          <strong>${item.stock} unidades</strong>
        </li>
      `
    )
    .join('');

  document.getElementById('lastUpdated').textContent = new Date().toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function setupControls() {
  document.getElementById('refreshButton').addEventListener('click', () => {
    renderDashboard();
    alert('Datos del dashboard actualizados.');
  });

  document.getElementById('maintenanceToggle').addEventListener('change', (event) => {
    alert(`Modo mantenimiento ${event.target.checked ? 'activado' : 'desactivado'}.`);
  });

  document.getElementById('notificationsToggle').addEventListener('change', (event) => {
    alert(`Notificaciones ${event.target.checked ? 'activadas' : 'desactivadas'}.`);
  });
}

renderDashboard();
setupControls();
