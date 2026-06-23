const MODAL_Z = 2000;

function ensureStyles() {
  if (document.getElementById('modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'modal-styles';
  style.textContent = `
    .mm-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:${MODAL_Z};display:flex;align-items:center;justify-content:center;padding:20px;animation:modalFadeIn .2s ease;}
    .mm-modal-box{background:var(--surface);border-radius:20px;padding:24px;max-width:340px;width:100%;animation:modalSlideUp .25s ease;}
    .mm-modal-title{font-size:1rem;font-weight:700;color:var(--text);margin-bottom:8px;}
    .mm-modal-msg{font-size:0.85rem;color:var(--text2);margin-bottom:16px;line-height:1.5;}
    .mm-modal-input{width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:0.9rem;outline:none;font-family:'Inter',sans-serif;margin-bottom:16px;}
    .mm-modal-input:focus{border-color:var(--coral);}
    .mm-modal-btns{display:flex;gap:8px;}
    .mm-modal-btns .btn{flex:1;border-radius:12px;padding:12px;font-size:0.85rem;}
    @keyframes modalFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes modalSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  `;
  document.head.appendChild(style);
}

function removeOverlay(overlay) {
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

function buildOverlay(title, msg, bodyHtml, buttonsHtml) {
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.className = 'mm-modal-overlay';
  overlay.innerHTML = `
    <div class="mm-modal-box">
      ${title ? `<div class="mm-modal-title">${title}</div>` : ''}
      ${msg ? `<div class="mm-modal-msg">${msg}</div>` : ''}
      ${bodyHtml || ''}
      <div class="mm-modal-btns">${buttonsHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

export function modalConfirm(title, msg) {
  return new Promise(resolve => {
    const overlay = buildOverlay(title, msg, '',
      `<button class="btn btn-ghost" id="mm-cancel" style="color:var(--text2);">Cancel</button>
       <button class="btn btn-primary" id="mm-ok">Confirm</button>`
    );
    overlay.querySelector('#mm-cancel').addEventListener('click', () => { removeOverlay(overlay); resolve(false); });
    overlay.querySelector('#mm-ok').addEventListener('click', () => { removeOverlay(overlay); resolve(true); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { removeOverlay(overlay); resolve(false); } });
  });
}

export function modalPrompt(title, msg, defaultValue = '', inputType = 'text') {
  return new Promise(resolve => {
    const overlay = buildOverlay(title, msg,
      `<input class="mm-modal-input" id="mm-input" type="${inputType}" value="${String(defaultValue).replace(/"/g, '&quot;')}" autofocus />`,
      `<button class="btn btn-ghost" id="mm-cancel" style="color:var(--text2);">Cancel</button>
       <button class="btn btn-primary" id="mm-ok">OK</button>`
    );
    const input = overlay.querySelector('#mm-input');
    input.focus();
    input.select();
    const submit = () => { const val = input.value; removeOverlay(overlay); resolve(val || null); };
    overlay.querySelector('#mm-cancel').addEventListener('click', () => { removeOverlay(overlay); resolve(null); });
    overlay.querySelector('#mm-ok').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { removeOverlay(overlay); resolve(null); } });
  });
}

export function modalAlert(title, msg) {
  return new Promise(resolve => {
    const overlay = buildOverlay(title, msg, '',
      `<button class="btn btn-primary" id="mm-ok" style="width:100%;">OK</button>`
    );
    overlay.querySelector('#mm-ok').addEventListener('click', () => { removeOverlay(overlay); resolve(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { removeOverlay(overlay); resolve(); } });
  });
}
