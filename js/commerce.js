'use strict';
C.paymentProofImage = order => {
  const image=C.image(order?.paymentProof?.image || '');
  return image.startsWith('data:image/') ? image : '';
};
C.readPaymentProof = async file => {
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Elige una captura JPG, PNG o WebP.');
  if(file.size<=0 || file.size>3*1024*1024) throw new Error('La captura debe pesar entre 1 byte y 3 MB.');
  const image=await new Promise((resolve,reject)=>{
    const reader=new FileReader();let settled=false;
    const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);callback(value);};
    const timer=setTimeout(()=>{finish(reject,new Error('La captura tardó demasiado en abrirse. Prueba con otra imagen.'));try{reader.abort();}catch{}},8000);
    reader.onload=()=>finish(resolve,String(reader.result || ''));
    reader.onerror=()=>finish(reject,new Error('No se pudo leer la captura. Prueba con otra imagen.'));
    reader.onabort=()=>finish(reject,new Error('Se canceló la lectura de la captura.'));
    try{reader.readAsDataURL(file);}catch{finish(reject,new Error('No se pudo abrir la captura seleccionada.'));}
  });
  if(!image.startsWith('data:'+file.type+';base64,') || !C.image(image)) throw new Error('El archivo de captura no tiene un formato de imagen válido.');
  await new Promise((resolve,reject)=>{
    const preview=new Image();let settled=false;
    const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);preview.onload=null;preview.onerror=null;callback(value);};
    const timer=setTimeout(()=>finish(reject,new Error('No se pudo comprobar la imagen. Elige otra captura.')),8000);
    preview.onload=()=>{
      const width=preview.naturalWidth || preview.width,height=preview.naturalHeight || preview.height;
      if(width<1 || height<1 || width*height>30000000) finish(reject,new Error('La captura debe tener hasta 30 megapíxeles.'));
      else finish(resolve);
    };
    preview.onerror=()=>finish(reject,new Error('El archivo no se puede abrir como imagen JPG, PNG o WebP.'));
    preview.src=image;
  });
  return {image,name:String(file.name || 'captura').slice(0,200),date:new Date().toISOString()};
};
C.paymentVerificationsBusy=new Set();
C.cartLines = () => C.cart.map(i=>({p:C.state.products.find(p=>p.id===i.id),qty:i.qty})).filter(i=>i.p);
C.cartTotal = () => C.cartLines().reduce((sum,i)=>sum+C.cents(i.p.price)*i.qty,0)/100;
C.canBuy = () => C.cartLines().length>0&&C.cartLines().every(({p,qty})=>!p.reference&&p.price>0&&p.stock>=qty&&p.published);
C.quoteMessage = () => {
  const lines=C.cartLines(),priced=lines.filter(({p})=>p.price!==null),missing=priced.length!==lines.length,reference=lines.some(({p})=>p.reference);
  const message=['Buenas, quiero cotizar estos productos:',''];
  for(const {p,qty} of lines){
    message.push(`${qty} × ${p.name}`,`Precio unitario: ${p.price===null?'A cotizar':C.money(C.cents(p.price)/100)+(p.reference?' (referencial)':'')}`,`Importe: ${p.price===null?'A cotizar':C.money(C.cents(p.price)*qty/100)}`,'');
  }
  message.push(`${missing?'Subtotal parcial de productos':'Subtotal de productos'}: ${priced.length?C.money(C.cartTotal()):'A cotizar'}`);
  message.push(priced.length?`${missing?'Total parcial de productos con precio':reference?'Total referencial de productos':'Total de productos'}: ${C.money(C.cartTotal())}`:'Total de productos: A cotizar');
  if(missing)message.push('El total final queda pendiente de cotizar los productos sin precio.');
  message.push('','¿Podrían confirmarme el precio y la disponibilidad?');
  return message.join('\n');
};
C.quoteURL = () => C.wa(C.quoteMessage());
C.redirectQuote = order => {
  const url=C.wa(C.orderMessage(order));
  if(!url || typeof location==='undefined' || typeof location.assign!=='function')return;
  try{location.assign(url);}catch{C.toast('La cotización está preparada. Abre WhatsApp desde el detalle.');}
};
C.actions['add-cart'] = async el => {
  const p=C.state.products.find(p=>p.id===el.dataset.id);if(!p||!p.published)return;
  const next=C.clone(C.cart),i=next.find(x=>x.id===p.id),qty=(i?.qty||0)+1;
  if(qty>99||(!p.reference&&qty>p.stock))return C.toast('No hay más unidades disponibles.',true);
  if(i)i.qty=qty;else next.push({id:p.id,qty:1});
  await C.persist({cart:next});C.renderHeader();C.toast(p.reference?'Añadido a tu cotización.':'Añadido al carrito.');
};
C.actions.cart = () => {
  const lines=C.cartLines();
  const partial=lines.some(({p})=>p.price===null),reference=lines.some(({p})=>p.reference);
  C.modal('Tu carrito',lines.length?`<div>${lines.map(({p,qty})=>`<div class="cart-row">${C.img(p.images[0],p.name)}<div><h3>${C.esc(p.name)}</h3><p class="muted">${p.price===null?'Por cotizar':C.money(p.price)+' por unidad'}${p.reference?' · Referencial':''}</p><div class="quantity"><button data-action="cart-qty" data-id="${p.id}" data-delta="-1" aria-label="Restar ${C.esc(p.name)}">−</button><span>${qty}</span><button data-action="cart-qty" data-id="${p.id}" data-delta="1" aria-label="Sumar ${C.esc(p.name)}">+</button></div><button class="btn-link small" data-action="cart-remove" data-id="${p.id}">Quitar</button></div><strong>${p.price===null?'A cotizar':C.money(C.cents(p.price)*qty/100)}</strong></div>`).join('')}</div><div class="cart-totals"><span>${partial?'Total parcial':reference?'Total referencial':'Total de productos'}</span><span>${lines.every(({p})=>p.price===null)?'A cotizar':C.money(C.cartTotal())}</span></div>${reference?'<p class="help quote-reference">Precios referenciales; confirma disponibilidad por WhatsApp.</p>':''}<div class="cart-actions">${C.btn('checkout-quote','Solicitar cotización','','btn-outline')}${C.btn('checkout-buy','Continuar compra','','btn-primary',C.canBuy()?'':'disabled')}</div>`:C.empty('Tu carrito está vacío','Explora la tienda y añade un producto.'));
};
C.actions['cart-qty'] = async el => {
  const next=C.clone(C.cart),item=next.find(x=>x.id===el.dataset.id),p=C.state.products.find(p=>p.id===el.dataset.id);if(!item||!p)return;
  const qty=item.qty+Number(el.dataset.delta);
  if(qty>99||(!p.reference&&qty>p.stock))return C.toast('La cantidad supera las existencias.',true);
  if(qty<=0)next.splice(next.indexOf(item),1);else item.qty=qty;
  await C.persist({cart:next});C.renderHeader();C.actions.cart();
};
C.actions['cart-remove'] = async el => {await C.persist({cart:C.cart.filter(i=>i.id!==el.dataset.id)});C.renderHeader();C.actions.cart();};
C.checkout = (type) => {
  if(!C.cartLines().length)return;
  if(type==='purchase'&&!C.canBuy())return C.toast('Revisa disponibilidad y cantidades antes de comprar.',true);
  const buy=type==='purchase', profile=C.getCurrentUser?.() || null;
  C.modal(buy?'Prepara tu compra':'Solicita una cotización',`<form id="checkout-form" class="form-stack" data-type="${type}" data-user-id="${C.esc(profile?.id || '')}"><div class="checkout-summary"><h3>Resumen</h3>${C.cartLines().map(({p,qty})=>`<div class="summary-item"><span>${qty} × ${C.esc(p.name)}</span><strong>${p.price===null?'A cotizar':C.money(C.cents(p.price)*qty/100)}</strong></div>`).join('')}<div class="summary-total"><span>Total de productos</span><span>${C.money(C.cartTotal())}</span></div></div><div class="field-row"><div><label for="buyer-name">Nombre completo</label><input name="name" id="buyer-name" required autocomplete="name" maxlength="120" value="${C.esc(profile?.name || '')}"></div><div><label for="buyer-phone">Celular / WhatsApp</label><input name="phone" id="buyer-phone" required type="tel" pattern="[+0-9 ()-]{9,20}" maxlength="20" autocomplete="tel" value="${C.esc(profile?.phone || '')}"></div></div>${profile?`<div><label for="buyer-email">Correo de tu cuenta local</label><input id="buyer-email" name="email" type="email" readonly value="${C.esc(profile.email)}" autocomplete="email"><p class="help">Este pedido quedará asociado a tu cuenta de usuario en este navegador.</p></div>`:''}<div><label for="delivery">¿Cómo quieres recibirlo?</label><select name="delivery" id="delivery"><option value="pickup">Recojo en tienda</option><option value="delivery">Delivery por coordinar</option></select></div><div id="pickup-fields"><label for="pickup-place">Sede de recojo</label><select name="location" id="pickup-place" required><option value="">Selecciona una sede</option><option>Quilmaná</option><option>Roma</option></select><p class="help">${C.esc(C.state.settings.pickup)}</p></div><div id="delivery-fields" hidden><label for="delivery-address">Dirección y referencia</label><textarea name="address" id="delivery-address" maxlength="500" autocomplete="street-address"></textarea><p class="help">CODETI confirmará el costo de envío antes del pago.</p></div>${buy?`<div class="field-row"><div><label for="receipt-type">Comprobante solicitado</label><select name="receipt" id="receipt-type"><option value="boleta">Boleta</option><option value="factura">Factura</option></select></div><div><label for="document-number" id="document-label">DNI</label><input name="document" id="document-number" required inputmode="numeric" pattern="[0-9]{8}" maxlength="8"></div></div><div id="company-field" hidden><label for="company-name">Razón social</label><input name="company" id="company-name" maxlength="200"></div><div><label for="payment-method">Forma de pago</label><select name="payment" id="payment-method">${C.state.settings.yapeQR&&C.state.settings.yapeHolder?'<option value="yape">Yape (verificación manual)</option><option value="coordinate">Coordinar pago con CODETI</option>':'<option value="coordinate">Coordinar pago con CODETI</option><option value="yape">Yape: solicitar QR a CODETI</option>'}</select></div>`:''}<div><label for="buyer-note">Nota (opcional)</label><textarea id="buyer-note" name="note" maxlength="1500"></textarea></div><label class="check-label"><input required type="checkbox" name="consent"> Acepto compartir estos datos con CODETI por WhatsApp para atender mi solicitud.</label>${buy?`<div class="notice">${profile?`Compra como <strong>${C.esc(profile.name)}</strong>. El correo de tu cuenta queda guardado en el pedido.`:'No necesitas una cuenta: tu nombre, celular y código identifican el pedido.'} Este sitio guarda el detalle en tu navegador. Envía el mensaje de WhatsApp para que CODETI reciba tu pedido. El pago y la entrega se confirman con el equipo.</div>`:''}<button type="submit" class="btn btn-primary full">${buy?'Preparar pedido y continuar':'Enviar cotización por WhatsApp'}</button><p id="checkout-error" class="inline-error" role="alert"></p>${buy?'':`<div class="quote-direct"><p class="help">¿Prefieres hacer una consulta rápida?</p><a id="quote-whatsapp" class="quote-direct-link" href="${C.esc(C.quoteURL())}" target="_blank" rel="noopener">${C.icon('whatsapp')} Cotizar directamente por WhatsApp</a></div>`}</form>`);
};
C.actions['checkout-buy']=()=>C.checkout('purchase');C.actions['checkout-quote']=()=>C.checkout('quote');
document.addEventListener('change',e=>{
  if(e.target.id==='delivery') {
    const delivery=e.target.value==='delivery';document.getElementById('delivery-fields').hidden=!delivery;document.getElementById('pickup-fields').hidden=delivery;
    document.getElementById('delivery-address').required=delivery;document.getElementById('pickup-place').required=!delivery;
  }
  if(e.target.id==='receipt-type') {
    const invoice=e.target.value==='factura',doc=document.getElementById('document-number');
    document.getElementById('document-label').textContent=invoice?'RUC':'DNI';doc.pattern=invoice?'[0-9]{11}':'[0-9]{8}';doc.maxLength=invoice?11:8;
    document.getElementById('company-field').hidden=!invoice;document.getElementById('company-name').required=invoice;
  }
});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='checkout-form')return;e.preventDefault();const form=e.target;
  if(!['purchase','quote'].includes(form.dataset.type))return;
  const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
  try {
    const d=Object.fromEntries(new FormData(form)),type=form.dataset.type,phone=C.phone(d.phone),profile=C.getCurrentUser?.() || null;
    if((form.dataset.userId || '')!==(profile?.id || ''))throw new Error('Tu sesión cambió. Abre de nuevo el formulario para continuar con tu cuenta actual.');
    if(!/^\d{10,15}$/.test(phone))throw new Error('Escribe un número de WhatsApp válido.');
    if(!C.cartLines().length)throw new Error('El carrito está vacío.');
    if(type==='purchase'&&!C.canBuy())throw new Error('Cambió la disponibilidad. Revisa tu carrito.');
    const items=C.cartLines().map(({p,qty})=>({id:p.id,name:p.name,price:p.price,qty,reference:p.reference})),subtotal=C.cartTotal();
    const order={id:C.uid(),code:(type==='quote'?'COT':'PED')+'-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+C.uid().slice(-6).toUpperCase(),date:new Date().toISOString(),userId:profile?.id || '',type,items,subtotal,shipping:d.delivery==='delivery'?null:0,total:subtotal,customer:{name:d.name.trim(),phone,email:profile?.email || '',location:d.delivery==='pickup'?d.location:'Delivery',address:d.delivery==='delivery'?d.address.trim():C.state.settings.pickup},delivery:d.delivery,receipt:d.receipt||'',document:d.document||'',company:d.company||'',payment:d.payment||'',note:d.note||'',status:type==='quote'?'quoted':'pending',reserved:type==='purchase',paymentReference:'',verifiedAt:''};
    const next=C.clone(C.state);if(type==='purchase')for(const i of items)next.products.find(p=>p.id===i.id).stock-=i.qty;
    await C.persist({state:next,orders:[order,...C.orders],cart:[]});C.render(false);C.orderDetail(order.id,false);
    if(type==='quote')C.redirectQuote(order);
  } catch(err){document.getElementById('checkout-error').textContent=err.message;button.disabled=false;}
});
C.status = o => ({quoted:'Cotización',pending:'Pago pendiente',reported:'Pago por verificar',verified:'Pago verificado',delivered:'Entregado',cancelled:'Cancelado'}[o.status]||o.status);
C.paymentMethodLabel = order => order.payment==='yape'?'Yape':'Por coordinar';
C.orderItemMessage = item => item.price===null?
  `${item.qty} × ${item.name} — Precio por cotizar`:
  `${item.qty} × ${item.name} · ${C.money(C.cents(item.price)/100)} c/u — ${C.money(C.cents(item.price)*item.qty/100)}`;
