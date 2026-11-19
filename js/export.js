'use strict';
C.download = (filename,data,type='application/octet-stream') => {
  const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
C.exportFiles=['index.html','css/styles.css','js/defaults.js','js/core.js','js/app.js','js/commerce.js','js/editor.js','js/cash.js','js/admin.js','js/user-seed.js','js/users.js','js/export.js','assets/bootstrap.min.css','assets/codeti-logo.png','assets/internet-hogar.png','assets/router.jpg','assets/portatil.jpg','assets/camara.jpg','assets/proyectos-referencia.jpg','assets/sistema.svg','assets/pos.svg','assets/farmacia.svg','assets/producto.svg','README.md','Iniciar-CODETI.cmd','tools/server.mjs'];
C.crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
C.crc32 = bytes => {let crc=0xffffffff;for(const byte of bytes)crc=C.crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
C.zip = files => {
  const encode=new TextEncoder(),parts=[],central=[];let offset=0,centralSize=0;
  const now=new Date(),date=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
  for(const file of files) {
    const name=encode.encode(file.name),body=file.body instanceof Uint8Array?file.body:encode.encode(file.body),crc=C.crc32(body),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(10,time,true);v.setUint16(12,date,true);v.setUint32(14,crc,true);v.setUint32(18,body.length,true);v.setUint32(22,body.length,true);v.setUint16(26,name.length,true);local.set(name,30);parts.push(local,body);
    const entry=new Uint8Array(46+name.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(12,time,true);e.setUint16(14,date,true);e.setUint32(16,crc,true);e.setUint32(20,body.length,true);e.setUint32(24,body.length,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);entry.set(name,46);central.push(entry);centralSize+=entry.length;offset+=local.length+body.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...central,end],{type:'application/zip'});
};
C.actions=C.actions||{};
/* app.js registra los manejadores después; se instalan al terminar de cargar los scripts. */
document.addEventListener('DOMContentLoaded',()=>{
  C.actions['export-site']=async button=>{
    if(location.protocol==='file:')return C.toast('Para exportar el ZIP, abre Iniciar-CODETI.cmd y usa la dirección local.',true);
    if(button.disabled)return;button.disabled=true;const previous=button.textContent;button.textContent='Preparando ZIP…';
    try {
      const files=[];
      for(const name of C.exportFiles) {
        const response=await fetch(new URL(name,document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('No se pudo incluir '+name);
        let body=new Uint8Array(await response.arrayBuffer());
        if(name==='index.html') {
          let html=new TextDecoder().decode(body),seed=JSON.stringify(C.state).replace(/</g,'\\u003c');
          html=html.replace(/<script id="site-seed"[^>]*>[\s\S]*?<\/script>/,()=>`<script id="site-seed" data-revision="${C.uid()}" type="application/json">${seed}</script>`);
          body=new TextEncoder().encode(html);
        }
        files.push({name:'CODETI_HTML/'+name,body});
      }
      C.download('CODETI_HTML_actualizado.zip',C.zip(files));C.toast('Sitio exportado con tus cambios. El ZIP público excluye los pedidos.');
    }finally{button.disabled=false;button.textContent=previous;}
  };
  C.actions['backup-download']=()=>{
    const include=!!document.getElementById('backup-orders')?.checked;
    const includeUsers=!!document.getElementById('backup-users')?.checked;
    C.download('CODETI_respaldo_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'codeti-visual-backup',version:1,date:new Date().toISOString(),state:C.state,...(include?{orders:C.orders,closings:C.closings}: {}),...(includeUsers?{users:C.users}:{})},null,2),'application/json');
    C.toast(include||includeUsers?'Respaldo privado descargado. Contiene datos personales locales.':'Respaldo del sitio descargado.');
  };
  C.actions['backup-import']=()=>C.modal('Restaurar respaldo',`<form id="backup-import-form" class="form-stack"><p>Elige un respaldo JSON descargado de esta versión. Se mostrará su contenido antes de reemplazar el guardado de este navegador.</p><div><label for="backup-file">Archivo de respaldo</label><input type="file" id="backup-file" accept="application/json,.json"></div><div><label for="backup-text">O pega aquí el contenido del respaldo JSON</label><textarea id="backup-text" rows="4" placeholder="{...}"></textarea></div><div id="backup-preview" class="notice" hidden></div><label class="check-label"><input type="checkbox" required> Reemplazar el contenido local por este respaldo.</label><button class="btn btn-primary" type="submit">Restaurar contenido</button><p class="inline-error" id="backup-error" role="alert"></p></form>`);
  C.actions['export-orders']=()=>{
    const rows=[['Código','Fecha','Cliente','Celular','Entrega','Dirección','Productos','Envío','Total','Estado','Referencia']];
    for(const o of C.orders)rows.push([o.code,o.date,o.customer.name,o.customer.phone,o.delivery,o.customer.address,o.items.map(i=>i.qty+' × '+i.name).join(' | '),o.shipping??'Por coordinar',o.total,C.status(o),o.paymentReference]);
    const cell=value=>{let s=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    C.download('CODETI_pedidos.csv','\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
});
C.validPaidAmount = (value,status,total) => {const paid=Number(value);if(!Number.isFinite(paid)||paid<0||paid>10000000||(['verified','delivered'].includes(status)&&C.cents(paid)!==C.cents(total)))throw new Error('Hay un importe abonado inválido.');return C.cents(paid)/100;};
C.validatePaymentProof = proof => {if(!proof)return null;const src=C.image(proof.image);if(!src||!src.startsWith('data:image/')||src.length>4200000||!Number.isFinite(Date.parse(proof.date)))throw new Error('Hay una captura local de pago inválida.');return {image:src,name:String(proof.name||'captura').slice(0,180),date:new Date(proof.date).toISOString()};};
C.validOrderUserId = value => {if(!value)return '';if(!/^[a-z\d_-]{1,80}$/i.test(value))throw new Error('Hay un usuario de pedido inválido.');return String(value);};
C.validOrderEmail = value => {if(!value)return '';const mail=String(value).trim().toLowerCase();if(mail.length>254||!/^([^\s@]+)@([^\s@]+)\.[^\s@]+$/.test(mail))throw new Error('Hay un correo de pedido inválido.');return mail;};
C.validateOrders = input => {
  if(!Array.isArray(input)||input.length>10000)throw new Error('El registro de pedidos no es válido.');
  const allowed=['quoted','pending','reported','verified','delivered','cancelled'],string=(v,n=2000)=>String(v??'').slice(0,n);
  const orders=input.map(o=>{
    if(!o.customer||!Array.isArray(o.items)||!['quote','purchase'].includes(o.type)||!allowed.includes(o.status)||!Number.isFinite(Date.parse(o.date))||!/^[a-z\d_-]{1,80}$/i.test(o.id))throw new Error('Hay un pedido con estructura inválida.');
    const items=o.items.slice(0,500).map(i=>{const price=i.price===null?null:Number(i.price),qty=Number(i.qty);if(!Number.isInteger(qty)||qty<1||qty>99||price!==null&&(!Number.isFinite(price)||price<0||price>10000000))throw new Error('Hay cantidades o precios inválidos.');return {id:string(i.id,80),name:string(i.name,160),price,qty,reference:!!i.reference};});
    const subtotal=items.reduce((s,i)=>s+C.cents(i.price)*i.qty,0)/100,shipping=o.shipping===null?null:Number(o.shipping);
    if(shipping!==null&&(!Number.isFinite(shipping)||shipping<0||shipping>10000))throw new Error('Hay un costo de envío inválido.');
    return {id:string(o.id,80),code:string(o.code,80),date:o.date,type:o.type,status:o.status,items,subtotal,shipping,total:(C.cents(subtotal)+C.cents(shipping))/100,userId:C.validOrderUserId(o.userId),customer:{name:string(o.customer.name,120),email:C.validOrderEmail(o.customer.email),phone:C.phone(o.customer.phone),location:string(o.customer.location,100),address:string(o.customer.address,1000)},delivery:o.delivery==='delivery'?'delivery':'pickup',receipt:string(o.receipt,20),document:string(o.document,20),company:string(o.company,200),payment:string(o.payment,30),note:string(o.note),reserved:!!o.reserved,paymentReference:string(o.paymentReference,100),amountPaid:o.amountPaid===undefined?(['verified','delivered'].includes(o.status)?(C.cents(subtotal)+C.cents(shipping))/100:0):C.validPaidAmount(o.amountPaid,o.status,(C.cents(subtotal)+C.cents(shipping))/100),paymentProof:C.validatePaymentProof(o.paymentProof),verifiedAt:Number.isFinite(Date.parse(o.verifiedAt))?o.verifiedAt:''};
  });
  if(new Set(orders.map(o=>o.id)).size!==orders.length)throw new Error('El respaldo contiene pedidos repetidos.');return orders;
};
C.prepareImport = raw => {
  const doc=JSON.parse(raw);if(doc.format!=='codeti-visual-backup')throw new Error('Selecciona un respaldo CODETI Visual.');
  const state=C.validate(doc.state),orders=doc.orders===undefined?undefined:C.validateOrders(doc.orders);
  const closings=doc.orders!==undefined?C.validateClosings(doc.closings||[]):doc.closings===undefined?undefined:C.validateClosings(doc.closings);
  const users=doc.users===undefined?undefined:C.validateUsers(doc.users);
  C.importDraft={state,orders,closings,users};const preview=document.getElementById('backup-preview');preview.hidden=false;preview.textContent=`${state.products.length} productos, ${state.systems.length} sistemas y ${state.gallery.length} fotos. ${orders===undefined?'Se conservarán los pedidos actuales.':orders.length+' pedidos y '+(closings?.length||0)+' cierres reemplazarán el registro actual.'}`;
  preview.textContent+=users===undefined?' Se conservarán los usuarios locales actuales.':' Se reemplazarán '+users.length+' usuarios locales.';
};
document.addEventListener('input',e=>{if(e.target.id!=='backup-text')return;C.importDraft=null;try{C.prepareImport(e.target.value);document.getElementById('backup-error').textContent='';}catch{document.getElementById('backup-preview').hidden=true;}});
document.addEventListener('change',async e=>{
  if(e.target.id!=='backup-file')return;C.importDraft=null;
  try {
    const f=e.target.files[0];if(!f)return;if(f.size>200*1024*1024)throw new Error('El respaldo supera 200 MB.');
    C.prepareImport(await f.text());
    document.getElementById('backup-error').textContent='';
  }catch(err){document.getElementById('backup-error').textContent=err.message;}
});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='backup-import-form')return;e.preventDefault();const btn=e.target.querySelector('[type=submit]');if(btn.disabled)return;btn.disabled=true;
  try {if(!C.importDraft)throw new Error('Carga un respaldo válido.');const {state,orders,closings,users}=C.importDraft;await C.persist({state,cart:[],...(orders===undefined?{}:{orders}),...(closings===undefined?{}:{closings}),...(users===undefined?{}:{users})});C.initUserSession?.();C.importDraft=null;C.closeModal();document.getElementById('editor').close();C.render(false);C.toast('Respaldo restaurado.');}
  catch(err){document.getElementById('backup-error').textContent=err.message;btn.disabled=false;}
});
