'use strict';
/* Caja local: un cierre conserva los cobros incluidos y nunca borra los pedidos. */
C.closings = Array.isArray(C.closings) ? C.closings : [];
C.cashCloseBusy = false;
C.dayKey = value => {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Lima', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(date);
  const get = key => parts.find(part => part.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
C.cashDateText = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('es-PE', {timeZone:'America/Lima', dateStyle:'short', timeStyle:'short'}) : 'Sin fecha';
C.validCashDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && C.dayKey(value + 'T12:00:00-05:00') === value;
C.cashReceipt = order => {
  if (!order || order.type !== 'purchase' || !['verified','delivered'].includes(order.status) || !Number.isFinite(Date.parse(order.verifiedAt))) return null;
  const amountCents = C.cents(order.total);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return null;
  return {
    orderId:String(order.id), code:String(order.code || ''), customer:String(order.customer?.name || ''),
    payment:order.payment === 'yape' ? 'Yape' : 'Coordinado', amountCents,
    verifiedAt:new Date(order.verifiedAt).toISOString()
  };
};
C.cashEligible = (asOf = new Date()) => {
  const cutoff = new Date(asOf).getTime();
  if (!Number.isFinite(cutoff)) return [];
  const closed = new Set((C.closings || []).flatMap(closing => (closing.items || []).map(item => item.orderId)));
  const seen = new Set();
  return (C.orders || []).map(C.cashReceipt).filter(item => {
    if (!item || closed.has(item.orderId) || seen.has(item.orderId) || Date.parse(item.verifiedAt) > cutoff) return false;
    seen.add(item.orderId); return true;
  }).sort((a,b) => a.verifiedAt.localeCompare(b.verifiedAt) || a.orderId.localeCompare(b.orderId));
};
C.cashFingerprint = items => items.map(item => [item.orderId,item.amountCents,item.verifiedAt].join(':')).sort().join('|');
C.cashSummary = (day = C.cashDate || C.dayKey()) => {
  const paid = (C.orders || []).map(C.cashReceipt).filter(item => item && C.dayKey(item.verifiedAt) === day);
  const pending = C.cashEligible();
  const closings = (C.closings || []).filter(closing => closing.dateLima === day);
  return {
    day, paid, paidTotalCents:paid.reduce((sum,item) => sum + item.amountCents,0),
    pending, pendingTotalCents:pending.reduce((sum,item) => sum + item.amountCents,0),
    closings, closedTotalCents:closings.reduce((sum,closing) => sum + C.cents(closing.total),0)
  };
};
C.cashDifferences = closing => (closing.items || []).flatMap(item => {
  const order = (C.orders || []).find(order => order.id === item.orderId);
  if (!order) return [`${item.code}: el pedido no figura en el registro actual.`];
  if (order.status === 'cancelled') return [`${item.code}: fue cancelado después de registrar este cierre.`];
  if (!['verified','delivered'].includes(order.status)) return [`${item.code}: su estado actual es ${C.status ? C.status(order) : order.status}.`];
  if (C.cents(order.total) !== item.amountCents) return [`${item.code}: el importe actual del pedido es diferente al del cierre.`];
  return [];
});
C.validateClosings = input => {
  if (!Array.isArray(input) || input.length > 10000) throw new Error('El historial de cierres no es válido.');
  const closureIds = new Set(), orderIds = new Set(); let receiptCount = 0;
  const limited = (value,max) => String(value ?? '').slice(0,max);
  return input.map(closing => {
    if (!closing || !/^[a-z\d_-]{1,80}$/i.test(closing.id) || closureIds.has(closing.id)) throw new Error('Hay un cierre con identificador inválido o repetido.');
    closureIds.add(closing.id);
    if (!Number.isFinite(Date.parse(closing.openedAt)) || !Number.isFinite(Date.parse(closing.closedAt))) throw new Error('Hay un cierre con fechas inválidas.');
    const openedAt = new Date(closing.openedAt).toISOString(), closedAt = new Date(closing.closedAt).toISOString();
    if (openedAt > closedAt || !C.validCashDay(closing.dateLima) || C.dayKey(closedAt) !== closing.dateLima) throw new Error('El período de un cierre no es válido.');
    if (!Array.isArray(closing.items) || closing.items.length < 1 || closing.items.length > 10000) throw new Error('Un cierre debe contener al menos un cobro.');
    receiptCount += closing.items.length;
    if (receiptCount > 100000) throw new Error('El respaldo tiene demasiados cobros cerrados.');
    const items = closing.items.map(item => {
      if (!item || !/^[a-z\d_-]{1,80}$/i.test(item.orderId) || orderIds.has(item.orderId)) throw new Error('Un pedido está incluido en varios cierres o tiene un identificador inválido.');
      if (!Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 || !Number.isFinite(Date.parse(item.verifiedAt))) throw new Error('Hay un cobro con importe o fecha inválidos.');
      const verifiedAt = new Date(item.verifiedAt).toISOString();
      if (verifiedAt < openedAt || verifiedAt > closedAt) throw new Error('Hay un cobro fuera del período de su cierre.');
      orderIds.add(item.orderId);
      return {orderId:item.orderId, code:limited(item.code,100), customer:limited(item.customer,120), payment:limited(item.payment,50), amountCents:item.amountCents, verifiedAt};
    });
    const totalCents = items.reduce((sum,item) => sum + item.amountCents,0);
    if (!Number.isSafeInteger(totalCents)) throw new Error('El importe del cierre excede el límite permitido.');
    return {id:closing.id,code:limited(closing.code,100),dateLima:closing.dateLima,openedAt,closedAt,count:items.length,total:totalCents/100,totalCents,items,note:limited(closing.note,1500),admin:limited(closing.admin,80)};
  });
};
C.cashPanel = () => {
  if (!C.isAdmin?.()) return C.adminLockedView ? C.adminLockedView() : '';
  if (!C.validCashDay(C.cashDate)) C.cashDate = C.dayKey();
  const summary = C.cashSummary(C.cashDate), closings = C.closings || [];
  const differences = closings.reduce((sum,closing) => sum + C.cashDifferences(closing).length,0);
  return `<div class="form-stack"><div class="notice">Caja de este navegador. Se cuentan las compras cuyo pago registraste como verificado o entregado, según la fecha del abono en Lima. Cerrar la jornada conserva el detalle y no borra pedidos ni productos.</div><div class="admin-actions"><div><label for="cash-date">Fecha de cobro (hora de Lima)</label><input id="cash-date" type="date" value="${C.esc(C.cashDate)}"></div><div class="flex wrap">${C.btn('cash-close','Cerrar jornada','','btn-primary',summary.pending.length?'':'disabled')}${C.btn('cash-export','Exportar cierres CSV','','btn-outline',closings.length?'':'disabled')}</div></div><div class="stat-grid" style="margin:0"><div class="stat"><p>Cobros del día seleccionado</p><strong>${C.money(summary.paidTotalCents/100)}</strong><small>${summary.paid.length} cobro${summary.paid.length===1?'':'s'}</small></div><div class="stat"><p>Pendientes de cierre · todas las fechas</p><strong>${C.money(summary.pendingTotalCents/100)}</strong><small>${summary.pending.length} cobro${summary.pending.length===1?'':'s'} por cerrar</small></div><div class="stat"><p>Cierres del día seleccionado</p><strong>${C.money(summary.closedTotalCents/100)}</strong><small>${summary.closings.length} cierre${summary.closings.length===1?'':'s'}</small></div></div>${summary.pending.length?`<div class="notice warning">El próximo cierre incluirá todos los cobros aún no cerrados, también de días anteriores: desde ${C.esc(C.cashDateText(summary.pending[0].verifiedAt))}. El filtro de fecha solo cambia el resumen de consulta.</div>`:''}${differences?`<div class="notice warning">Hay ${differences} diferencia${differences===1?'':'s'} entre los cierres guardados y los pedidos actuales. Revisa el detalle del cierre correspondiente; los importes históricos se conservan.</div>`:''}<div><h3>Cobros del día seleccionado</h3><div class="spaced">${summary.paid.length?C.cashReceiptsTable(summary.paid):C.empty('Sin cobros verificados en esta fecha','Los pedidos pendientes y las cotizaciones no se suman como ingresos.')}</div></div><div><h3>Historial de cierres</h3><p class="help">Los cierres quedan guardados aunque cierres la sesión o la pestaña. Inclúyelos en un respaldo para trasladarlos a otro navegador.</p><div class="spaced">${closings.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Cierre</th><th>Fecha de cierre · Lima</th><th>Cobros</th><th>Total</th><th>Revisión</th><th>Detalle</th></tr></thead><tbody>${closings.map(closing=>`<tr><td><strong>${C.esc(closing.code)}</strong></td><td>${C.esc(C.cashDateText(closing.closedAt))}</td><td>${closing.count}</td><td>${C.money(closing.total)}</td><td><span class="pill ${C.cashDifferences(closing).length?'amber':'green'}">${C.cashDifferences(closing).length?'Revisar cambios':'Guardado'}</span></td><td>${C.btn('cash-detail','Ver cierre','','btn-outline btn-sm',`data-id="${C.esc(closing.id)}"`)}</td></tr>`).join('')}</tbody></table></div>`:C.empty('Todavía no hay cierres','Cuando confirmes el primer cierre, su detalle quedará aquí.')}</div></div></div>`;
};
C.cashReceiptsTable = items => `<div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha de abono · Lima</th><th>Medio</th><th>Importe</th></tr></thead><tbody>${items.map(item=>`<tr><td>${C.esc(item.code)}</td><td>${C.esc(item.customer)}</td><td>${C.esc(C.cashDateText(item.verifiedAt))}</td><td>${C.esc(item.payment)}</td><td>${C.money(item.amountCents/100)}</td></tr>`).join('')}</tbody></table></div>`;
C.openCashClose = (note = '') => {
  const items = C.cashEligible();
  if (!items.length) return C.toast('No hay cobros verificados pendientes de cierre.');
  C.cashCloseDraft = C.cashFingerprint(items);
  C.modal('Cerrar jornada de caja',`<form id="cash-close-form" class="form-stack"><div class="checkout-summary"><h3>Cobros pendientes de cierre</h3><div class="summary-item"><span>Cobros incluidos</span><strong>${items.length}</strong></div><div class="summary-item"><span>Primer abono incluido</span><strong>${C.esc(C.cashDateText(items[0].verifiedAt))}</strong></div><div class="summary-total"><span>Total del cierre</span><span>${C.money(items.reduce((sum,item)=>sum+item.amountCents,0)/100)}</span></div></div><div class="notice">Se guardará una copia del detalle de estos cobros. Los pedidos y productos se conservan. Los cobros de días anteriores que aún estén abiertos también quedan incluidos.</div>${C.cashReceiptsTable(items)}<div><label for="cash-close-note">Observación (opcional)</label><textarea id="cash-close-note" name="note" maxlength="1500">${C.esc(note)}</textarea></div><label class="check-label"><input type="checkbox" name="confirm" required> Revisé los cobros y confirmo el cierre de esta jornada.</label><button class="btn btn-primary full" type="submit">Guardar cierre de jornada</button><p class="inline-error" id="cash-close-error" role="alert"></p></form>`,true);
};
C.commitCashClosing = async (note = '', expectedFingerprint = '') => {
  if (!C.isAdmin?.()) throw new Error('Inicia sesión como CONFIG para cerrar caja.');
  if (C.cashCloseBusy) throw new Error('Espera a que termine de guardarse el cierre.');
  C.cashCloseBusy = true;
  try {
    const now = new Date(), items = C.cashEligible(now);
    if (!items.length) throw new Error('Estos cobros ya están cerrados o no hay ingresos pendientes.');
    if (expectedFingerprint && C.cashFingerprint(items) !== expectedFingerprint) throw new Error('Los cobros cambiaron. Cierra esta ventana y revisa el resumen antes de confirmar de nuevo.');
    let id = C.uid(), attempts = 0;
    while ((C.closings || []).some(closing => closing.id === id)) {
      if (++attempts > 5) throw new Error('No se pudo asignar un código de cierre. Vuelve a intentarlo.');
      id = C.uid();
    }
    const closedAt = now.toISOString(), totalCents = items.reduce((sum,item)=>sum+item.amountCents,0);
    const closing = {
      id,code:'CJ-'+C.dayKey(now).replaceAll('-','')+'-'+id.slice(-6).toUpperCase(),dateLima:C.dayKey(now),
      openedAt:items[0].verifiedAt,closedAt,count:items.length,total:totalCents/100,totalCents,
      items:C.clone(items),note:String(note || '').trim().slice(0,1500),admin:String(window.CODETI_ADMIN?.username || 'config').slice(0,80)
    };
    const next = C.validateClosings([closing,...(C.closings || [])]);
    await C.persist({closings:next}); C.cashCloseDraft = null;
    return next[0];
  } finally { C.cashCloseBusy = false; }
};
C.openCashDetail = id => {
  const closing = (C.closings || []).find(closing => closing.id === id); if (!closing) return;
  const differences = C.cashDifferences(closing);
  C.modal('Cierre de jornada',`<div class="print-only"><h1>${C.esc(C.state.settings.name)}</h1><p>Resumen interno de caja local</p></div><div class="flex between wrap"><strong class="order-code">${C.esc(closing.code)}</strong><span class="pill green">Cierre guardado</span></div><p class="help">Desde ${C.esc(C.cashDateText(closing.openedAt))} hasta ${C.esc(C.cashDateText(closing.closedAt))} · hora de Lima</p><div class="checkout-summary spaced"><div class="summary-item"><span>Cobros incluidos</span><strong>${closing.count}</strong></div><div class="summary-total"><span>Total registrado</span><span>${C.money(closing.total)}</span></div></div><div class="spaced">${C.cashReceiptsTable(closing.items)}</div>${closing.note?`<p class="order-note"><strong>Observación:</strong> ${C.esc(closing.note)}</p>`:''}<p class="help">Registrado por ${C.esc(closing.admin || 'config')} en este navegador.</p>${differences.length?`<div class="notice warning spaced"><strong>Cambios posteriores o diferencias actuales</strong><ul>${differences.map(text=>`<li>${C.esc(text)}</li>`).join('')}</ul><p>Este cierre conserva su importe original. Coordina y registra por separado las devoluciones o ajustes que correspondan.</p></div>`:''}<div class="notice spaced">Este resumen es un registro local. No acredita por sí mismo un abono ni sustituye una boleta o factura.</div><div class="order-tools">${C.btn('print-order','Imprimir / Guardar PDF','','btn-outline')}</div>`,true);
};
C.actions['cash-close'] = () => C.requireAdmin(() => C.openCashClose());
C.actions['cash-detail'] = element => C.requireAdmin(() => C.openCashDetail(element.dataset.id));
C.actions['cash-export'] = () => C.requireAdmin(() => {
  if (!(C.closings || []).length) return C.toast('Aún no hay cierres para exportar.');
  const rows = [['Cierre','Fecha Lima','Apertura UTC','Cierre UTC','Cobros','Total PEN','Usuario','Observación','Diferencias actuales']];
  for (const closing of C.closings) rows.push([closing.code,closing.dateLima,closing.openedAt,closing.closedAt,closing.count,closing.total,closing.admin,closing.note,C.cashDifferences(closing).join(' | ')]);
  const cell = value => {let text=String(value ?? '');if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  C.download('CODETI_cierres_'+C.dayKey()+'.csv','\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
});
document.addEventListener('change',event => {
  if (event.target.id !== 'cash-date') return;
  if (!C.isAdmin?.()) return;
  if (!C.validCashDay(event.target.value)) return C.toast('Selecciona una fecha válida.',true);
  C.cashDate = event.target.value; C.render(false);
});
document.addEventListener('submit',async event => {
  const form=event.target;if(form.id!=='cash-close-form')return;event.preventDefault();
  if(!C.isAdmin?.())return C.requireAdmin(() => C.openCashClose());
  const button=form.querySelector('[type=submit]');if(button.disabled)return;
  const error=document.getElementById('cash-close-error');
  if(!form.elements.namedItem('confirm')?.checked){error.textContent='Confirma que revisaste los cobros antes de guardar.';return;}
  button.disabled=true;
  try {
    const closing=await C.commitCashClosing(new FormData(form).get('note'),C.cashCloseDraft);
    C.render(false);C.openCashDetail(closing.id);C.toast('Cierre guardado. El historial y los pedidos se conservan.');
  }catch(problem){error.textContent=problem.message;button.disabled=false;}
});
