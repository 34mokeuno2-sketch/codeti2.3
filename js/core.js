'use strict';
window.C = {
  state: null, orders: [], cart: [], closings: [], users: [], editing: false, route: 'inicio', db: null,
  esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  clone: value => JSON.parse(JSON.stringify(value)),
  money: value => new Intl.NumberFormat('es-PE', {style:'currency', currency:'PEN'}).format(Number(value) || 0),
  cents: value => Math.round((Number(value) || 0) * 100),
  uid: () => window.crypto?.randomUUID?.() || 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
  text(key, fallback) { return this.state.texts[key] ?? String(fallback); },
  copy(key, fallback, tag = 'span', cls = '') {
    const style = this.state.styles[key] || {};
    return `<${tag} class="${this.esc(cls)}" data-edit="${this.esc(key)}" style="${style.color ? `color:${this.color(style.color)};` : ''}${style.size ? `font-size:${Math.min(96, Math.max(12, Number(style.size)))}px;` : ''}">${this.esc(this.text(key, fallback))}</${tag}>`;
  },
  color: (value, fallback = '#082344') => /^#[a-f\d]{6}$/i.test(value) ? value : fallback,
  image(value) {
    const s = String(value || '').trim();
    if (/^assets\/[a-z\d._/-]+$/i.test(s) && !s.includes('..')) return s;
    if (/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(s) && s.length < 5500000) return s;
    try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
  },
  url(value) { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } },
  phone(value) { const n = String(value || '').replace(/\D/g, ''); return n.length === 9 ? '51' + n : n; },
  wa(message, phone) { const n = this.phone(phone || this.state.settings.whatsapp); return /^\d{10,15}$/.test(n) ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : ''; },
  toast(message, error = false) {
    const el = document.getElementById('toast'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => el.hidden = true, 5500);
  },
  modal(title, html, wide = false) {
    const el = document.getElementById('modal'); document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html; el.classList.toggle('wide', wide);
    if (!el.open) el.showModal();
    el.scrollTop = 0;
  },
  closeModal() { document.getElementById('modal').close(); },
  drawer(title, html) {
    document.getElementById('editor-title').textContent = title; document.getElementById('editor-body').innerHTML = html;
    const el = document.getElementById('editor'); if (!el.open) el.showModal();
    el.scrollTop = 0;
  },
  async initDB() {
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('codeti-20-visual:' + new URL('.',location.href).pathname, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('documents');
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('Cierra otra pestaña de CODETI para guardar.'));
      });
      return await new Promise((resolve, reject) => {
        const req = this.db.transaction('documents').objectStore('documents').get('book');
        req.onsuccess = () => resolve(req.result || {}); req.onerror = () => reject(req.error);
      });
    } catch {
      this.db = null; this.storageFallback = true;
      try { return JSON.parse(localStorage.getItem('codeti-20-book:' + new URL('.',location.href).pathname) || '{}'); } catch { return {}; }
    }
  },
  async persist(patch) {
    const book = {state: this.state, orders: this.orders, cart: this.cart, closings: this.closings, users: this.users, seedRevision:this.seedRevision||'base', ...patch};
    if (this.db) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction('documents', 'readwrite'); tx.objectStore('documents').put(book, 'book');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('No se pudo guardar.'));
      });
    } else {
      try { localStorage.setItem('codeti-20-book:' + new URL('.',location.href).pathname, JSON.stringify(book)); }
      catch { throw new Error('No hay espacio para guardar. Descarga un respaldo y usa imágenes más pequeñas.'); }
    }
    Object.assign(this, book);
  },
  validate(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.products) || !input.settings) throw new Error('Este archivo no es un respaldo CODETI compatible.');
    const base = this.clone(window.CODETI_DEFAULTS), limit = (v, n = 5000) => String(v ?? '').slice(0, n);
    const id = (v) => /^[a-z\d_-]{1,80}$/i.test(v) ? v : this.uid();
    const amount = v => v === null || v === '' ? null : Math.min(10000000, Math.max(0, Number(v) || 0));
    const lines = v => (Array.isArray(v) ? v : []).slice(0, 20).map(x => limit(x, 500));
    for (const k of Object.keys(base.settings)) {
      if (input.settings[k] !== undefined) base.settings[k] = limit(input.settings[k], k === 'yapeQR' || k === 'logo' ? 5500000 : 5000);
    }
    for (const k of ['logo','yapeQR']) base.settings[k] = this.image(base.settings[k]);
    for (const k of ['primary','accent','background']) base.settings[k] = this.color(base.settings[k], window.CODETI_DEFAULTS.settings[k]);
    base.settings.whatsapp = this.phone(base.settings.whatsapp);
    base.settings.map = /^https:\/\/(www\.)?google\.com\/maps\?/.test(base.settings.map) ? base.settings.map : '';
    base.texts = {}; base.styles = {};
    for (const [k,v] of Object.entries(input.texts || {}).slice(0,2000)) {
      if (/^[a-z\d._-]{1,150}$/i.test(k) && !['__proto__','constructor','prototype'].includes(k)) base.texts[k] = limit(v);
    }
    for (const [k,v] of Object.entries(input.styles || {}).slice(0,2000)) {
      if (/^[a-z\d._-]{1,150}$/i.test(k) && !['__proto__','constructor','prototype'].includes(k)) base.styles[k] = {color: this.color(v?.color || '', ''), size: v?.size ? Math.min(96,Math.max(12,Number(v.size) || 16)) : ''};
    }
    for (const [k,v] of Object.entries(base.sections)) {
      const s = input.sections?.[k]; if (s) base.sections[k] = {background: this.color(s.background, v.background), image:this.image(s.image), overlay:Math.max(0,Math.min(90,Number(s.overlay) || 0))};
    }
    base.products = input.products.slice(0,500).map(p => ({id:id(p.id), name:limit(p.name,160), category:limit(p.category,80), description:limit(p.description), price:amount(p.price), stock:Math.max(0,Math.min(1000000,Math.floor(Number(p.stock) || 0))), reference:p.reference !== false, published:p.published !== false, images:(Array.isArray(p.images) ? p.images : []).slice(0,8).map(x=>this.image(x)).filter(Boolean), features:lines(p.features)}));
    for (const type of ['plans','systems','services']) if (Array.isArray(input[type])) {
      base[type] = input[type].slice(0,100).map(p => {
        const item = {id:id(p.id),name:limit(p.name,160),description:limit(p.description),image:this.image(p.image),features:lines(p.features)};
        if (type === 'plans') Object.assign(item,{subtitle:limit(p.subtitle,200),speed:limit(p.speed,30),unit:limit(p.unit,100),price:amount(p.price),period:limit(p.period,30),featured:!!p.featured,locations:lines(p.locations),note:limit(p.note,500)});
        if (type === 'systems') Object.assign(item,{category:limit(p.category,80),price:amount(p.price),period:limit(p.period,30),demo:this.url(p.demo),gallery:(Array.isArray(p.gallery)?p.gallery:[]).slice(0,8).map(x=>this.image(x)).filter(Boolean)});
        if (type === 'services') item.icon = ['network','box','building'].includes(p.icon) ? p.icon : 'network';
        return item;
      });
    }
    base.gallery = (Array.isArray(input.gallery) ? input.gallery : base.gallery).slice(0,24).map(g=>({image:this.image(g.image),caption:limit(g.caption,200)})).filter(g=>g.image);
    for (const type of ['products','plans','systems','services']) if (new Set(base[type].map(p=>p.id)).size !== base[type].length) throw new Error('El respaldo tiene identificadores repetidos.');
    return base;
  },
  async imageFile(file, qr = false) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Elige una imagen JPG, PNG o WebP.');
    if (file.size > 12 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 12 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve,reject)=>{const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error('No se pudo leer la imagen.')); i.src=url;});
      if (img.width * img.height > 50000000) throw new Error('La imagen tiene demasiados píxeles.');
      const scale = Math.min(1,(qr?1800:1600)/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      return canvas.toDataURL(qr || file.type==='image/png' ? 'image/png' : 'image/webp',0.84);
    } finally {URL.revokeObjectURL(url);}
  }
};
