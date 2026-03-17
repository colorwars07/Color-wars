import { registerView, showToast, escHtml } from '../core/app.js';
import { getSupabase } from '../core/supabase.js';
import { getProfile, setView, setBcvRate, getBcvRate, reloadBcvRate } from '../core/state.js';

registerView('admin', initAdminView);

export async function initAdminView($container) {
  const profile = getProfile();
  if (!profile || profile.role !== 'admin') { setView('auth'); return; }
  await reloadBcvRate();
  await renderAdmin($container);
}

async function renderAdmin($c) {
  const rate = getBcvRate();
  $c.innerHTML = `
  <div class="admin-wrap">
    <div class="admin-hdr">
      <h1 class="admin-title">⚡ ADMIN COMMAND CENTER</h1>
    </div>

    <div class="card card-acc" style="margin-bottom:1.25rem;">
      <p style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-dim);margin-bottom:.85rem;">💱 Tasa BCV (Bs por $)</p>
      <div style="display:flex;gap:.65rem;">
        <input id="bcv-input" type="number" step="0.01" class="input-field" style="max-width:150px;" value="${rate}" />
        <button id="btn-save-bcv" class="btn btn-success">Guardar</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:1rem;border-bottom:1px solid var(--border-ghost);padding-bottom:10px;">
      <button class="btn btn-primary" onclick="document.getElementById('sec-recargas').style.display='block';document.getElementById('sec-retiros').style.display='none';">📥 RECARGAS</button>
      <button class="btn btn-danger" onclick="document.getElementById('sec-recargas').style.display='none';document.getElementById('sec-retiros').style.display='block';">📤 RETIROS</button>
    </div>

    <div id="sec-recargas">
      <div class="card" style="margin-bottom:1.25rem;">
        <h3 style="color:var(--blue);margin-bottom:1rem;font-family:var(--font-display);">RECARGAS PENDIENTES</h3>
        <div id="pending-table" style="overflow-x:auto;">Cargando...</div>
      </div>
    </div>

    <div id="sec-retiros" style="display:none;">
      <div class="card" style="margin-bottom:1.25rem; border-color:var(--pink);">
        <h3 style="color:var(--pink);margin-bottom:1rem;font-family:var(--font-display);">RETIROS PENDIENTES</h3>
        <div id="withdrawals-table" style="overflow-x:auto;">Cargando...</div>
      </div>
    </div>

  </div>`;

  $c.querySelector('#btn-save-bcv')?.addEventListener('click', () => saveBcvRate($c));
  loadPendingTable($c);
  loadWithdrawalsTable($c);
}

// ── GUARDAR TASA ───────────────────────────────────────────
async function saveBcvRate($c) {
  const newRate = parseFloat($c.querySelector('#bcv-input')?.value);
  if (isNaN(newRate) || newRate <= 0) return;
  const sb = getSupabase();
  await sb.from('sys_config').update({ bcv_rate: newRate }).eq('id', 1);
  setBcvRate(newRate);
  showToast('Tasa actualizada', 'success');
}

// ── RECARGAS ───────────────────────────────────────────
async function loadPendingTable($c) {
  const sb = getSupabase();
  const { data } = await sb.from('recharges').select('*').eq('status','pending').order('created_at', { ascending: false });
  const $el = $c.querySelector('#pending-table');
  if (!$el) return;
  if (!data?.length) { $el.innerHTML = '<p>No hay recargas pendientes.</p>'; return; }

  $el.innerHTML = `<table class="adm-table">
    <thead><tr><th>Usuario</th><th>Bs</th><th>Ref</th><th>Foto</th><th>Acción</th></tr></thead>
    <tbody>${data.map(r => `
      <tr data-id="${r.id}">
        <td>${escHtml(r.user_email)}</td>
        <td style="color:#00b86c;font-weight:bold;">${r.amount_bs} Bs</td>
        <td>${escHtml(r.reference)}</td>
        <td><a href="${escHtml(r.image_url)}" target="_blank">Ver 👁️</a></td>
        <td>
          <button class="btn btn-success" data-action="app-rec" data-id="${r.id}" data-email="${escHtml(r.user_email)}" data-bs="${r.amount_bs}" data-img="${r.image_url}">✓</button>
          <button class="btn btn-danger" data-action="rej-rec" data-id="${r.id}" data-img="${r.image_url}">✕</button>
        </td>
      </tr>`).join('')}</tbody></table>`;

  $el.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    btn.disabled = true;
    if(btn.dataset.action === 'app-rec') handleApproveRec(btn.dataset, $c);
    if(btn.dataset.action === 'rej-rec') handleRejectRec(btn.dataset, $c);
  });
}

