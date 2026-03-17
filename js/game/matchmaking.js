/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/matchmaking.js
 * (Independiente de state.js)
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { getProfile, setProfile, setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

registerView('matchmaking', initMatchmaking);

let _searchTimer = null;
let _countdownTimer = null;

export async function initMatchmaking($container) {
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  if (profile.wallet_bs < 200) {
    showToast('Saldo insuficiente', 'error');
    setView('dashboard');
    return;
  }

  renderSearchScreen($container);
  startSearch($container);
}

function renderSearchScreen($c) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:2rem;">
      <div class="mm-ring"><span style="font-size:1.5rem;">⚔️</span></div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.2rem; letter-spacing:0.2em; color:var(--text-bright); margin-bottom:0.5rem;">BUSCANDO RIVAL</h2>
        <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">Conectando con la arena...</p>
      </div>
      <button id="btn-cancel-search" class="btn btn-ghost" style="margin-top:2rem;">✕ CANCELAR</button>
    </div>
  </div>`;
  $c.querySelector('#btn-cancel-search').addEventListener('click', cancelSearch);
}

function startSearch($c) {
  _searchTimer = setTimeout(() => {
    renderCountdownScreen($c);
    startCountdown($c);
  }, 3000);
}

function cancelSearch() {
  clearTimeout(_searchTimer);
  clearTimeout(_countdownTimer);
  setView('dashboard');
}

function renderCountdownScreen($c) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
      <div style="width:180px; height:180px; border-radius:50%; border:2px solid var(--border-ghost); display:flex; align-items:center; justify-content:center; position:relative;">
        <span id="mm-count" class="mm-countdown">10</span>
      </div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.4rem; color:var(--text-bright); margin-bottom:0.5rem;">¡RIVAL ENCONTRADO!</h2>
      </div>
    </div>
  </div>`;
}

function startCountdown($c) {
  let count = 10;
  const $count = $c.querySelector('#mm-count');
  
  _countdownTimer = setInterval(async () => {
    count--;
    if ($count) $count.textContent = count;

    if (count <= 0) {
      clearInterval(_countdownTimer);
      
      try {
        // 1. Cobrar entrada (200 Bs)
        const profile = getProfile();
        const newBalance = profile.wallet_bs - 200;
        await getSupabase().from('users').update({ wallet_bs: newBalance }).eq('id', profile.id);
        setProfile({ ...profile, wallet_bs: newBalance });

        // 2. Crear tablero en memoria global (Cero errores)
        window.CW_SESSION = {
          isOver: false,
          board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0, blocked: false })))
        };

        // 3. Saltar a la Arena
        setView('game');
      } catch (err) {
        showToast('Error de conexión', 'error');
        setView('dashboard');
      }
    }
  }, 1000);
}
