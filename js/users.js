'use strict';

/* Perfiles y sesión de usuario de esta instalación estática.
   La clave se compara mediante PBKDF2 y nunca se guarda como texto literal.
   Este acceso separa las vistas de la interfaz local; el código y los datos del
   navegador son inspeccionables y no equivalen a una autorización de servidor. */
(() => {
  const scope = new URL('.',location.href).pathname;
  const sessionKey = 'codeti-user-session:' + scope;
  const rememberKey = 'codeti-user-remember:' + scope;
  const emailKey = 'codeti-user-email:' + scope;
  const shortLifetime = 8 * 60 * 60 * 1000;
  const rememberedLifetime = 7 * 24 * 60 * 60 * 1000;
  let session = null;
  let initialized = false;
  let usersReady = false;
  let afterLogin = null;
  let adminRequired = false;
  let expiryQueued = false;

  const recordFor = id => (C.users || []).find(user => user.id === id);
  const fingerprint = user => [user.id,user.email,user.salt,user.passwordHash,user.iterations].join('|');
  const removeTokens = () => {
    try { sessionStorage.removeItem(sessionKey); } catch {}
    try { localStorage.removeItem(rememberKey); } catch {}
  };
  const readToken = () => {
    try {
      const temporary = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      if (temporary) return temporary;
    } catch {}
    try { return JSON.parse(localStorage.getItem(rememberKey) || 'null'); } catch { return null; }
  };
  const renderIfReady = () => { if (C.state) C.render(false); };
  const openAdminPanel = () => { C.closeModal();location.hash='admin';renderIfReady(); };
  const closeUserWindows = () => {
    const editor=document.getElementById('editor');
    if (editor?.open) editor.close();
    C.closeModal();
  };
  const expire = () => {
    const hadSession=!!session;
    session=null; removeTokens();
    if (!hadSession || expiryQueued) return;
    expiryQueued=true;
    setTimeout(() => {
      expiryQueued=false;
      if (!document.getElementById('user-login-form')) C.closeModal();
      renderIfReady();
      C.toast('Tu sesión de usuario terminó. Ingresa de nuevo para consultar tu cuenta.');
    },0);
  };

  C.validateUsers = input => {
    if (!Array.isArray(input) || input.length > 10000) throw new Error('El registro de usuarios locales no es válido.');
    const ids=new Set(),emails=new Set();
    return input.map(value => {
      if (!value || !/^[a-z\d_-]{1,80}$/i.test(value.id) || ids.has(value.id)) throw new Error('Hay un usuario local con identificador inválido o repetido.');
      const email=String(value.email || '').trim().toLowerCase();
      const name=String(value.name || '').trim();
      const phone=C.phone(value.phone);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>200 || emails.has(email)) throw new Error('Hay un correo local inválido o repetido.');
      if (!name || name.length>160 || !/^\d{10,15}$/.test(phone)) throw new Error('Completa el nombre y celular válidos del usuario local.');
      if (value.role!=='usuario') throw new Error('Las cuentas de cliente solo pueden tener el rol usuario.');
      if (!/^[a-f\d]{32}$/i.test(value.salt || '') || !/^[a-f\d]{64}$/i.test(value.passwordHash || '') || !Number.isInteger(value.iterations) || value.iterations<100000 || value.iterations>1000000) throw new Error('La huella de una contraseña local no es válida.');
      ids.add(value.id); emails.add(email);
      return {id:value.id,name,email,phone,role:'usuario',salt:value.salt.toLowerCase(),passwordHash:value.passwordHash.toLowerCase(),iterations:value.iterations};
    });
  };

  C.initUsers = async input => {
    const users=C.validateUsers(input || []);
    const seed=window.CODETI_USER_SEED ? C.validateUsers([window.CODETI_USER_SEED])[0] : null;
    if (seed && !users.some(user => user.id===seed.id || user.email===seed.email)) {
      users.push(seed);
      await C.persist({users});
    }
    C.users=users;usersReady=true;
    return C.users;
  };

  C.initUserSession = () => {
    initialized=true;
    session=readToken();
    if (C.isAdmin?.()) {
      C.clearUserSession({silent:true});
      return false;
    }
    return !!C.getCurrentUser();
  };

  C.getCurrentUser = () => {
    if (!usersReady) return null;
    if (!initialized) { initialized=true; session=readToken(); }
    if (!session) return null;
    const user=recordFor(session.userId);
    if (!user || session.fingerprint!==fingerprint(user) || !Number.isFinite(session.expiresAt) || session.expiresAt<=Date.now()) {
      expire(); return null;
    }
    if (C.isAdmin?.()) { session=null;removeTokens();return null; }
    return {id:user.id,name:user.name,email:user.email,phone:user.phone,role:'usuario'};
  };
  C.isUser = () => !!C.getCurrentUser();
  C.userOrders = () => {
    const user=C.getCurrentUser();
    return user ? (C.orders || []).filter(order => order.userId===user.id) : [];
  };
  C.canReadUserOrder = order => !!order && (!!C.isAdmin?.() || !order.userId || C.getCurrentUser()?.id===order.userId);

  C.clearUserSession = ({silent=true}={}) => {
    session=null;initialized=true;afterLogin=null;adminRequired=false;removeTokens();
    if (!silent) {
      closeUserWindows();renderIfReady();
      C.toast('Sesión de usuario cerrada. Tu cuenta y tus pedidos permanecen guardados en este navegador.');
    }
  };

  C.userPasswordHash = async (password,user) => {
    const subtle=window.crypto?.subtle;
    if (!subtle) throw new Error('Abre la página mediante HTTPS o con Iniciar-CODETI.cmd para ingresar.');
    const salt=new Uint8Array(user.salt.match(/../g).map(pair=>parseInt(pair,16)));
    const key=await subtle.importKey('raw',new TextEncoder().encode(String(password)),{name:'PBKDF2'},false,['deriveBits']);
    const bits=await subtle.deriveBits({name:'PBKDF2',salt,iterations:user.iterations,hash:'SHA-256'},key,256);
    return [...new Uint8Array(bits)].map(value=>value.toString(16).padStart(2,'0')).join('');
  };
  const matchesHash = (actual,expected) => {
    if (actual.length!==expected.length) return false;
    let difference=0; for(let i=0;i<actual.length;i++) difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
    return difference===0;
  };
  const storeSession = (user,remember) => {
    removeTokens();
    session={userId:user.id,fingerprint:fingerprint(user),expiresAt:Date.now()+(remember?rememberedLifetime:shortLifetime),remembered:remember};
    try {
      if (remember) localStorage.setItem(rememberKey,JSON.stringify(session));
      else sessionStorage.setItem(sessionKey,JSON.stringify(session));
      return true;
    } catch {
      session.remembered=false;session.expiresAt=Date.now()+shortLifetime;
      try { sessionStorage.setItem(sessionKey,JSON.stringify(session)); } catch {}
      return false;
    }
  };

  C.openUserLogin = (callback,{requireAdmin=false}={}) => {
    if (C.isAdmin?.()) return requireAdmin && typeof callback==='function' ? callback() : openAdminPanel();
    if (!requireAdmin && C.getCurrentUser()) return typeof callback==='function' ? callback() : C.openUserAccount();
    C.editing=false;C.editorActive=false;
    closeUserWindows();
    afterLogin=typeof callback==='function' ? callback : null;
    adminRequired=!!requireAdmin;
    let rememberedEmail='';try{rememberedEmail=localStorage.getItem(emailKey)||'';}catch{}
    C.modal('Ingresar',`<form id="user-login-form" class="form-stack"><p class="muted">${adminRequired?'Esta acción necesita una cuenta de administración CONFIG.':'Ingresa con tu correo o usuario. Abriremos tu cuenta o el panel según tu acceso.'}</p><div><label for="user-email">Correo o usuario</label><input id="user-email" name="email" type="text" required autofocus maxlength="200" autocomplete="username" autocapitalize="none" spellcheck="false" value="${C.esc(rememberedEmail)}"></div><div><label for="user-password">Contraseña</label><input id="user-password" name="password" type="password" required maxlength="128" autocomplete="current-password"></div><label class="check-label"><input type="checkbox" name="remember" checked> Recordar mi sesión en este equipo</label><p class="help">La cuenta de usuario puede recordarse durante siete días. CONFIG conserva su sesión durante ocho horas en esta pestaña.</p><p class="inline-error" id="user-login-error" role="alert"></p><button class="btn btn-primary full" type="submit">Ingresar</button><p class="help">Acceso local de este navegador. La contraseña no se muestra ni se guarda como texto literal.</p></form>`);
    renderIfReady();
  };

  C.openUserAccount = () => {
    const user=C.getCurrentUser();if(!user)return C.openUserLogin();
    C.modal('Mi cuenta',`<div class="form-stack"><div><h3>${C.esc(user.name)}</h3><p class="muted">${C.esc(user.email)}</p><p class="help">Celular: +${C.esc(user.phone)} · Rol: Usuario</p></div><div class="notice">Tus datos y pedidos se conservan en este navegador. ${session?.remembered?'Tu sesión está recordada en este equipo.':'La sesión actual corresponde a esta pestaña.'}</div><div class="flex wrap">${C.btn('user-orders','Mis pedidos','','btn-primary')}${C.btn('user-profile','Editar mis datos','','btn-outline')}${C.btn('user-logout','Cerrar sesión','','btn-outline')}</div></div>`);
  };
  C.openUserProfile = () => {
    const user=C.getCurrentUser();if(!user)return C.openUserLogin(()=>C.openUserProfile());
    C.modal('Mis datos',`<form id="user-profile-form" class="form-stack"><p class="muted">${C.esc(user.email)}</p><div><label for="profile-name">Nombre</label><input id="profile-name" name="name" required maxlength="160" autocomplete="name" value="${C.esc(user.name)}"></div><div><label for="profile-phone">Celular / WhatsApp</label><input id="profile-phone" name="phone" type="tel" required pattern="[+0-9 ()-]{9,20}" maxlength="20" autocomplete="tel" value="${C.esc(user.phone)}"></div><p class="help">Estos datos se usarán al preparar tus nuevos pedidos. Los pedidos anteriores conservan sus datos originales.</p><p class="inline-error" id="user-profile-error" role="alert"></p><button class="btn btn-primary full" type="submit">Guardar mis datos</button></form>`);
  };
  C.userLink = () => {
    if (C.isAdmin?.()) return `<button class="account-entry" data-action="user-account" aria-label="Abrir CONFIG">${C.icon('shield')}<span class="account-label">CONFIG</span></button>`;
    const user=C.getCurrentUser();
    return `<button class="account-entry" data-action="user-account" aria-label="${user?'Abrir mi cuenta':'Ingresar'}">${C.icon('user')}${C.copy(user?'nav.userAccount':'nav.userLogin',user?'Mi cuenta':'Ingresar','span','account-label')}</button>`;
  };

  C.actions['user-account']=()=>C.isAdmin?.()?openAdminPanel():C.getCurrentUser()?C.openUserAccount():C.openUserLogin();
  C.actions['user-login']=()=>C.openUserLogin();
  C.actions['user-logout']=()=>C.clearUserSession({silent:false});
  C.actions['user-profile']=()=>C.openUserProfile();
  C.actions['user-orders']=()=>{
    if(!C.getCurrentUser())return C.openUserLogin(()=>C.actions['user-orders']());
    return C.actions['my-orders']();
  };

  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(form.id!=='user-login-form')return;
    event.preventDefault();
    const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    const error=document.getElementById('user-login-error');error.textContent='';
    try{
      const fields=new FormData(form),email=String(fields.get('email')||'').trim().toLowerCase(),password=String(fields.get('password')||'');
      const callback=afterLogin,requiresAdmin=adminRequired;
      if(await C.authenticateAdmin?.(email,password)){
        form.reset();afterLogin=null;adminRequired=false;C.closeModal();renderIfReady();
        if(requiresAdmin && callback)await callback();else openAdminPanel();
        C.toast('Sesión de CONFIG iniciada.');
        return;
      }
      if(requiresAdmin)throw new Error('Correo, usuario o contraseña incorrectos.');
      const user=(C.users||[]).find(value=>value.email===email);
      const candidate=user||window.CODETI_USER_SEED;
      if(!candidate)throw new Error('Correo, usuario o contraseña incorrectos.');
      const actual=await C.userPasswordHash(password,candidate);
      if(!user||!matchesHash(actual,user.passwordHash))throw new Error('Correo, usuario o contraseña incorrectos.');
      const remember=!!fields.get('remember');
      if(C.isAdmin?.())C.adminLogout();
      const stored=storeSession(user,remember);initialized=true;
      try{if(remember)localStorage.setItem(emailKey,user.email);else localStorage.removeItem(emailKey);}catch{}
      form.reset();afterLogin=null;adminRequired=false;C.closeModal();renderIfReady();
      if(callback)await callback();else C.openUserAccount();
      C.toast(stored?'Sesión de usuario iniciada.':'Sesión iniciada. Este navegador no permitió recordar el acceso.');
    }catch(problem){
      if(document.getElementById('user-login-error')===error)error.textContent=problem.message||'No se pudo iniciar sesión.';
      else C.toast(problem.message||'No se pudo abrir la cuenta.',true);
      button.disabled=false;
    }
  });

  document.addEventListener('submit',async event=>{
    const form=event.target;if(form.id!=='user-profile-form')return;
    event.preventDefault();
    const user=C.getCurrentUser();if(!user)return C.openUserLogin(()=>C.openUserProfile());
    const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    const error=document.getElementById('user-profile-error');error.textContent='';
    try{
      const fields=new FormData(form),name=String(fields.get('name')||'').trim(),phone=C.phone(fields.get('phone'));
      if(!name||name.length>160||!/^\d{10,15}$/.test(phone))throw new Error('Completa un nombre y un celular válidos.');
      const users=C.clone(C.users),record=users.find(value=>value.id===user.id);if(!record)throw new Error('La cuenta local ya no está disponible.');
      record.name=name;record.phone=phone;
      await C.persist({users:C.validateUsers(users)});renderIfReady();C.openUserAccount();C.toast('Tus datos quedaron guardados en este navegador.');
    }catch(problem){error.textContent=problem.message||'No se pudieron guardar tus datos.';button.disabled=false;}
  });
})();
