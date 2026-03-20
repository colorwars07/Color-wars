/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/matchmaking.js
 * MONOLITO ESTÉTICO BINDADO (Inline Styles)
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { setView, getProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

let _searchInterval = null;
let _isSearching = false;

registerView('matchmaking', initMatchmaking);

export async function initMatchmaking($container) {
    // 🧹 Limpieza profunda de seguridad
    _isSearching = false;
    clearInterval(_searchInterval);
    if (window.CW_SESSION) window.CW_SESSION = null; 

    // 🎨 INYECCIÓN ESTÉTICA MAESTRA (Todo inline para cero fallos)
    $container.innerHTML = `
        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width:100%; position:absolute; top:0; left:0; background:var(--bg-dark); z-index:99;">
            
            <style>
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0.5; }
                    50% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(1.3); opacity: 0; }
                }
            </style>

            <div style="position:relative; width:140px; height:140px; margin-bottom:40px; display:flex; justify-content:center; align-items:center;">
                <div style="position:absolute; width:100%; height:100%; border-radius:50%; background: radial-gradient(circle, var(--pink) 0%, rgba(0,0,0,0) 70%); animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite; z-index: 1;"></div>
                
                <div style="position:relative; width:100px; height:100px; border-radius:50%; background:#10101a; border:3px solid white; display:flex; justify-content:center; align-items:center; box-shadow:0 0 30px rgba(255,255,255,0.2); z-index: 2;">
                    <span style="font-size:3rem;">⚔️</span>
                </div>
            </div>

            <h2 style="font-family:var(--font-display); color:white; font-size:1.8rem; letter-spacing:3px; text-transform:uppercase; margin:0 0 10px 0; text-align:center; text-shadow:2px 0 var(--blue), -2px 0 var(--pink);">BUSCANDO RIVAL</h2>
            
            <p id="cw-status-text" style="font-family:var(--font-mono); color:var(--text-dim); font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; margin:0; text-align:center;">CONECTANDO CON LA ARENA...</p>
            
            <button id="btn-cancel-search" class="btn btn-ghost" style="margin-top:60px; width:200px;">✕ CANCELAR</button>
        </div>
    `;

    $container.querySelector('#btn-cancel-search').onclick = () => {
        stopSearch();
        setView('dashboard');
    };

    startSearch();
}

async function startSearch() {
    if (_isSearching) return;
    _isSearching = true;

    const profile = getProfile();
    const sb = getSupabase();

    let seconds = 0;
    _searchInterval = setInterval(async () => {
        if (!_isSearching) return clearInterval(_searchInterval);
        seconds++;
        
        // Sincronización del texto de estado
        const statusEl = document.getElementById('cw-status-text');
        if (statusEl) {
            if (seconds === 2) statusEl.textContent = "ESCANEANDO CANALES...";
            if (seconds === 4) statusEl.textContent = "SINCRONIZANDO OPONENTES...";
        }

        try {
            const { data: openMatches } = await sb.from('matches')
                .select('*')
                .eq('status', 'waiting')
                .neq('creator_id', profile.id)
                .limit(1);

            if (openMatches && openMatches.length > 0) {
                const match = openMatches[0];
                const { data: joinedMatch, error } = await sb.from('matches')
                    .update({ 
                        opponent_id: profile.id, 
                        status: 'playing',
                        match_start_time: new Date().toISOString()
                    })
                    .eq('id', match.id)
                    .select()
                    .single();

                if (joinedMatch) {
                    stopSearch();
                    window.CW_SESSION = { matchId: joinedMatch.id, myColor: 'blue', rivalName: joinedMatch.creator_username || 'RIVAL', board: joinedMatch.board_state };
                    setView('game');
                    return;
                }
            }

            // 🤖 Si pasan 6 segundos, soltar al Bot
            if (seconds >= 6) {
                stopSearch();
                createBotMatch();
            }
        } catch (e) { console.error("Error en matchmaking:", e); }
    }, 1000);
}

function stopSearch() { _isSearching = false; clearInterval(_searchInterval); }

async function createBotMatch() {
    const profile = getProfile();
    const sb = getSupabase();
    const board = Array(5).fill().map(() => Array(5).fill().map(() => ({ owner: null, mass: 0 })));

    const { data: match, error } = await sb.from('matches').insert({
        creator_id: profile.id,
        opponent_id: '00000000-0000-0000-0000-000000000000', 
        creator_username: profile.username,
        status: 'playing',
        board_state: board,
        current_turn: 'pink',
        match_start_time: new Date().toISOString(),
        last_move_time: new Date().toISOString()
    }).select().single();

    if (error) { showToast("Error al crear arena de práctica", "error"); setView('dashboard'); return; }

    window.CW_SESSION = { matchId: match.id, isBotMatch: true, myColor: 'pink', botName: 'DAYANA (BOT)', board: board };
    setView('game');
}
