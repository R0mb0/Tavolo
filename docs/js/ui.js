// Small shared UI helpers.
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Modal dialog. actions: [{ label, val, primary }]. Resolves with the chosen val (null if dismissed).
 * `onReady(dialogEl)` lets the caller wire extra controls inside the body.
 */
export function dialog({ title, body = '', actions = [], onReady }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.setAttribute('aria-label', String(title).replace(/<[^>]*>/g, ''));
    d.innerHTML = `<h2>${title}</h2><div class="dlg-body">${body}</div><div class="dlg-actions">` +
      actions.map((a, i) => `<button type="button" class="btn${a.primary ? ' primary' : ''}" data-act="${i}">${a.label}</button>`).join('') + '</div>';
    document.body.appendChild(d);
    let val = null;
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b) { val = actions[+b.dataset.act].val; d.close(); }
    });
    d.addEventListener('close', () => { d.remove(); resolve(val); });
    if (onReady) onReady(d);
    d.showModal();
    d.scrollTop = 0;
  });
}
