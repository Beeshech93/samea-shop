// Número de atención por WhatsApp (el mismo de la asistente Sam): botón
// flotante y enlaces [data-wa-support] en todas las páginas de la tienda.
(function () {
  function formatNumber(digits) {
    if (digits.length === 12 && digits.startsWith('52')) {
      const local = digits.slice(2);
      // CDMX, Guadalajara y Monterrey tienen lada de 2 dígitos; el resto, de 3.
      return ['55', '56', '33', '81'].includes(local.slice(0, 2))
        ? `+52 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`
        : `+52 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
    }
    return `+${digits}`;
  }

  function greeting() {
    const code = new URLSearchParams(window.location.search).get('c');
    if (window.location.pathname.startsWith('/pedido') && /^SAM-\d+$/.test(code || '')) {
      return `Hola, tengo una duda sobre mi pedido ${code}`;
    }
    if (window.location.pathname.startsWith('/checkout')) return 'Hola, tengo una duda para terminar mi compra';
    return 'Hola, quiero información de SAMÉA';
  }

  function apply(digits) {
    const link = (text) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    document.querySelectorAll('[data-wa-support]').forEach((element) => {
      element.href = link(element.dataset.waSupport || greeting());
      element.target = '_blank';
      element.rel = 'noopener';
      const label = element.querySelector('[data-wa-number]');
      if (label) label.textContent = formatNumber(digits);
      element.hidden = false;
      element.closest('[data-wa-block]')?.removeAttribute('hidden');
    });

    const button = document.createElement('a');
    button.className = 'wa-float';
    button.href = link(greeting());
    button.target = '_blank';
    button.rel = 'noopener';
    button.setAttribute('aria-label', `Atención por WhatsApp ${formatNumber(digits)}`);
    button.title = 'Escríbenos por WhatsApp';
    button.innerHTML = '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M16.04 3C9.4 3 4 8.37 4 14.99c0 2.3.65 4.53 1.9 6.46L4 29l7.76-1.86a12.1 12.1 0 0 0 4.28.78c6.64 0 12.04-5.37 12.04-11.99C28.08 8.37 22.68 3 16.04 3zm0 21.9c-1.37 0-2.72-.28-3.97-.83l-.28-.12-4.6 1.1 1.14-4.43-.19-.3a9.86 9.86 0 0 1-1.57-5.33c0-5.47 4.47-9.92 9.97-9.92s9.97 4.45 9.97 9.92-4.47 9.91-9.97 9.91zm5.47-7.42c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.27-.46-2.41-1.48-.89-.79-1.5-1.77-1.67-2.07-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg><span>¿Dudas? Escríbenos</span>';
    document.body.append(button);
  }

  fetch('/api/orders/contact')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const digits = String(data?.whatsapp || '').replace(/\D/g, '');
      if (digits.length >= 10) apply(digits);
    })
    .catch(() => {});
})();
