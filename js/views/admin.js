/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/admin.js
 * Admin Panel: BCV rate, recharges approval + Auto-Limpieza
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml } from '../core/app.js';
import { getSupabase }                      from '../core/supabase.js';
import { getProfile, setView, setBcvRate, getBcvRate, reloadBcvRate } from '../core/state.js';

registerView('admin', initAdminView);

export async function initAdminView($container) {
  const profile = getProfile();
  if (!profile || profile.role !== 'admin') { setView('auth'); return; }

  await reloadBcvRate();
  await renderAdmin($container);
}

// ── MAIN RENDER ───────────────────────────────────────
async function renderAdmin($c) {
  const sb       = getSupabase();
  const rate     = getBcvRate();

  const [pendingRes, approvedRes, rejectedRes, usersRes] = await Promise.all([
    sb.from('recharges').select('id', { count: 'exact', head: true }).eq('status','pending'),
    sb.from('recharges').select('id', { count: 'exact', head: true }).eq('status','approved'),
    sb.from('recharges').select('id', { count: 'exact', head: true }).eq('status','rejected'),
    sb.from('users').select('id', { count: 'exact', head: true }).neq('role','admin'),
  ]);

  const nPending  = pendingRes.count  ?? 0;
  const nApproved = approvedRes.count ?? 0;
  const nRejected = rejectedRes.count ?? 0;
  const nUsers    = usersRes.count    ?? 0;

  $c.innerHTML = `
  <div class="admin-wrap">

    <div class="admin-hdr">
      <h1 class="admin-title">⚡ Panel de Administración</h1>
      <span class="badge badge-rejected" style="border-color:rgba(255,0,127,.4);">MODO ADMIN</span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem;margin-bottom:1.35rem;">
      ${kpi(nUsers,    'Jugadores',  '👥', 'var(--purple)', 'rgba(112,0,255,.15)')}
      ${kpi(nPending,  'Pendientes', '⏳', '#ffaa00',       'rgba(255,170,0,.15)')}
      ${kpi(nApproved, 'Aprobadas',  '✅', '#00b86c',       'rgba(0,184,108,.15)')}
      ${kpi(nRejected, 'Rechazadas', '❌', 'var(--pink)',   'rgba(255,0,127,.15)')}
    </div>

    <div class="card card-acc" style="margin-bottom:1.25rem;">
      <p style="font-family:var(--font-mono);font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:.85rem;">💱 Tasa BCV (Bs por $)</p>
      <div style="display:flex;align-items:center;gap:.65rem;flex-wrap:wrap;">
        <input id="bcv-input" type="number" step="0.01" min="0" class="input-field"
          style="max-width:200px;" value="${rate}" />
        <button id="btn-save-bcv" class="btn btn-success" style="font-size:.68rem;">
          💾 Guardar Tasa
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.25rem;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.85rem;">
        <p style="font-family:var(--font-display);font-size:.78rem;font-weight:700;letter-spacing:.1em;color:var(--text-bright);">
          RECARGAS PENDIENTES
        </p>
        <button id="btn-refresh" class="btn btn-ghost" style="padding:.32rem .72rem;font-size:.6rem;" onclick="window.__CW_adminRefresh()">↻ Actualizar</button>
      </div>
      <div id="pending-table" style="overflow-x:auto;">Cargando…</div>
    </div>

    <div class="card" style="margin-bottom:1.25rem;overflow:hidden;">
      <p style="font-family:var(--font-display);font-size:.78rem;font-weight:700;letter-spacing:.1em;color:var(--text-bright);margin-bottom:.85rem;">
        HISTORIAL RECARGAS
      </p>
      <div id="history-table" style="overflow-x:auto;">Cargando…</div>
    </div>

    <div class="card" style="overflow:hidden;">
      <p style="font-family:var(--font-display);font-size:.78rem;font-weight:700;letter-spacing:.1em;color:var(--text-bright);margin-bottom:.85rem;">
        USUARIOS REGISTRADOS
      </p>
      <div id="users-table" style="overflow-x:auto;">Cargando…</div>
    </div>

  </div>`;

  $c.querySelector('#btn-save-bcv')?.addEventListener('click', () => saveBcvRate($c));

  loadPendingTable($c);
  loadHistoryTable($c);
  loadUsersTable($c);
}

// ── SAVE BCV ───────────────────────────────────────────
async function saveBcvRate($c) {
  const newRate = parseFloat($c.querySelector('#bcv-input')?.value);
  if (isNaN(newRate) || newRate <= 0) { showToast('Ingresa una tasa válida.', 'error'); return; }

  const $btn = $c.querySelector('#btn-save-bcv');
  $btn.disabled = true; $btn.textContent = 'GUARDANDO…'; $btn.style.opacity = '.65';

  const sb = getSupabase();
  const { error } = await sb.from('sys_config').update({ bcv_rate: newRate }).eq('id', 1);

  $btn.disabled = false; $btn.textContent = '💾 Guardar Tasa'; $btn.style.opacity = '1';

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }

  setBcvRate(newRate);
  showToast(`Tasa BCV actualizada: ${newRate} Bs/$`, 'success');
}

