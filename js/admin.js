'use strict';

/* Acceso local para la edición de esta web estática.
   Para cambiar el usuario o la clave, edita esta configuración y publica de nuevo.
   passwordSHA256 contiene el SHA-256 hexadecimal de la clave, no su texto literal.
   Este bloqueo de interfaz no sustituye la autorización de un servidor: el código
   y los datos del navegador se pueden inspeccionar o modificar. */
window.CODETI_ADMIN = Object.freeze({
  username: 'config',
  passwordSHA256: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  sessionHours: 8
});

(() => {
  const sessionKey = 'codeti-admin-session:' + new URL('.',location.href).pathname;
  const protectedActions = new Set([
    'editor-start','edit-toggle','editor-options','open-admin','new-product','new-item',
    'edit-item','delete-item','background-current','edit-background','theme-editor',
    'payment-editor','gallery-editor','backup-tools','publish-selected','admin-tab',
    'verify-payment','set-shipping','cancel-order','deliver-order','export-orders',
    'export-site','backup-download','backup-import','image-url','image-remove',
    'cash-close','cash-detail','cash-export','cash-close-confirm','cash-export-closure',
    'view-payment-proof'
  ]);
  const protectedForms = new Set([
    'text-editor-form','item-editor-form','background-form','theme-form','payment-form',
    'gallery-form','verify-payment-form','shipping-form','cancel-order-form',
    'backup-import-form','cash-close-form'
  ]);
  let session = null;
  let initialized = false;
  let afterLogin = null;
  let cleanupQueued = false;

  const config = () => window.CODETI_ADMIN;
  const username = () => String(config().username || '').trim();
  const hours = () => Math.min(168,Math.max(1,Number(config().sessionHours) || 8));
  const fingerprint = () => username().toLowerCase() + '|' + config().passwordSHA256 + '|' + hours();
  const removeStoredSession = () => { try { sessionStorage.removeItem(sessionKey); } catch {} };
  const clearEditing = () => { C.editing = false; C.editorActive = false; };
  const closeEditor = () => { const drawer=document.getElementById('editor'); if(drawer?.open)drawer.close(); };
  const defaultDestination = () => { location.hash='admin'; if(C.state)C.render(false); };

  const expireSession = () => {
    const wasActive = !!session;
    session = null;
    removeStoredSession();
    clearEditing();
    if (!wasActive || cleanupQueued) return;
    cleanupQueued = true;
    setTimeout(() => {
      cleanupQueued = false;
      closeEditor();
      // A requirement check may already have opened a fresh login form.
      if (!document.getElementById('admin-login-form') && !document.getElementById('user-login-form')) C.closeModal();
      if (C.state) C.render(false);
      C.toast('Tu sesión de CONFIG terminó. Ingresa de nuevo para continuar.');
    },0);
  };

  C.initAdminSession = () => {
    initialized = true;
    try { session=JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { session=null; }
    if (!session || typeof session!=='object') session=null;
    if (!C.isAdmin()) clearEditing();
    return C.isAdmin();
  };

  C.isAdmin = () => {
    if (!initialized) {
      initialized=true;
      try { session=JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { session=null; }
    }
    if (!session) return false;
    if (typeof session!=='object' || session.username!==username().toLowerCase() ||
        session.fingerprint!==fingerprint() || !Number.isFinite(session.expiresAt) ||
        session.expiresAt<=Date.now()) {
      expireSession();
      return false;
    }
    return true;
  };

  C.getAdminUsername = () => C.isAdmin() ? username() : '';

  // Both the public access form and the legacy CONFIG form use this session.
  C.authenticateAdmin = async (identity,password) => {
    if (String(identity || '').trim().toLowerCase()!==username().toLowerCase()) return false;
    if (!window.crypto?.subtle) throw new Error('Abre la página mediante HTTPS o con Iniciar-CODETI.cmd para ingresar.');
    const digest=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(password || '')));
    const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    if (actual!==String(config().passwordSHA256 || '').toLowerCase()) return false;
    C.clearUserSession?.({silent:true});
    clearEditing();
    initialized=true;
    session={username:username().toLowerCase(),fingerprint:fingerprint(),expiresAt:Date.now()+hours()*60*60*1000};
    try { sessionStorage.setItem(sessionKey,JSON.stringify(session)); } catch {}
    return true;
  };

  C.adminLockedView = () => `<section class="container section"><div class="card" style="max-width:560px;margin:auto"><div class="eyebrow">Administración del sitio</div><h1 style="font-size:2rem">Acceso CONFIG</h1><p class="muted spaced">Ingresa con el usuario de administración para editar textos, imágenes, productos y precios, o revisar las ventas de este equipo.</p><p class="help spaced">Acceso local al editor. Los datos se guardan en este navegador.</p>${C.btn('admin-login','Ingresar como CONFIG','','btn-primary spaced')}<div class="spaced"><a href="#inicio">Volver al inicio</a></div></div></section>`;

  C.openAdminLogin = callback => {
    if (C.isAdmin()) return (typeof callback==='function' ? callback : defaultDestination)();
    if (typeof C.openUserLogin==='function') return C.openUserLogin(typeof callback==='function' ? callback : defaultDestination,{requireAdmin:true});
    clearEditing();
    closeEditor();
    C.closeModal();
    afterLogin = typeof callback==='function' ? callback : defaultDestination;
    C.modal('Ingresar a CONFIG',`<form id="admin-login-form" class="form-stack"><p class="muted">Acceso local al editor. Los datos se guardan en este navegador.</p><div><label for="admin-username">Usuario</label><input id="admin-username" name="username" required autofocus maxlength="80" autocomplete="username" autocapitalize="none" spellcheck="false"></div><div><label for="admin-password">Contraseña</label><input id="admin-password" name="password" type="password" required maxlength="128" autocomplete="current-password"></div><p class="inline-error" id="admin-login-error" role="alert"></p><button class="btn btn-primary full" type="submit">Ingresar</button><p class="help">La sesión termina al cerrar esta pestaña o al pulsar Cerrar sesión.</p></form>`);
  };

  C.requireAdmin = callback => {
    if (C.isAdmin()) return typeof callback==='function' ? callback() : true;
    C.openAdminLogin(callback);
    return false;
  };

  C.adminLogout = () => {
    session=null;
    afterLogin=null;
    removeStoredSession();
    clearEditing();
    closeEditor();
    C.closeModal();
    if (C.state) C.render(false);
    C.toast('Sesión de CONFIG cerrada. Tus cambios e historial se conservan.');
  };

  C.actions['admin-login'] = () => C.openAdminLogin();
  C.actions['admin-logout'] = () => C.adminLogout();

  const wrapAction = name => {
    const original=C.actions[name];
    if (typeof original!=='function' || original.codetiAdminGuard) return;
    const guarded=function(...args) { return C.requireAdmin(() => original.apply(this,args)); };
    guarded.codetiAdminGuard=true;
    C.actions[name]=guarded;
  };

  C.installAdminGuards = () => {
    for (const name of protectedActions) wrapAction(name);
    for (const name of ['editText','editItem','editBackground']) {
      const original=C[name];
      if (typeof original!=='function' || original.codetiAdminGuard) continue;
      const guarded=function(...args) { return C.requireAdmin(() => original.apply(this,args)); };
      guarded.codetiAdminGuard=true;
      C[name]=guarded;
    }
    const details=C.orderDetail;
    if(typeof details==='function' && !details.codetiAdminGuard) {
      const guarded=function(id,admin=false) {
        return admin ? C.requireAdmin(() => details.call(this,id,true)) : details.call(this,id,false);
      };
      guarded.codetiAdminGuard=true;
      C.orderDetail=guarded;
    }
  };

  // Capture guards run before the existing public application's bubble handlers.
  document.addEventListener('click',event => {
    const element=event.target.closest?.('[data-action]');
    if (!element || !protectedActions.has(element.dataset.action) || C.isAdmin()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const name=element.dataset.action;
    C.openAdminLogin(() => C.actions[name]?.(element,event));
  },true);

  document.addEventListener('submit',event => {
    if (!protectedForms.has(event.target.id) || C.isAdmin()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    C.openAdminLogin(() => {
      defaultDestination();
      C.toast('Sesión iniciada. Abre de nuevo el formulario para guardar tus cambios.');
    });
  },true);

  document.addEventListener('submit',async event => {
    const form=event.target;
    if (form.id!=='admin-login-form') return;
    event.preventDefault();
    const button=form.querySelector('[type=submit]');
    if (button.disabled) return;
    button.disabled=true;
    const error=document.getElementById('admin-login-error');
    error.textContent='';
    try {
      const fields=new FormData(form);
      if(!await C.authenticateAdmin(fields.get('username'),fields.get('password'))) throw new Error('Usuario o contraseña incorrectos.');
      form.reset();
      const callback=afterLogin || defaultDestination;
      afterLogin=null;
      C.closeModal();
      if(C.state)C.render(false);
      await callback();
    } catch(problem) {
      // The form may have been replaced after successful authentication.
      if(document.getElementById('admin-login-error')===error) error.textContent=problem.message || 'No se pudo iniciar la sesión.';
      else C.toast(problem.message || 'No se pudo completar la acción de CONFIG.',true);
      button.disabled=false;
    }
  });

  document.addEventListener('DOMContentLoaded',() => {
    C.initAdminSession();
    C.installAdminGuards();
  });
})();
