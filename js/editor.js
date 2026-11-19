'use strict';
C.imageDraft = {};C.imageBusy=0;
C.field = (name,label,value='',type='text',attrs='') => `<div><label for="e-${name}">${C.esc(label)}</label><input id="e-${name}" name="${name}" type="${type}" value="${C.esc(value??'')}" ${attrs}></div>`;
C.area = (name,label,value='',attrs='') => `<div><label for="e-${name}">${C.esc(label)}</label><textarea id="e-${name}" name="${name}" ${attrs}>${C.esc(value)}</textarea></div>`;
C.check = (name,label,checked=false) => `<label class="check-label"><input type="checkbox" name="${name}" ${checked?'checked':''}> ${C.esc(label)}</label>`;
C.saveButton = label => `<p class="inline-error" id="editor-error" role="alert"></p><div class="editor-save"><button class="btn btn-primary full" type="submit">${label||'Guardar cambios'}</button></div>`;
C.imageControl = (key,label,values,options={}) => {
  C.imageDraft[key]={values:(Array.isArray(values)?values:[values]).filter(Boolean),multiple:!!options.multiple,qr:!!options.qr,max:options.max||8};
  return `<div class="image-controls"><label>${C.esc(label)}</label><div id="images-${key}" class="editor-photos">${C.imagePreviews(key)}</div><label class="help" for="upload-${key}">Subir ${options.multiple?'imágenes':'imagen'} JPG, PNG o WebP</label><input id="upload-${key}" type="file" accept="image/jpeg,image/png,image/webp" ${options.multiple?'multiple':''} data-image-upload="${key}"><div><label class="help" for="url-${key}">O usar una URL de imagen</label><div class="flex"><input id="url-${key}" type="url" placeholder="https://…" aria-label="URL de imagen"><button class="btn btn-outline btn-sm" type="button" data-action="image-url" data-key="${key}">Usar</button></div></div><p class="help">${options.qr?'Se conserva la imagen del QR; no se genera un código de pago alternativo.':'Se optimiza la imagen al subirla. Puedes cambiarla o quitarla.'}</p></div>`;
};
C.imagePreviews = key => C.imageDraft[key].values.map((src,i)=>`<div class="editor-photo">${C.img(src,'Vista previa')}<button type="button" data-action="image-remove" data-key="${key}" data-index="${i}" aria-label="Quitar imagen ${i+1}">×</button></div>`).join('')||'<span class="help">Sin imagen</span>';
C.updateImages = key => {const el=document.getElementById('images-'+key);if(el)el.innerHTML=C.imagePreviews(key);if(key==='gallery')C.renderGalleryCaptions();};
C.actions['image-url'] = el => {
  const input=document.getElementById('url-'+el.dataset.key),src=C.image(input.value),draft=C.imageDraft[el.dataset.key];
  if(!src)return C.toast('Usa una URL http o https válida.',true);
  if(draft.multiple&&draft.values.length>=draft.max)return C.toast('Ya alcanzaste el límite de imágenes.',true);
  if(draft.multiple)draft.values.push(src);else draft.values=[src];input.value='';C.updateImages(el.dataset.key);
};
C.actions['image-remove'] = el => {const draft=C.imageDraft[el.dataset.key];draft.values.splice(Number(el.dataset.index),1);if(el.dataset.key==='gallery')C.galleryCaptions.splice(Number(el.dataset.index),1);C.updateImages(el.dataset.key);};
document.addEventListener('change',async e=>{
  const key=e.target.dataset.imageUpload;if(!key)return;
  const draft=C.imageDraft[key];if(!draft)return;C.imageBusy++;
  try {
    const files=[...e.target.files];if(draft.multiple&&draft.values.length+files.length>draft.max)throw new Error(`Puedes usar hasta ${draft.max} imágenes.`);
    const processed=[];for(const f of files)processed.push(await C.imageFile(f,draft.qr));
    if(C.imageDraft[key]!==draft)return;
    if(draft.multiple)draft.values.push(...processed);else draft.values=processed.slice(0,1);C.updateImages(key);
  }catch(err){C.toast(err.message,true);}finally{C.imageBusy--;e.target.value='';}
});
C.renderEditBar = () => {
  const bar=document.getElementById('edit-bar');bar.hidden=!C.editorActive;if(!C.editorActive)return;
  bar.innerHTML=`<p>${C.editing?'Edición visual · toca un texto':'Vista de navegación'}</p><div>${C.btn('edit-toggle',C.editing?'Navegar':'Editar textos','','btn-white btn-sm')}${C.btn('editor-options','Personalizar','','btn-accent btn-sm')}${C.btn('export-site','Exportar sitio','','btn-ghost btn-sm edit-export')}${C.btn('editor-exit','Terminar','','btn-ghost btn-sm')}</div>`;
};
C.actions['editor-start'] = () => {C.editorActive=true;C.editing=true;C.render(false);C.actions['editor-options']();};
C.actions['edit-toggle'] = () => {C.editing=!C.editing;C.render(false);};
C.actions['editor-exit'] = () => {C.editing=false;C.editorActive=false;C.render(false);C.toast('Cambios guardados en este navegador. Exporta el sitio para publicarlos.');};
C.actions['editor-options'] = () => C.drawer('Personaliza tu CODETI',`<div class="form-stack"><div class="notice">Edición local. Toca los textos en la página para cambiarlos. Usa Navegar para probar los botones. Guarda un respaldo y exporta el sitio para llevar tus cambios al hosting.</div><div class="editor-options">${[['close-editor','Editar los textos','Cierra este panel y toca títulos, párrafos o rótulos.'],['background-current','Fondos y portadas','Cambia la imagen, el color y el contraste.'],['theme-editor','Marca y colores','Logo, identidad y datos de contacto.'],['new-product','Productos y fotos','Crea una ficha con precio, stock y galería.'],['gallery-editor','Galería de proyectos','Añade fotografías y sus descripciones.'],['payment-editor','Configurar Yape','Sube tu QR real y el nombre del titular.'],['backup-tools','Respaldo y exportación','Descarga tu trabajo o restaura una copia.']].map(([action,title,text])=>`<button class="btn btn-outline" data-action="${action}"><div>${title}<small>${text}</small></div></button>`).join('')}</div><a class="btn btn-primary" href="#admin" data-action="open-admin">Abrir almacén y pedidos</a></div>`);
C.actions['open-admin'] = () => {document.getElementById('editor').close();C.editing=false;location.hash='admin';C.render(false);};
C.pathTarget = key => {
  const parts=key.split('.');if(['products','plans','systems','services'].includes(parts[0])) {
    let obj=C.state[parts[0]].find(x=>x.id===parts[1]);if(!obj)return null;
    for(const k of parts.slice(2,-1)){if(!Object.hasOwn(obj,k))return null;obj=obj[k];}
    const prop=parts.at(-1);if(obj&&Object.hasOwn(obj,prop))return {obj,prop};
  }
  return null;
};
C.editText = el => {
  const key=el.dataset.edit,style=C.state.styles[key]||{};
  C.drawer('Editar texto',`<form id="text-editor-form" data-key="${C.esc(key)}" class="form-stack"><div class="notice">Cambia lo que dice. El enlace o la acción del botón conserva su funcionamiento.</div>${C.area('text','Texto visible',el.textContent,'required maxlength="5000"')}<div class="field-row">${C.field('color','Color del texto',style.color||'#102c4b','color')}${C.field('size','Tamaño en px (opcional)',style.size||'','number','min="12" max="96"')}</div>${C.check('inherit','Usar el color original del diseño',!style.color)}${C.saveButton('Guardar texto')}</form>`);
};
C.actions['new-product'] = () => C.editItem('products');
C.actions['new-item'] = el => C.editItem(el.dataset.type);
C.actions['edit-item'] = el => C.editItem(el.dataset.type,el.dataset.id);
C.editItem = (type,id) => {
  if(!['products','plans','systems','services'].includes(type))return;
  const p=C.clone(C.state[type].find(x=>x.id===id)||{id:C.uid(),name:'',description:'',category:'',price:null,stock:0,reference:true,published:true,images:[],features:[],image:'',gallery:[],period:type==='plans'?'/mes':'/año',speed:'',unit:'',subtitle:'',locations:[],note:'',demo:''});
  C.imageDraft={};
  let fields=C.field('name','Nombre',p.name,'text','required maxlength="160"');
  if(type==='products'||type==='systems')fields+=C.field('category','Categoría',p.category,'text','required maxlength="80"');
  if(type==='plans')fields+=C.field('subtitle','Subtítulo',p.subtitle,'text','maxlength="200"')+`<div class="field-row">${C.field('speed','Velocidad / cantidad',p.speed)}${C.field('unit','Unidad / detalle',p.unit)}</div>`;
  if(type!=='plans')fields+=C.area('description','Descripción',p.description,'required maxlength="5000"');
  if(type!=='services')fields+=`<div class="field-row">${C.field('price',type==='products'?'Precio de venta (S/)':'Precio (S/)',p.price,'number','min="0.01" max="10000000" step="0.01"')}${type==='products'?C.field('stock','Existencias',p.stock,'number','required min="0" max="1000000" step="1"'):C.field('period','Periodicidad',p.period,'text','maxlength="30"')}</div>`;
  if(type==='products')fields+=C.check('reference','Referencial: ofrecer por cotización',p.reference)+C.check('published','Mostrar en la tienda',p.published)+C.imageControl('photos','Fotos del producto',p.images,{multiple:true});
  else fields+=C.imageControl('cover','Imagen principal',p.image);
  if(type!=='services')fields+=C.area('features','Características (una por línea)',p.features.join('\n'));
  if(type==='plans')fields+=C.area('locations','Sedes (una por línea)',p.locations.join('\n'))+C.area('note','Condiciones',p.note)+C.check('featured','Destacar este plan',p.featured);
  if(type==='systems')fields+=C.field('demo','URL de demostración (opcional)',p.demo,'url')+C.imageControl('gallery','Capturas adicionales',p.gallery,{multiple:true});
  C.drawer(id?'Editar ficha':'Añadir '+({products:'producto',plans:'plan',systems:'sistema',services:'servicio'}[type]),`<form id="item-editor-form" data-type="${type}" data-id="${p.id}" class="form-stack">${fields}<p class="help">${type==='products'?'Los productos nuevos son referenciales hasta que actives la venta y registres existencias.':'Puedes sustituir los textos e imágenes por la información de tu empresa.'}</p>${C.saveButton(id?'Guardar ficha':'Crear ficha')}${id?`<button class="btn btn-danger" type="button" data-action="delete-item" data-type="${type}" data-id="${p.id}">Eliminar ficha</button>`:''}</form>`);
};
C.actions['delete-item'] = el => {
  if(!confirm('¿Eliminar esta ficha del catálogo? Los pedidos ya registrados conservan su detalle.'))return;
  const type=el.dataset.type,id=el.dataset.id,state=C.clone(C.state);state[type]=state[type].filter(x=>x.id!==id);
  return C.persist({state,cart:type==='products'?C.cart.filter(x=>x.id!==id):C.cart}).then(()=>{document.getElementById('editor').close();C.closeModal();C.render(false);C.toast('Ficha eliminada.');});
};
C.actions['background-current'] = () => C.editBackground({inicio:'home',internet:'internet',sistemas:'sistemas',tienda:'tienda',empresa:'empresa',contacto:'contacto'}[C.route]||'home');
C.actions['edit-background'] = el => C.editBackground(el.dataset.id);
C.editBackground = id => {
  const b=C.state.sections[id];if(!b)return;C.imageDraft={};
  C.drawer('Fondos y portadas',`<form id="background-form" data-id="${id}" class="form-stack"><div><label for="background-section">Apartado</label><select id="background-section">${Object.keys(C.state.sections).map(k=>`<option value="${k}" ${id===k?'selected':''}>${({home:'Inicio',internet:'Internet y TV',sistemas:'Sistemas',tienda:'Tienda',empresa:'Empresa',contacto:'Contacto'})[k]}</option>`).join('')}</select></div>${C.imageControl('background','Imagen del fondo',b.image)}${C.field('color','Color de fondo',b.background,'color')}<div><label for="overlay-range">Oscurecimiento de imagen</label><input type="range" id="overlay-range" name="overlay" min="0" max="90" value="${b.overlay}"><p class="help">Aumenta el contraste para que el texto se lea sobre la imagen.</p></div>${C.saveButton('Guardar fondo')}</form>`);
};
document.addEventListener('change',e=>{if(e.target.id==='background-section')C.editBackground(e.target.value);});
C.actions['theme-editor'] = () => {
  C.imageDraft={};const s=C.state.settings;
  C.drawer('Marca, colores y contacto',`<form id="theme-form" class="form-stack">${C.field('name','Nombre de la empresa',s.name,'text','required maxlength="80"')}${C.imageControl('logo','Logo',s.logo)}<div class="field-row">${C.field('primary','Color principal',s.primary,'color')}${C.field('accent','Color de acento',s.accent,'color')}</div>${C.field('background','Fondo general de la página',s.background,'color')}${C.field('whatsapp','WhatsApp con código de país',s.whatsapp,'tel','required pattern="[+0-9 ()-]{9,20}"')}${C.area('pickup','Dirección / instrucciones de recojo',s.pickup,'required maxlength="1000"')}${C.field('map','Enlace de mapa para insertar (Google Maps)',s.map,'url')}<p class="help">Ejemplo: https://www.google.com/maps?q=Quilmana+Canete&output=embed</p>${C.saveButton('Guardar identidad')}</form>`);
};
C.actions['payment-editor'] = () => {
  C.imageDraft={};const s=C.state.settings;
  C.drawer('Configurar Yape',`<form id="payment-form" class="form-stack"><div class="notice">Sube tu QR de cobro descargado de Yape. El cliente escanea, introduce el importe en su app y tú verificas el abono antes de entregar.</div>${C.imageControl('yape','QR real de Yape',s.yapeQR,{qr:true})}${C.field('holder','Nombre del titular',s.yapeHolder,'text','maxlength="150"')}<p class="help">El QR aparece al preparar una compra de productos con existencias y total confirmado. El aviso «Ya pagué» deja el pago por verificar.</p>${C.saveButton('Guardar Yape')}</form>`);
};
C.galleryCaptions=[];
C.renderGalleryCaptions = () => {
  const target=document.getElementById('gallery-captions');if(!target)return;
  for(const input of target.querySelectorAll('[data-caption]'))C.galleryCaptions[Number(input.dataset.caption)]=input.value;
  target.innerHTML=(C.imageDraft.gallery?.values||[]).map((_,i)=>C.field('caption-'+i,'Descripción de la foto '+(i+1),C.galleryCaptions[i]||'Proyecto de CODETI').replace('<input ','<input data-caption="'+i+'" ')).join('');
};
C.actions['gallery-editor'] = () => {
  C.imageDraft={};C.galleryCaptions=C.state.gallery.map(g=>g.caption);
  C.drawer('Galería de proyectos',`<form id="gallery-form" class="form-stack">${C.imageControl('gallery','Fotografías de tu empresa',C.state.gallery.map(g=>g.image),{multiple:true,max:24})}<div id="gallery-captions" class="form-stack"></div>${C.saveButton('Guardar galería')}</form>`);C.renderGalleryCaptions();
};
C.actions['backup-tools'] = () => C.drawer('Respaldo y exportación',`<div class="form-stack"><div class="notice">Los cambios se conservan en este navegador. Un respaldo te permite trasladarlos y recuperarlos.</div>${C.backupPanel()}</div>`);
document.addEventListener('submit',async e=>{
  const form=e.target;if(!['text-editor-form','item-editor-form','background-form','theme-form','payment-form','gallery-form'].includes(form.id))return;e.preventDefault();
  const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
  try {
    if(C.imageBusy)throw new Error('Espera a que termine de procesarse la imagen.');
    const state=C.clone(C.state),d=Object.fromEntries(new FormData(form)),lines=s=>String(s||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20);
    if(form.id==='text-editor-form') {
      const key=form.dataset.key;let dest=null,parts=key.split('.');
      if(['products','systems','plans','services'].includes(parts[0])) {
        let obj=state[parts[0]].find(x=>x.id===parts[1]);if(obj){for(const p of parts.slice(2,-1))obj=obj?.[p];if(obj&&Object.hasOwn(obj,parts.at(-1)))dest={obj,prop:parts.at(-1)};}
      }
      if(parts[0]==='gallery'&&state.gallery[Number(parts[1])]&&parts[2]==='caption')dest={obj:state.gallery[Number(parts[1])],prop:'caption'};
      if(dest){dest.obj[dest.prop]=d.text;delete state.texts[key];}else state.texts[key]=d.text;
      state.styles[key]={color:d.inherit?'':C.color(d.color),size:d.size?Math.min(96,Math.max(12,Number(d.size))):''};
    }
    if(form.id==='item-editor-form') {
      const type=form.dataset.type,id=form.dataset.id,prev=state[type].find(x=>x.id===id)||{},price=d.price===''?null:Number(d.price);
      if(type!=='services'&&price!==null&&(!Number.isFinite(price)||price<=0))throw new Error('El precio debe ser mayor a cero o quedar vacío para cotizar.');
      const item={...prev,id,name:d.name.trim(),description:d.description||'',features:lines(d.features)};
      if(!item.name)throw new Error('Escribe un nombre.');
      if(type==='products')Object.assign(item,{category:d.category.trim(),price,stock:Number(d.stock),reference:!!d.reference,published:!!d.published,images:C.imageDraft.photos.values});
      if(type==='products'&&!item.reference&&(price===null||!Number.isInteger(item.stock)||item.stock<0))throw new Error('Para vender, registra precio y existencias válidos.');
      if(type==='systems')Object.assign(item,{category:d.category.trim(),price,period:d.period,image:C.imageDraft.cover.values[0]||'',gallery:C.imageDraft.gallery.values,demo:C.url(d.demo)});
      if(type==='plans')Object.assign(item,{subtitle:d.subtitle,speed:d.speed,unit:d.unit,price,period:d.period,locations:lines(d.locations),note:d.note,featured:!!d.featured,image:C.imageDraft.cover.values[0]||''});
      if(type==='services')Object.assign(item,{icon:prev.icon||'network',image:C.imageDraft.cover.values[0]||''});
      const index=state[type].findIndex(x=>x.id===id);if(index<0)state[type].push(item);else state[type][index]=item;
      for(const key of Object.keys(state.texts))if(key.startsWith(type+'.'+id+'.'))delete state.texts[key];
    }
    if(form.id==='background-form')state.sections[form.dataset.id]={background:C.color(d.color),image:C.imageDraft.background.values[0]||'',overlay:Number(d.overlay)};
    if(form.id==='theme-form') {
      const phone=C.phone(d.whatsapp);if(!/^\d{10,15}$/.test(phone))throw new Error('Revisa el WhatsApp y su código de país.');
      if(d.map&&!/^https:\/\/(www\.)?google\.com\/maps\?/.test(d.map))throw new Error('Usa un enlace Google Maps para insertar con la ruta /maps?q=...');
      Object.assign(state.settings,{name:d.name.trim(),logo:C.imageDraft.logo.values[0]||'',primary:d.primary,accent:d.accent,background:d.background,whatsapp:phone,pickup:d.pickup,map:d.map});
    }
    if(form.id==='payment-form') {
      const qr=C.imageDraft.yape.values[0]||'';if(qr&&!d.holder.trim())throw new Error('Escribe el titular del QR de Yape.');
      Object.assign(state.settings,{yapeQR:qr,yapeHolder:d.holder.trim()});
    }
    if(form.id==='gallery-form')state.gallery=C.imageDraft.gallery.values.map((image,i)=>({image,caption:d['caption-'+i]||'Proyecto de CODETI'}));
    await C.persist({state:C.validate(state)});document.getElementById('editor').close();C.closeModal();C.render(false);C.toast('Guardado. Recuerda exportar el sitio para publicar los cambios.');
  }catch(err){document.getElementById('editor-error').textContent=err.message;button.disabled=false;}
});