// ── PENDING RECHARGES ─────────────────────────────────
async function loadPendingTable($c) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('recharges')
    .select('*')
    .eq('status','pending')
    .order('created_at', { ascending: false });

  const $el = $c.querySelector('#pending-table');
  if (!$el) return;

  if (error) { $el.innerHTML = `<p class="font-mono text-xs" style="color:var(--pink);padding:.75rem;">${error.message}</p>`; return; }

  if (!data?.length) {
    $el.innerHTML = `<p style="font-family:var(--font-mono);font-size:.72rem;color:var(--text-ghost);padding:1.5rem;text-align:center;">✓ Sin recargas pendientes</p>`;
    return;
  }

  $el.innerHTML = `
  <table class="adm-table">
    <thead>
      <tr>
        <th>Email / Usuario</th>
        <th>USD</th>
        <th>Bs</th>
        <th>Referencia</th>
        <th>Foto</th>
        <th>Fecha</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(r => `
        <tr data-id="${r.id}">
          <td style="font-family:var(--font-mono);font-size:.75rem;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(r.user_email)}</td>
          <td style="font-family:var(--font-display);font-size:.8rem;font-weight:700;color:var(--blue);">$${Number(r.amount_usd).toFixed(2)}</td>
          <td style="font-family:var(--font-mono);font-size:.78rem;">${Number(r.amount_bs).toLocaleString('es-VE')} Bs</td>
          <td style="font-family:var(--font-mono);font-size:.82rem;letter-spacing:.06em;">
            <span style="background:var(--void-2);padding:.18rem .42rem;border-radius:4px;border:1px solid var(--border-ghost);">${escHtml(r.reference)}</span>
          </td>
          <td>
            ${r.image_url
              ? `<a href="${escHtml(r.image_url)}" target="_blank" rel="noopener noreferrer"
                  style="font-size:1.2rem;text-decoration:none;" title="Ver comprobante">👁️</a>`
              : '<span style="color:var(--text-ghost);font-size:.7rem;">N/A</span>'}
          </td>
          <td style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-dim);">${fmtDate(r.created_at)}</td>
          <td>
            <div class="adm-actions">
              <button class="btn btn-success" style="padding:.35rem .75rem;font-size:.6rem;"
                data-action="approve" data-id="${r.id}" data-email="${escHtml(r.user_email)}" data-bs="${r.amount_bs}" data-img="${r.image_url || ''}">
                ✓ Aprobar
              </button>
              <button class="btn btn-danger" style="padding:.35rem .75rem;font-size:.6rem;"
                data-action="reject" data-id="${r.id}" data-img="${r.image_url || ''}">
                ✕ Rechazar
              </button>
            </div>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;

  $el.addEventListener('click', (e) => {
    const $btn = e.target.closest('[data-action]');
    if (!$btn) return;
    const { action, id, email, bs, img } = $btn.dataset;
    if (action === 'approve') handleApprove(id, email, Number(bs), img, $c);
    if (action === 'reject')  handleReject(id, img, $c);
  });
}

// ── AUTO-LIMPIEZA DE FOTOS DE SUPABASE ────────────────
async function deleteImageFromStorage(imageUrl) {
  if (!imageUrl) return;
  try {
    const sb = getSupabase();
    // Extrae la ruta exacta del archivo desde la URL pública
    const filePath = imageUrl.split('/comprobantes/')[1];
    if (filePath) {
      await sb.storage.from('comprobantes').remove([filePath]);
      console.log('🗑️ Comprobante eliminado del servidor para ahorrar espacio.');
    }
  } catch (error) {
    console.warn('No se pudo borrar la imagen de Storage', error);
  }
}

// ── APPROVE ───────────────────────────────────────────
async function handleApprove(id, email, amountBs, imageUrl, $c) {
  const $btns = $c.querySelectorAll(`[data-id="${id}"]`);
  $btns.forEach(b => { b.disabled = true; b.style.opacity = '.5'; });

  const sb = getSupabase();

  const { data: userData, error: userErr } = await sb.from('users').select('id,wallet_bs').eq('email', email).single();

  if (userErr || !userData) {
    showToast(`Usuario no encontrado: ${email}`, 'error');
    $btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    return;
  }

  const newBs = Number(userData.wallet_bs) + amountBs;

  const { error: walletErr } = await sb.from('users').update({ wallet_bs: newBs }).eq('id', userData.id);
  if (walletErr) {
    showToast(`Error al actualizar saldo: ${walletErr.message}`, 'error');
    $btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    return;
  }

  const { error: rcErr } = await sb.from('recharges').update({ status: 'approved' }).eq('id', id);
  if (rcErr) { showToast(`Error al aprobar: ${rcErr.message}`, 'error'); return; }

  // 🔥 Destruye la foto pesada del servidor
  await deleteImageFromStorage(imageUrl);

  showToast(`✓ Recarga aprobada. +${amountBs.toLocaleString('es-VE')} Bs acreditados a ${email}`, 'success', 6000);

  loadPendingTable($c);
  loadHistoryTable($c);
}

