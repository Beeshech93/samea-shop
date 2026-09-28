// Conversaciones de WhatsApp. Usa adminRequest, showToast y setText de dashboard.js.

const waList = document.getElementById('waList');
const waThread = document.getElementById('waThread');
let waConversations = [];
let waSelected = null;
let waTimer = null;

function waNode(tag, props = {}, children = []) {
  const element = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}

const waTime = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
const waLabel = (c) => c.name || (c.phone ? `+${c.phone}` : c.jid.split('@')[0]);

function renderWaStatus(status) {
  const note = document.getElementById('waStatus');
  const missing = [];
  if (status.evolutionUrlInvalid) missing.push('EVOLUTION_API_URL con una dirección válida (https://…)');
  else if (!status.evolution) missing.push('Evolution API (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE)');
  if (!status.webhookSecret) missing.push('WHATSAPP_WEBHOOK_SECRET');
  if (!status.anthropic) missing.push('ANTHROPIC_API_KEY');
  note.textContent = missing.length
    ? `Falta configurar en Vercel: ${missing.join(', ')}.`
    : `Asistente activo.${status.ownerNumber ? ' Recibirás un aviso por WhatsApp cuando una clienta necesite a una persona.' : ''}`;
  note.classList.toggle('low', missing.length > 0);
  document.getElementById('waReminders').checked = status.reminders !== false;
  const supportInput = document.getElementById('waSupportNumber');
  if (document.activeElement !== supportInput) supportInput.value = status.supportNumber ? `+${status.supportNumber}` : '';
}