C.orderMessage = (order,client=false) => {
  const customer=order.customer || {};
  const message=[client?
    `Hola ${customer.name}, te escribimos de CODETI sobre tu pedido ${order.code}.`:
    `Hola CODETI, ${order.type==='quote'?'solicito una cotización':'quiero coordinar mi compra'} ${order.code}.`,
    '',`Código de pedido: ${order.code}`,'Productos seleccionados:',...(order.items || []).map(C.orderItemMessage),
    `Subtotal de productos: ${C.money(order.subtotal)}`,`Envío: ${order.shipping===null?'Por coordinar':C.money(order.shipping)}`,
    `Total${order.shipping===null?' de productos':''}: ${C.money(order.total)}`,
    `Medio de pago: ${C.paymentMethodLabel(order)}`,`Estado del pedido: ${C.status(order)}`,'',
    `Cliente: ${customer.name || ''}`,`Celular / WhatsApp: +${C.phone(customer.phone)}`];
  if(customer.email)message.push(`Correo: ${customer.email}`);
  message.push(`Entrega: ${order.delivery==='delivery'?'Delivery':'Recojo en '+(customer.location || 'tienda')}`,`Dirección / referencia: ${customer.address || 'Por coordinar'}`);
  if(order.receipt)message.push(`Comprobante solicitado: ${order.receipt} · ${order.document}${order.company?' · '+order.company:''}`);
  if(order.paymentReference)message.push(`Referencia de pago: ${order.paymentReference}`);
  if(order.note)message.push(`Nota: ${order.note}`);
  if(!client&&order.payment==='yape'&&!['verified','delivered','cancelled'].includes(order.status)&&!(C.state.settings.yapeQR&&C.state.settings.yapeHolder))message.push('Quisiera recibir el QR real y confirmar el titular de CODETI antes de pagar.');
  message.push('',client?'Coordinemos la entrega. Adjunto la constancia cuando corresponda.':order.type==='quote'?'Quisiera confirmar precio, disponibilidad y condiciones antes de comprar.':'Quedo atento a su confirmación. Después de pagar, enviaré la captura para verificar el abono.');
  return message.join('\n');
};
C.paymentMessage = order => {
  const customer=order.customer || {},method=C.paymentMethodLabel(order);
  const message=[`Hola CODETI, adjunto la imagen de mi pago${order.payment==='yape'?' por Yape':''} del pedido ${order.code}.`,'',
    `Código de pedido: ${order.code}`,`Cliente: ${customer.name || ''}`,`Celular / WhatsApp: +${C.phone(customer.phone)}`];
  if(customer.email)message.push(`Correo: ${customer.email}`);
  message.push('', 'Productos seleccionados:',...(order.items || []).map(C.orderItemMessage),
    `Subtotal de productos: ${C.money(order.subtotal)}`,`Envío: ${order.shipping===null?'Por coordinar':C.money(order.shipping)}`,
    `Total del pedido: ${C.money(order.total)}`,`Medio de pago: ${method}`,
    `Entrega: ${order.delivery==='delivery'?'Delivery':'Recojo en '+(customer.location || 'tienda')}`,
    `Dirección / referencia: ${customer.address || 'Por coordinar'}`,'',
    'Adjunto la captura del pago en este chat. Por favor, verifiquen el abono y escríbanme a mi celular para coordinar la entrega.');
  return message.join('\n');
};
C.paymentLink = (order,label='Enviar captura por WhatsApp',cls='btn-primary') => `<a class="btn ${C.esc(cls)}" href="${C.wa(C.paymentMessage(order))}" target="_blank" rel="noopener">${C.copy('payment.sendCapture',label)}</a>`;
C.orderDetail = (id,admin=false) => {
  if(admin&&!C.isAdmin?.())return C.requireAdmin(()=>C.orderDetail(id,true));
  const o=C.orders.find(x=>x.id===id);if(!o)return;
  const profile=C.getCurrentUser?.() || null,allowed=C.canReadUserOrder?C.canReadUserOrder(o):(!o.userId || o.userId===profile?.id || C.isAdmin?.());
  if(!admin&&!allowed){if(!profile&&C.openUserLogin)return C.openUserLogin(()=>C.orderDetail(id,false));return C.toast('Ingresa con la cuenta de este pedido para ver su detalle.',true);}
  const paid=['verified','delivered'].includes(o.status),cancelled=o.status==='cancelled',canPay=o.type==='purchase'&&!paid&&!cancelled&&o.shipping!==null&&C.state.settings.yapeQR&&C.state.settings.yapeHolder;
  C.modal(o.type==='quote'?'Detalle de cotización':'Detalle del pedido',`<div class="print-only"><h1>${C.esc(C.state.settings.name)}</h1><p>Detalle interno de ${o.type==='quote'?'cotización':'pedido'}</p></div><div class="flex between wrap"><strong class="order-code">${C.esc(o.code)}</strong><span class="pill ${paid?'green':cancelled?'red':'amber'}">${C.status(o)}</span></div><p class="help">${new Date(o.date).toLocaleString('es-PE')}</p><div class="order-lines">${o.items.map(i=>`<div><span>${i.qty} × ${C.esc(i.name)}</span><strong>${i.price===null?'A cotizar':C.money(C.cents(i.price)*i.qty/100)}</strong></div>`).join('')}<div><span>Envío</span><strong>${o.shipping===null?'Por coordinar':C.money(o.shipping)}</strong></div><div><strong>Total ${o.shipping===null?'de productos':''}</strong><strong>${C.money(o.total)}</strong></div></div><div class="order-note"><p><strong>Cliente:</strong> ${C.esc(o.customer.name)} · +${C.esc(o.customer.phone)}</p>${o.customer.email?`<p><strong>Correo:</strong> ${C.esc(o.customer.email)}</p>`:''}<p><strong>Medio de pago:</strong> ${C.esc(C.paymentMethodLabel(o))}</p><p><strong>Entrega:</strong> ${o.delivery==='delivery'?'Delivery':'Recojo en '+C.esc(o.customer.location)}</p><p>${C.esc(o.customer.address)}</p>${o.receipt?`<p>Comprobante solicitado: ${C.esc(o.receipt)} · ${C.esc(o.document)} ${C.esc(o.company)}</p>`:''}${o.note?`<p>Nota: ${C.esc(o.note)}</p>`:''}${paid?`<p><strong>Importe abonado:</strong> ${C.money(o.amountPaid??o.total)}</p>`:''}${o.paymentReference?`<p>Referencia de pago: ${C.esc(o.paymentReference)}</p>`:''}</div><div class="notice ${paid?'success':''} spaced">${paid?`Pago verificado manualmente el ${new Date(o.verifiedAt).toLocaleString('es-PE')}. `:''}${o.type==='quote'?'Los importes de la cotización se confirman con CODETI.':'La boleta o factura se emite desde el sistema de facturación de CODETI. Este documento es una constancia interna del pedido.'}</div>${!admin&&canPay?`<div class="qr-card spaced"><h3>Paga con tu app Yape</h3>${C.img(C.state.settings.yapeQR,'QR de cobro Yape de CODETI','qr-image')}<p>Titular: <strong>${C.esc(C.state.settings.yapeHolder)}</strong></p><p>Monto: <strong>${C.money(o.total)}</strong></p><p class="help">Comprueba el titular antes de pagar. Introduce el monto exacto en Yape.</p><a class="btn btn-outline btn-sm" href="${C.esc(C.state.settings.yapeQR)}" download="QR-Yape-CODETI.png">Guardar QR</a>${C.paymentLink(o,'Ya pagué: enviar captura por WhatsApp','btn-primary full spaced')}<p class="help">El enlace abre el chat con tus datos y el código del pedido. Adjunta la captura en WhatsApp y pulsa Enviar. CODETI verifica el abono y te escribe para coordinar la entrega.</p></div>`:''}${!admin&&o.type==='purchase'&&!paid&&!cancelled&&!canPay?`<div class="notice warning spaced">${o.shipping===null?'Primero coordina el costo del delivery y el total con CODETI.':o.payment==='yape'?'Solicita el QR real y el nombre del titular de CODETI por WhatsApp antes de pagar.':'Coordina el medio de pago y la entrega con CODETI por WhatsApp.'}</div>`:''}${!admin&&o.type==='purchase'&&!paid&&!cancelled&&!canPay&&o.shipping!==null?`<div class="notice spaced no-print"><strong>${o.userId?'Pedido asociado a tu cuenta local.':'No necesitas crear una cuenta.'}</strong> Tu nombre, celular y código identifican este pedido. ${C.paymentLink(o,'Enviar captura por WhatsApp','btn-primary full spaced')}<p class="help">Se abrirá WhatsApp con tu nombre, celular, código y total. Adjunta allí la foto de tu pago y pulsa Enviar. CODETI revisa el abono y te contacta para coordinar la entrega.</p></div>`:''}<div class="order-tools"><a class="btn btn-primary" href="${C.wa(C.orderMessage(o,admin),admin?o.customer.phone:undefined)}" target="_blank" rel="noopener">${admin?'Contactar al cliente':'Enviar '+(o.type==='quote'?'cotización':'pedido')+' por WhatsApp'}</a>${C.btn('print-order','Imprimir / Guardar PDF','','btn-outline')}${admin&&C.paymentProofImage(o)?C.btn('view-payment-proof','Ver captura','','btn-outline',`data-id="${C.esc(o.id)}"`):''}${admin&&o.type==='purchase'&&!cancelled&&!paid?C.btn('verify-payment','Confirmar pago','','btn-outline',`data-id="${o.id}"`):''}${admin&&o.delivery==='delivery'&&!paid&&!cancelled?C.btn('set-shipping','Acordar costo de envío','','btn-outline',`data-id="${o.id}"`):''}${admin&&o.status==='verified'?C.btn('deliver-order','Marcar entregado','','btn-outline',`data-id="${o.id}"`):''}${admin&&!cancelled&&o.status!=='delivered'?C.btn('cancel-order','Cancelar pedido','','btn-danger',`data-id="${o.id}"`):''}</div><p class="help no-print">${admin?'Para enviar la constancia: guarda este detalle como PDF y adjúntalo al chat del cliente.':'El detalle queda en este navegador. El envío a CODETI se realiza cuando pulsas Enviar en WhatsApp.'}</p>`);
};
C.actions['order-detail'] = el => C.orderDetail(el.dataset.id,el.dataset.admin==='true');
C.actions['print-order'] = () => window.print();
C.actions['my-orders'] = () => {
  const profile=C.getCurrentUser?.() || null;
  const orders=C.isAdmin?.()?C.orders:C.orders.filter(order=>profile?order.userId===profile.id:!order.userId);
  C.modal(C.isAdmin?.()?'Pedidos de este equipo':profile?'Mis pedidos de la cuenta':'Pedidos sin cuenta de este equipo',orders.length?
    `<div class="stack">${orders.map(order=>`<div class="card"><div class="flex between wrap"><strong>${C.esc(order.code)}</strong><span class="pill">${C.status(order)}</span></div><p class="help">${C.money(order.total)} · ${new Date(order.date).toLocaleDateString('es-PE')}</p>${C.btn('order-detail','Ver detalle','','btn-outline btn-sm',`data-id="${C.esc(order.id)}"`)}</div>`).join('')}</div>`:
    C.empty('Aún no tienes pedidos guardados',profile?'Los pedidos que prepares con esta cuenta aparecerán aquí, en este navegador.':'Los pedidos sin cuenta de este navegador aparecerán aquí.'));
};
C.adminContent = () => {
  const paid=C.orders.filter(o=>['verified','delivered'].includes(o.status)),pending=C.orders.filter(o=>['pending','reported'].includes(o.status));
  return `<section class="container section"><div class="section-head"><div><div class="eyebrow">Administración de este navegador</div><h1 style="font-size:2.3rem">Panel CODETI</h1></div><div class="flex wrap">${C.btn('editor-start','Editar en la página','','btn-primary')}${C.btn('admin-logout','Cerrar CONFIG','','btn-outline')}</div></div><div class="notice admin-hint">Sesión CONFIG local: el catálogo, los pedidos y los cierres se guardan en este navegador. Para publicar cambios de diseño o productos, exporta el sitio y súbelo a GitHub. Los pedidos de otros equipos llegan por WhatsApp.</div><div class="stat-grid"><div class="stat"><p>Ingresos verificados</p><strong>${C.money(paid.reduce((s,o)=>s+C.cents(o.total),0)/100)}</strong></div><div class="stat"><p>Pagos pendientes</p><strong>${pending.length}</strong></div><div class="stat"><p>Productos en almacén</p><strong>${C.state.products.length}</strong></div></div><div class="admin-tabs">${[['orders','Pedidos y ventas'],['products','Almacén'],['cash','Ventas y cierre'],['settings','Apariencia y pagos'],['backup','Respaldo y exportación']].map(([id,label])=>C.btn('admin-tab',label,'',C.filters.adminTab===id?'btn-primary btn-sm':'btn-outline btn-sm',`data-id="${id}"`)).join('')}</div>${C.filters.adminTab==='orders'?C.ordersTable():C.filters.adminTab==='products'?C.productsTable():C.filters.adminTab==='cash'?C.cashPanel():C.filters.adminTab==='backup'?C.backupPanel():C.settingsPanel()}</section>`;
};
C.admin = () => C.isAdmin?.()?C.adminContent():C.adminLockedView();
C.ordersTable = () => `<div class="admin-actions"><p class="muted small">Los importes verificados excluyen cotizaciones y pedidos cancelados.</p><div class="flex wrap"><a class="btn btn-primary btn-sm" href="#tienda">Nueva venta</a>${C.btn('export-orders','Exportar CSV','','btn-outline btn-sm')}</div></div>${C.orders.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Código / Fecha</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${C.orders.map(o=>`<tr><td><strong>${C.esc(o.code)}</strong><div class="muted small">${new Date(o.date).toLocaleDateString('es-PE')}</div></td><td>${C.esc(o.customer.name)}</td><td>${o.type==='quote'?'Cotización':'Compra'}</td><td>${C.money(o.total)}</td><td><span class="pill ${['verified','delivered'].includes(o.status)?'green':o.status==='cancelled'?'red':'amber'}">${C.status(o)}</span>${o.type==='purchase'&&['pending','reported'].includes(o.status)?`<div style="margin-top:8px">${C.btn('verify-payment','Confirmar pago','','btn-primary btn-sm',`data-id="${C.esc(o.id)}"`)}</div>`:''}</td><td><div class="flex wrap">${C.btn('order-detail','Abrir','','btn-outline btn-sm',`data-id="${C.esc(o.id)}" data-admin="true"`)}${C.paymentProofImage(o)?C.btn('view-payment-proof','Ver captura','','btn-outline btn-sm',`data-id="${C.esc(o.id)}"`):''}</div></td></tr>`).join('')}</tbody></table></div>`:C.empty('Aún no hay pedidos en este equipo','Los pedidos preparados aquí se guardan en este panel.')}`;
C.productsTable = () => `<div class="admin-actions"><div class="flex wrap">${C.btn('new-item','Nuevo producto','','btn-primary btn-sm','data-type="products"')}${C.btn('publish-selected','Publicar seleccionados','','btn-outline btn-sm','data-publish="true"')}${C.btn('publish-selected','Ocultar seleccionados','','btn-outline btn-sm','data-publish="false"')}</div><label class="check-label small"><input type="checkbox" id="select-all-products"> Seleccionar todos</label></div><div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Producto / Categoría</th><th>Precio</th><th>Stock</th><th>Publicación</th><th>Editar</th></tr></thead><tbody>${C.state.products.map(p=>`<tr><td><input type="checkbox" name="selected-product" value="${p.id}" aria-label="Seleccionar ${C.esc(p.name)}"></td><td><div class="table-product">${C.img(p.images[0],p.name)}<div><strong>${C.esc(p.name)}</strong><p class="muted small">${C.esc(p.category)}${p.reference?' · Referencial':''}</p></div></div></td><td>${p.price===null?'A cotizar':C.money(p.price)}</td><td>${p.stock}</td><td><span class="pill ${p.published?'green':''}">${p.published?'Publicado':'Oculto'}</span></td><td>${C.btn('edit-item','Editar ficha','','btn-outline btn-sm',`data-type="products" data-id="${p.id}"`)}</td></tr>`).join('')}</tbody></table></div>`;
C.settingsPanel = () => `<div class="grid-3">${[['theme-editor','Colores, logo y contacto','Personaliza la identidad, WhatsApp y punto de recojo.'],['payment-editor','QR de Yape','Sube el QR real y el nombre de quien recibe el pago.'],['background-current','Fondos y portadas','Cambia imágenes, color y contraste de cada apartado.']].map(([action,title,text])=>`<div class="card"><h3>${title}</h3><p class="muted small spaced">${text}</p>${C.btn(action,'Configurar','','btn-outline btn-sm spaced')}</div>`).join('')}</div>`;
C.backupPanel = () => `<div class="grid-2"><div class="card"><h3>Conserva tu trabajo</h3><p class="muted spaced">El respaldo JSON incluye textos, imágenes, fondos y catálogo. Puedes incluir pedidos para trasladar también tu registro local.</p><label class="check-label spaced"><input type="checkbox" id="backup-orders"> Incluir pedidos, cierres y capturas locales</label><label class="check-label spaced"><input type="checkbox" id="backup-users"> Incluir usuarios locales (correos y huellas de claves)</label><div class="flex wrap spaced">${C.btn('backup-download','Descargar respaldo','','btn-primary')}${C.btn('backup-import','Restaurar respaldo','','btn-outline')}</div></div><div class="card"><h3>Publica tus cambios</h3><p class="muted spaced">Descarga un ZIP del sitio con el diseño y contenido actuales. Descomprímelo en tu hosting estático. El ZIP público excluye pedidos y datos de clientes.</p>${C.btn('export-site','Descargar sitio actualizado','','btn-primary spaced')}<p class="help">Abre el proyecto con Iniciar-CODETI.cmd para permitir la exportación de sus archivos.</p></div></div>`;
C.actions['admin-tab'] = el => {C.filters.adminTab=el.dataset.id;C.render(false);};
C.actions['publish-selected'] = async el => {const ids=[...document.querySelectorAll('[name=selected-product]:checked')].map(x=>x.value);if(!ids.length)return C.toast('Selecciona los productos que deseas cambiar.');const state=C.clone(C.state);for(const p of state.products)if(ids.includes(p.id))p.published=el.dataset.publish==='true';await C.persist({state});C.render(false);C.toast('Publicación actualizada.');};
document.addEventListener('change',e=>{if(e.target.id==='select-all-products')for(const i of document.querySelectorAll('[name=selected-product]'))i.checked=e.target.checked;});
C.actions['verify-payment'] = el => {
  if(!C.isAdmin?.())return C.requireAdmin(()=>C.actions['verify-payment'](el));
  const o=C.orders.find(o=>o.id===el.dataset.id);if(!o||o.type!=='purchase'||['cancelled','verified','delivered'].includes(o.status))return;
  if(o.shipping===null)return C.toast('Acuerda y registra el envío antes de verificar el total.',true);
  C.modal('Confirmar el abono recibido',`<form id="verify-payment-form" class="form-stack" data-id="${C.esc(o.id)}"><div class="checkout-summary"><div class="summary-item"><span>Pedido</span><strong>${C.esc(o.code)}</strong></div><div class="summary-total"><span>Total por confirmar</span><span>${C.money(o.total)}</span></div></div><div class="notice warning">Comprueba en tu app o cuenta que recibiste el importe completo. Una captura del cliente no confirma el abono.</div><div><label for="payment-amount">Importe abonado (S/)</label><input id="payment-amount" name="amountPaid" type="number" required min="0.01" step="0.01" value="${C.cents(o.total)/100}"><p class="help">Debe coincidir con el total del pedido. Los pagos parciales se coordinan antes de confirmar.</p></div><div><label for="payment-reference">Referencia de operación o medio de cobro (opcional)</label><input id="payment-reference" name="reference" maxlength="100" placeholder="Número de operación Yape / efectivo"></div><div><label for="payment-proof-file">Captura recibida (opcional)</label><input id="payment-proof-file" name="paymentProof" type="file" accept="image/jpeg,image/png,image/webp"><p class="help">JPG, PNG o WebP de hasta 3 MB. Adjunta la imagen que recibiste en WhatsApp; no se carga automáticamente desde el chat. Se conserva el archivo original solo en este navegador.</p></div><label class="check-label"><input id="payment-received" type="checkbox" name="received" required> He comprobado el abono del monto completo.</label><p class="inline-error" id="payment-verification-error" role="alert"></p><button class="btn btn-primary" type="submit">Confirmar pago</button></form>`);
};
C.actions['view-payment-proof'] = el => {
  if(!C.isAdmin?.())return C.requireAdmin(()=>C.actions['view-payment-proof'](el));
  const order=C.orders.find(item=>item.id===el.dataset.id),image=C.paymentProofImage(order);
  if(!order || !image)return C.toast('Este pedido no tiene una captura local guardada.');
  const ext=image.startsWith('data:image/jpeg;')?'jpg':image.startsWith('data:image/webp;')?'webp':'png';
  const filename='Captura-'+String(order.code).replace(/[^a-z0-9_-]/gi,'-')+'.'+ext;
  C.modal('Captura del pago',`<div class="form-stack"><div><strong>${C.esc(order.code)}</strong><p class="help">${C.esc(order.paymentProof.name || 'Captura recibida')} · archivo local de este navegador</p></div>${C.img(image,'Captura del pago del pedido '+order.code,'qr-image',true)}<a class="btn btn-outline" href="${C.esc(image)}" download="${C.esc(filename)}">Descargar captura</a><p class="help">La imagen es un respaldo local. El abono se comprueba directamente en tu app o cuenta.</p></div>`,true);
};
C.actions['set-shipping'] = el => {const o=C.orders.find(o=>o.id===el.dataset.id);if(!o)return;C.modal('Costo de delivery acordado',`<form id="shipping-form" data-id="${o.id}" class="form-stack"><p class="muted">Registra el costo después de coordinarlo con el cliente.</p><div><label for="shipping-amount">Delivery (S/)</label><input id="shipping-amount" name="shipping" type="number" step="0.01" min="0" max="10000" required value="${o.shipping??''}"></div><button class="btn btn-primary" type="submit">Guardar costo</button></form>`);};
C.actions['cancel-order'] = el => C.modal('Cancelar pedido',`<form id="cancel-order-form" data-id="${el.dataset.id}" class="form-stack"><p>Se devolverán al stock las unidades reservadas de este pedido. Si hubo pago, coordina su devolución con el cliente.</p><label class="check-label"><input type="checkbox" required> Confirmo la cancelación.</label><button class="btn btn-danger" type="submit">Cancelar y devolver existencias</button></form>`);
C.actions['deliver-order'] = async el => {const orders=C.clone(C.orders),o=orders.find(o=>o.id===el.dataset.id);if(o?.status!=='verified')return;o.status='delivered';await C.persist({orders});C.render(false);C.orderDetail(o.id,true);};
document.addEventListener('submit',async e=>{
  const form=e.target;if(!['verify-payment-form','shipping-form','cancel-order-form'].includes(form.id))return;e.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
  let verifyingId='',ownsVerification=false;const originalButtonText=button.textContent;
  try {
    let paymentAmount=null,paymentReference='',paymentProof=null;
    if(form.id==='verify-payment-form') {
      if(!C.isAdmin?.())throw new Error('Ingresa de nuevo a CONFIG para confirmar el pago.');
      verifyingId=form.dataset.id;
      if(C.paymentVerificationsBusy.has(verifyingId))throw new Error('Este pago ya se está guardando. Espera un momento.');
      C.paymentVerificationsBusy.add(verifyingId);
      ownsVerification=true;
      const fields=new FormData(form);paymentAmount=Number(fields.get('amountPaid'));
      if(!fields.get('received'))throw new Error('Confirma que comprobaste el abono del monto completo.');
      if(!Number.isFinite(paymentAmount)||paymentAmount<=0)throw new Error('Escribe un importe abonado válido.');
      const current=C.orders.find(item=>item.id===verifyingId);
      if(!current || current.type!=='purchase' || current.shipping===null || !['pending','reported'].includes(current.status))throw new Error('El pedido no admite esta verificación.');
      if(C.cents(paymentAmount)!==C.cents(current.total))throw new Error('El importe abonado debe coincidir con el total de '+C.money(current.total)+'.');
      paymentReference=String(fields.get('reference') || '').trim().slice(0,100);
      const file=fields.get('paymentProof');
      if(file && (file.size>0 || file.name)){button.textContent='Comprobando captura…';paymentProof=await C.readPaymentProof(file);}
      if(!C.isAdmin?.())throw new Error('Tu sesión terminó. Ingresa de nuevo a CONFIG antes de guardar el pago.');
    }
    const orders=C.clone(C.orders),state=C.clone(C.state),o=orders.find(o=>o.id===form.dataset.id);if(!o)throw new Error('No se encontró el pedido.');
    if(form.id==='verify-payment-form') {if(o.type!=='purchase'||o.shipping===null||!['pending','reported'].includes(o.status)||C.cents(paymentAmount)!==C.cents(o.total))throw new Error('El pedido cambió. Revisa su total antes de confirmar.');o.amountPaid=C.cents(paymentAmount)/100;o.paymentReference=paymentReference;o.paymentProof=paymentProof || (C.paymentProofImage(o)?o.paymentProof:null);o.status='verified';o.verifiedAt=new Date().toISOString();}
    if(form.id==='shipping-form') {if(o.status==='cancelled'||['verified','delivered'].includes(o.status))throw new Error('No se puede cambiar el total de este pedido.');const n=Number(new FormData(form).get('shipping'));if(!Number.isFinite(n)||n<0||n>10000)throw new Error('Costo de envío inválido.');o.shipping=C.cents(n)/100;o.total=(C.cents(o.subtotal)+C.cents(n))/100;}
    if(form.id==='cancel-order-form') {if(o.status==='cancelled'||o.status==='delivered')throw new Error('El pedido ya fue cerrado.');if(o.reserved){for(const i of o.items){const p=state.products.find(p=>p.id===i.id);if(p)p.stock+=i.qty;}o.reserved=false;}o.status='cancelled';}
    await C.persist({orders,state});C.render(false);C.orderDetail(o.id,true);C.toast('Pedido actualizado.');
  }catch(err){const error=form.querySelector('#payment-verification-error');if(error)error.textContent=err.message;C.toast(err.message,true);button.disabled=false;button.textContent=originalButtonText;}
  finally {if(ownsVerification)C.paymentVerificationsBusy.delete(verifyingId);}
});