// ── REJECT ────────────────────────────────────────────
async function handleReject(id, imageUrl, $c) {
  const $btns = $c.querySelectorAll(`[data-id="${id}"]`);
  $btns.forEach(b => { b.disabled = true; b.style.opacity = '.5'; });

  const sb = getSupabase();
  const { error } = await sb.from('recharges').update({ status: 'rejected' }).eq('id', id);

  if (error) { 
    showToast(`Error: ${error.message}`, 'error'); 
    $btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; }); 
    return; 
  }

  // 🔥 Destruye la foto pesada del servidor también al rechazar
  await deleteImageFromStorage(imageUrl);

  showToast('Recarga rechazada.', 'warning');
  loadPendingTable($c);
  loadHistoryTable($c);
}

// ── HISTORY TABLE ─────────────────────────────────────
async function loadHistoryTable($c) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('recharges')
    .select('user_email,amount_usd,amount_bs,reference,status,created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const $el = $c.querySelector('#history-table');
  if (!$el) return;
  if (error || !data?.length) { $el.innerHTML = `<p style="font-family:var(--font-mono);font-size:.72rem;color:var(--text-ghost);padding:1rem;text-align:center;">Sin registros.</p>`; return; }

  $el.innerHTML = `
  <table class="adm-table">
    <thead><tr><th>Email</th><th>USD</th><th>Bs</th><th>Ref.</th><th>Fecha</th><th>Estado</th></tr></thead>
    <tbody>
      ${data.map(r => `<tr>
        <td style="font-family:var(--font-mono);font-size:.72rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(r.user_email)}</td>
        <td style="font-family:var(--font-display);font-size:.76rem;font-weight:700;color:var(--blue);">$${Number(r.amount_usd).toFixed(2)}</td>
        <td style="font-family:var(--font-mono);font-size:.75rem;">${Number(r.amount_bs).toLocaleString('es-VE')} Bs</td>
        <td style="font-family:var(--font-mono);font-size:.78rem;letter-spacing:.05em;">${escHtml(r.reference)}</td>
        <td style="font-family:var(--font-mono);font-size:.64rem;color:var(--text-dim);">${fmtDate(r.created_at)}</td>
        <td><span class="badge badge-${r.status}">${r.status === 'pending' ? '⏳ Pendiente' : r.status === 'approved' ? '✓ Aprobada' : '✕ Rechazada'}</span></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

// ── USERS TABLE ───────────────────────────────────────
async function loadUsersTable($c) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('users')
    .select('username,email,wallet_bs,wins,losses')
    .neq('role','admin')
    .order('wins', { ascending: false });

  const $el = $c.querySelector('#users-table');
  if (!$el) return;
  if (error || !data?.length) { $el.innerHTML = `<p style="font-family:var(--font-mono);font-size:.72rem;color:var(--text-ghost);padding:1rem;text-align:center;">Sin jugadores.</p>`; return; }

  $el.innerHTML = `
  <table class="adm-table">
    <thead><tr><th>Usuario</th><th>Email</th><th>Bs</th><th>V</th><th>D</th><th>Win%</th></tr></thead>
    <tbody>
      ${data.map(u => {
        const t  = u.wins + u.losses;
        const wr = t > 0 ? Math.round(u.wins/t*100) : 0;
        return `<tr>
          <td style="font-family:var(--font-mono);font-size:.78rem;font-weight:600;color:var(--text-bright);">${escHtml(u.username)}</td>
          <td style="font-family:var(--font-mono);font-size:.68rem;color:var(--text-dim);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(u.email)}</td>
          <td style="font-family:var(--font-display);font-size:.76rem;font-weight:700;color:var(--blue);">${Number(u.wallet_bs).toLocaleString('es-VE')}</td>
          <td style="font-family:var(--font-display);font-size:.78rem;color:var(--pink);font-weight:700;">${u.wins}</td>
          <td style="font-family:var(--font-display);font-size:.78rem;color:var(--blue);">${u.losses}</td>
          <td>
            <div style="display:flex;align-items:center;gap:.4rem;">
              <div style="flex:1;height:3px;background:var(--surface-2);border-radius:2px;min-width:50px;overflow:hidden;">
                <div style="height:100%;width:${wr}%;background:${wr>=50?'var(--pink)':'var(--blue)'};border-radius:2px;"></div>
              </div>
              <span style="font-family:var(--font-mono);font-size:.65rem;color:${wr>=50?'var(--pink)':'var(--blue)'};">${wr}%</span>
            </div>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

// ── Helpers ────────────────────────────────────────────
function kpi(val, label, icon, color, glow) {
  return `<div class="kpi-card">
    <span style="font-size:1.2rem;">${icon}</span>
    <span class="kpi-val" style="color:${color};text-shadow:0 0 10px ${color}44;">${val}</span>
    <span class="kpi-label">${label}</span>
    <div class="kpi-glow" style="background:radial-gradient(circle,${glow},transparent 70%);"></div>
  </div>`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
}

window.__CW_adminRefresh = () => {
  const $c = document.getElementById('view-admin');
  if ($c) { loadPendingTable($c); loadHistoryTable($c); loadUsersTable($c); showToast('Actualizado.', 'info', 1500); }
};
