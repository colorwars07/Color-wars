/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/matchmaking.js
 * LIMPIEZA PROFUNDA + EMPAREJAMIENTO RÁPIDO
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { setView, getProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

let _searchInterval = null;
let _isSearching = false;

registerView('matchmaking', initMatchmaking);

export async function initMatchmaking($container) {
    // 🧹 LIMPIEZA DE SEGURIDAD: 
    // Si venimos de una partida, nos aseguramos de que no queden rastros.
    _isSearching = false;
    clearInterval(_searchInterval);
    if (window.CW_SESSION) window.CW_SESSION = null; 

    $container.innerHTML = `
        <div class="matchmaking-screen">
            <div class="search-circle">
                <div class="pulse"></div>
                <span class="icon">⚔️</span>
            </div>
            <h2 class="glitch-text" data-text="BUSCANDO RIVAL">BUSCANDO RIVAL</h2>
            <p class="status-text">CONECTANDO CON LA ARENA...</p>
            <button id="btn-cancel-search" class="btn btn-ghost" style="margin-top:40px;">✕ CANCELAR</button>
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

    // ⏱️ PASO 1: Intentar buscar un humano por 5 segundos
    let seconds = 0;
    _searchInterval = setInterval(async () => {
        seconds++;
        
        // Simular cambio de texto para que el usuario no se aburra
        const statusEl = document.querySelector('.status-text');
        if (statusEl) {
            if (seconds === 2) statusEl.textContent = "ESCANEANDO OPONENTES...";
            if (seconds === 4) statusEl.textContent = "SINCRONIZANDO CANALES...";
        }

        try {
            // Intentar unirse a una partida existente
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
                        match_start_time: new Date().toISOString() // Sello de tiempo real
                    })
                    .eq('id', match.id)
                    .select()
                    .single();

                if (joinedMatch) {
                    stopSearch();
                    window.CW_SESSION = {
                        matchId: joinedMatch.id,
                        myColor: 'blue',
                        rivalName: 'RIVAL',
                        board: joinedMatch.board_state
                    };
                    setView('game');
                    return;
                }
            }

            // 🤖 PASO 2: Si pasan 6 segundos y no hay nadie, ¡SOLTAR AL BOT!
            if (seconds >= 6) {
                stopSearch();
                createBotMatch();
            }
        } catch (e) {
            console.error("Error en matchmaking:", e);
        }
    }, 1000);
}

function stopSearch() {
    _isSearching = false;
    clearInterval(_searchInterval);
}

async function createBotMatch() {
    const profile = getProfile();
    const sb = getSupabase();

    // Crear tablero vacío profesional
    const board = Array(5).fill().map(() => Array(5).fill().map(() => ({ owner: null, mass: 0 })));

    // Insertar en Supabase para que tenga un ID real y funcionen los relojes
    const { data: match, error } = await sb.from('matches').insert({
        creator_id: profile.id,
        opponent_id: '00000000-0000-0000-0000-000000000000', // ID Genérico de Bot
        status: 'playing',
        board_state: board,
        current_turn: 'pink',
        match_start_time: new Date().toISOString(),
        last_move_time: new Date().toISOString()
    }).select().single();

    if (error) {
        showToast("Error al crear arena de práctica", "error");
        setView('dashboard');
        return;
    }

    window.CW_SESSION = {
        matchId: match.id,
        isBotMatch: true,
        myColor: 'pink',
        botName: 'DAYANA (BOT)',
        board: board
    };

    setView('game');
}
