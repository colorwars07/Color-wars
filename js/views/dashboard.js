/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/dashboard.js
 * DASHBOARD + DETECTOR DE RECONEXIÓN DE PARTIDAS
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { getProfile, setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

registerView('dashboard', initDashboard);

export async function initDashboard($container) {
  const profile = getProfile();
  if (!profile) {
    setView('auth');
    return;
  }

  // ⚡ 1. DETECTOR DE RECONEXIÓN: Revisar si el jugador se desconectó de una partida activa
  const isReconnected = await checkActiveMatch(profile);
  if (isReconnected) {
    // Si encontró una partida, aborta cargar el dashboard y lo manda al tablero
    return;
  }

  // 2. Si no hay partidas activas, mostramos el Dashboard normal
  renderHTML($container, profile);
  attachEvents($container);
}

// Función que va a Supabase a buscar si te quedaste colgado en una pelea
async function checkActiveMatch(profile) {
  const sb = getSupabase();
  try {
    // Busca una partida donde el jugador sea el Rosado O el Azul, y que esté en estado 'playing'
    const { data: activeMatch, error } = await sb
      .from('matches')
      .select('*')
      .eq('status', 'playing')
      .or(`player_pink.eq.${profile.id},player_blue.eq.${profile.id}`)
      .limit(1)
      .maybeSingle();

    if (activeMatch) {
      // ¡Encontramos una partida colgada! Reconstruimos la sesión.
      const myColor = activeMatch.player_pink === profile.id ? 'pink' : 'blue';
      const rivalId = myColor === 'pink' ? activeMatch.player_blue : activeMatch.player_pink;
      
      // Armamos el paquete de memoria de nuevo
      window.CW_SESSION = {
        isBotMatch: rivalId === 'BOT',
        matchId: activeMatch.id,
        myColor: myColor,
        rivalName: rivalId === 'BOT' ? 'BOT' : 'HUMANO',
        // Si la base de datos ya tenía el tablero guardado, lo usamos. Si no, ponemos uno vacío.
        board: activeMatch.board_state || Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
      };
      
      showToast('Reconectando a la batalla...', 'info');
      setView('game');
      return true; // Sí hubo reconexión
    }
  } catch (err) {
    console.error("Error buscando partidas activas:", err);
  }
  return false; // No había partidas pendientes
}

function renderHTML($container, profile) {
  $container.innerHTML = `
    <div class="dash-header">
      <div class="dash-profile">
        <div class="avatar">${profile.email.charAt(0).toUpperCase()}</div>
        <div class="user-info">
          <div class="user-name">${profile.email.split('@')[0]}</div>
          <div class="user-stats">Victorias: ${profile.wins || 0} | Derrotas: ${profile.losses || 0}</div>
        </div>
      </div>
      <button id="btn-logout" class="btn btn-ghost">Salir</button>
    </div>

    <div class="wallet-card">
      <div class="wallet-title">TU BILLETERA</div>
      <div class="wallet-balance">${Number(profile.wallet_bs).toFixed(2)} Bs</div>
      <div style="font-size:0.8rem; color:var(--text-dim); margin-top:5px;">≈ ${(Number(profile.wallet_bs) / 45).toFixed(2)} $</div>
      
      <div class="wallet-actions">
        <button id="btn-recharge" class="btn btn-secondary">RECARGAR</button>
        <button id="btn-withdraw" class="btn btn-secondary">RETIRAR</button>
      </div>
    </div>

    <div class="action-panel">
      <button id="btn-play" class="btn btn-primary" style="height:60px; font-size:1.2rem;">⚔️ BUSCAR BATALLA (200 Bs)</button>
    </div>
  `;
}

function attachEvents($container) {
  $container.querySelector('#btn-logout').addEventListener('click', () => {
    localStorage.removeItem('cw_session');
    setView('auth');
  });
  
  $container.querySelector('#btn-play').addEventListener('click', () => setView('matchmaking'));
  $container.querySelector('#btn-recharge').addEventListener('click', () => setView('recharge'));
  $container.querySelector('#btn-withdraw').addEventListener('click', () => setView('withdraw'));
}