async function handleApproveRec({id, email, bs, img}, $c) {
  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id,wallet_bs').eq('email', email).single();
  if (user) {
    await sb.from('users').update({ wallet_bs: Number(user.wallet_bs) + Number(bs) }).eq('id', user.id);
    await sb.from('recharges').update({ status: 'approved' }).eq('id', id);
    sb.storage.from('comprobantes').remove([img.split('/comprobantes/')[1]]).catch(()=>{}); // Borrado silencioso y rápido
    showToast(`Aprobado: +${bs} Bs`, 'success');
    loadPendingTable($c);
  }
}

async function handleRejectRec({id, img}, $c) {
  const sb = getSupabase();
  await sb.from('recharges').update({ status: 'rejected' }).eq('id', id);
  sb.storage.from('comprobantes').remove([img.split('/comprobantes/')[1]]).catch(()=>{});
  showToast('Rechazado', 'warning');
  loadPendingTable($c);
}

// ── RETIROS ───────────────────────────────────────────
async function loadWithdrawalsTable($c) {
  const sb = getSupabase();
  const { data } = await sb.from('withdrawals').select('*').eq('status','pending').order('created_at', { ascending: false });
  const $el = $c.querySelector('#withdrawals-table');
  if (!$el) return;
  if (!data?.length) { $el.innerHTML = '<p>No hay retiros pendientes.</p>'; return; }

  $el.innerHTML = `<table class="adm-table">
    <thead><tr><th>Usuario</th><th>Monto a Pagar</th><th>Datos (Pago Móvil)</th><th>Acción</th></tr></thead>
    <tbody>${data.map(r => `
      <tr data-id="${r.id}">
        <td>${escHtml(r.user_email)}</td>
        <td style="color:var(--pink);font-weight:bold;">-${r.amount_bs} Bs</td>
        <td><textarea readonly style="width:100%;background:transparent;color:white;">${escHtml(r.payment_info)}</textarea></td>
        <td>
          <button class="btn btn-success" data-action="app-wit" data-id="${r.id}">Pagado ✓</button>
          <button class="btn btn-danger" data-action="rej-wit" data-id="${r.id}" data-email="${escHtml(r.user_email)}" data-bs="${r.amount_bs}">Rechazar ✕</button>
        </td>
      </tr>`).join('')}</tbody></table>`;

  $el.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    btn.disabled = true;
    if(btn.dataset.action === 'app-wit') handleApproveWit(btn.dataset, $c);
    if(btn.dataset.action === 'rej-wit') handleRejectWit(btn.dataset, $c);
  });
}

async function handleApproveWit({id}, $c) {
  await getSupabase().from('withdrawals').update({ status: 'approved' }).eq('id', id);
  showToast('Retiro marcado como PAGADO', 'success');
  loadWithdrawalsTable($c);
}

async function handleRejectWit({id, email, bs}, $c) {
  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id,wallet_bs').eq('email', email).single();
  if (user) {
    // Si rechazas el retiro, le devuelves la plata al jugador en la página
    await sb.from('users').update({ wallet_bs: Number(user.wallet_bs) + Number(bs) }).eq('id', user.id);
    await sb.from('withdrawals').update({ status: 'rejected' }).eq('id', id);
    showToast('Retiro rechazado. Saldo devuelto al jugador.', 'warning');
    loadWithdrawalsTable($c);
  }
}