document.getElementById('waSupportForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('waSupportNumber');
  try {
    const { supportNumber } = await adminRequest('POST', { action: 'support', number: input.value }, '/api/admin/whatsapp');
    input.value = supportNumber ? `+${supportNumber}` : '';
    showToast(supportNumber ? 'Número de atención guardado' : 'Se usará el número del WhatsApp conectado');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('waReminders').addEventListener('change', async (event) => {
  const input = event.target;
  try {
    const { reminders } = await adminRequest('POST', { action: 'reminders', enabled: input.checked }, '/api/admin/whatsapp');
    input.checked = reminders;
    showToast(reminders ? 'Recordatorios activados' : 'Recordatorios desactivados');
  } catch (error) {
    input.checked = !input.checked;
    showToast(error.message);
  }
});

function renderWaList() {
  waList.innerHTML = '';
  const waiting = waConversations.filter((c) => c.mode === 'human').length;
  const unread = waConversations.reduce((sum, c) => sum + c.unread, 0);
  setText('waSummary', `${waConversations.length} conversaciones · ${waiting} con persona`);
  const badge = document.getElementById('waBadge');
  badge.textContent = waiting || '';
  badge.classList.toggle('hidden', !waiting);
  if (!waConversations.length) {
    waList.append(waNode('li', { className: 'comment-empty', textContent: 'Todavía no hay conversaciones.' }));
    return;
  }
  waConversations.forEach((c) => {
    const button = waNode('button', { type: 'button', className: `wa-item${c.jid === waSelected ? ' is-active' : ''}` }, [
      waNode('span', { className: 'wa-item-head' }, [
        waNode('strong', { textContent: waLabel(c) }),
        waNode('small', { textContent: waTime(c.last_message_at) }),
      ]),
      waNode('small', { className: 'wa-preview', textContent: c.last_message || '' }),
      waNode('span', { className: 'wa-item-tags' }, [
        waNode('span', { className: `status ${c.mode === 'human' ? 'status-warn' : 'status-ok'}`, textContent: c.mode === 'human' ? 'Persona' : 'Bot' }),
        ...(c.unread ? [waNode('span', { className: 'nav-badge', textContent: String(c.unread) })] : []),
      ]),
    ]);
    button.dataset.jid = c.jid;
    waList.append(waNode('li', {}, [button]));
  });
  if (unread && document.hidden === false) document.title = `(${unread}) Panel · SAMÉA`;
}

async function openWaConversation(jid) {
  waSelected = jid;
  renderWaList();
  const conversation = waConversations.find((c) => c.jid === jid);
  if (!conversation) return;
  let messages = [];
  try {
    ({ messages } = await adminRequest('GET', null, `/api/admin/whatsapp?jid=${encodeURIComponent(jid)}`));
  } catch (error) {
    showToast(error.message);
    return;
  }
  conversation.unread = 0;
  renderWaList();

  const toggle = waNode('button', {
    type: 'button',
    className: 'btn btn-ghost btn-small',
    textContent: conversation.mode === 'human' ? 'Reactivar bot' : 'Pausar bot',
  });
  toggle.addEventListener('click', () => setWaMode(jid, conversation.mode === 'human' ? 'bot' : 'human'));
  const remove = waNode('button', { type: 'button', className: 'text-button danger-link', textContent: 'Borrar' });
  remove.addEventListener('click', () => deleteWaConversation(jid));

  const head = waNode('div', { className: 'wa-thread-head' }, [
    waNode('div', {}, [
      waNode('strong', { textContent: waLabel(conversation) }),
      waNode('small', { className: 'muted-line', textContent: conversation.phone ? `+${conversation.phone}` : conversation.jid }),
      ...(conversation.mode === 'human' && conversation.handoff_reason
        ? [waNode('small', { className: 'muted-line low', textContent: `Motivo: ${conversation.handoff_reason}` })]
        : []),
    ]),
    waNode('div', { className: 'wa-thread-actions' }, [toggle, remove]),
  ]);

  const bubbles = waNode('div', { className: 'wa-messages' });
  messages.forEach((m) => {
    const who = m.role === 'customer' ? 'Clienta' : m.role === 'bot' ? 'Bot' : 'Equipo';
    bubbles.append(waNode('div', { className: `wa-bubble wa-${m.role}` }, [
      waNode('p', { textContent: m.content }),
      waNode('small', { textContent: `${who} · ${waTime(m.created_at)}` }),
    ]));
  });

  const input = waNode('textarea', { rows: 2, maxLength: 4000, placeholder: 'Escribe tu respuesta… (al enviar, el bot se pausa en este chat)' });
  const send = waNode('button', { type: 'submit', className: 'btn btn-primary btn-small', textContent: 'Enviar' });
  const form = waNode('form', { className: 'wa-reply' }, [input, send]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    send.disabled = true;
    try {
      await adminRequest('POST', { jid, text }, '/api/admin/whatsapp');
      await loadWhatsappAdmin();
      openWaConversation(jid);
    } catch (error) {
      showToast(error.message);
      send.disabled = false;
    }
  });

  waThread.innerHTML = '';
  waThread.append(head, bubbles, form);
  bubbles.scrollTop = bubbles.scrollHeight;
}

async function setWaMode(jid, mode) {
  try {
    await adminRequest('PATCH', { jid, mode }, '/api/admin/whatsapp');
    showToast(mode === 'bot' ? 'El bot vuelve a responder en este chat.' : 'Bot pausado: respondes tú.');
    await loadWhatsappAdmin();
    openWaConversation(jid);
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteWaConversation(jid) {
  if (!confirm('¿Borrar esta conversación y sus mensajes del panel? No se borra del teléfono.')) return;
  try {
    await adminRequest('DELETE', { jid }, '/api/admin/whatsapp');
    waSelected = null;
    waThread.innerHTML = '';
    waThread.append(waNode('p', { className: 'comment-empty', textContent: 'Conversación borrada.' }));
    await loadWhatsappAdmin();
  } catch (error) {
    showToast(error.message);
  }
}

waList.addEventListener('click', (event) => {
  const item = event.target.closest('[data-jid]');
  if (item) openWaConversation(item.dataset.jid);
});

document.getElementById('waRefresh').addEventListener('click', async () => {
  await loadWhatsappAdmin();
  if (waSelected) openWaConversation(waSelected);
});

// ---------- Conexión del número ----------

const WA_STATES = {
  open: ['Conectado', 'status-ok'],
  connecting: ['Esperando escaneo', 'status-progress'],
  close: ['Desconectado', 'status-warn'],
  missing: ['Sin instancia', 'status-warn'],
  not_configured: ['Sin configurar en Vercel', 'status-warn'],
  invalid_url: ['EVOLUTION_API_URL no es una URL válida', 'status-warn'],
  unreachable: ['Servidor de Evolution sin respuesta', 'status-warn'],
};
let waQrTimer = null;

function renderWaConnection(state) {
  const [label, className] = WA_STATES[state] || [state, ''];
  const badge = document.getElementById('waConnState');
  badge.textContent = label;
  badge.className = `status ${className}`;
  const connected = state === 'open';
  document.getElementById('waConnect').classList.toggle('hidden', connected || state === 'not_configured' || state === 'invalid_url');
  document.getElementById('waLogout').classList.toggle('hidden', !connected);
  if (connected) {
    document.getElementById('waQr').classList.add('hidden');
    clearInterval(waQrTimer);
  }
}

async function loadWaConnection() {
  const { state } = await adminRequest('GET', null, '/api/admin/whatsapp?view=connection');
  renderWaConnection(state);
  return state;
}

document.getElementById('waConnect').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Preparando…';
  try {
    const result = await adminRequest('POST', { action: 'connect' }, '/api/admin/whatsapp');
    renderWaConnection(result.state);
    if (result.state !== 'open') {
      const box = document.getElementById('waQr');
      box.classList.toggle('hidden', !result.qr);
      if (result.qr) document.getElementById('waQrImg').src = result.qr;
      document.getElementById('waPairing').textContent = result.pairingCode ? `O usa el código de vinculación: ${result.pairingCode}` : '';
      showToast('Webhook configurado. Escanea el QR con el WhatsApp de la tienda.');
      clearInterval(waQrTimer);
      waQrTimer = setInterval(async () => {
        try {
          if ((await loadWaConnection()) === 'open') showToast('¡WhatsApp conectado! El asistente ya responde.');
        } catch {
          // Se reintenta en el siguiente ciclo.
        }
      }, 5000);
      setTimeout(() => clearInterval(waQrTimer), 3 * 60 * 1000);
    } else {
      showToast('WhatsApp ya estaba conectado. Webhook actualizado.');
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Conectar WhatsApp';
  }
});

document.getElementById('waLogout').addEventListener('click', async () => {
  if (!confirm('¿Desconectar el WhatsApp de la tienda? El asistente dejará de responder hasta que vuelvas a escanear el QR.')) return;
  try {
    const { state } = await adminRequest('POST', { action: 'logout' }, '/api/admin/whatsapp');
    renderWaConnection(state);
    showToast('WhatsApp desconectado.');
  } catch (error) {
    showToast(error.message);
  }
});

// Llamada desde dashboard.js al iniciar sesión; refresca la lista cada 30 s.
async function loadWhatsappAdmin() {
  const data = await adminRequest('GET', null, '/api/admin/whatsapp');
  waConversations = data.conversations;
  renderWaStatus(data.status);
  renderWaList();
  loadWaConnection().catch(() => renderWaConnection('unreachable'));
  clearInterval(waTimer);
  waTimer = setInterval(() => {
    if (!document.hidden && adminUser) loadWhatsappAdmin().catch(() => {});
  }, 30000);
}
