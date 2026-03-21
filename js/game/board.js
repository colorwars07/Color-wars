/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MOTOR BLINDADO V4.0 (POLLING 4x4 + ANTI-CRASH)
 * ═══════════════════════════════════════════════════════
 */
import { registerView, showToast, escHtml } from '../core/app.js';
import { setView, getProfile, reloadProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _isAnimating = false;
let _turnCount = 0;
let _missedTurns = 0;
let _$container = null;
let _masterClockTimer = null;
let _pollTimer = null;
let _dbStartTime = null;
let _dbLastMoveTime = null;
let _dbTotalPausedSecs = 0;
let _botIsMoving = false;

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { 
      window.location.reload(); // Si se pierde la sesión, refrescamos para limpiar caché
      return; 
  }

  _active = true; 
  _isAnimating = false; 
  _turnCount = 0; 
  _missedTurns = 0; 
  _botIsMoving = false;
  
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        window.CW_SESSION.board = matchData.board_state || window.CW_SESSION.board;
        _currentTurn = matchData.current_turn || 'pink';
        _dbStartTime = matchData.match_start_time ? new Date(matchData.match_start_time).getTime() : Date.now();
        _dbLastMoveTime = Date.now();
        _dbTotalPausedSecs = matchData.total_paused_seconds || 0;
      }
    } catch(e) { console.error("Error inicializando partida:", e); }

    // 🔥 MOTOR 4x4: Pregunta a la DB cada 1.5s (Inmune a fallos de señal)
    if (!window.CW_SESSION.isBotMatch) {
      _startPolling();
    }
  }

  renderHTML(); 
  updateDOM();
  _startMasterClock();
}

function _startPolling() {
  clearInterval(_pollTimer);
  _pollTimer = setInterval(async () => {
    if (!_active || _isAnimating) return;
    try {
      const { data, error } = await getSupabase()
        .from('matches')
        .select('board_state, current_turn, last_move_time, status, winner')
        .eq('id', window.CW_SESSION.matchId)
        .single();

      if (error) throw error;

      if (data) {
        // 1. Si el rival abandonó o terminó
        if (data.status === 'finished' && data.winner) {
           _finishGame(data.winner, true);
           return;
        }
        // 2. Si es mi turno y el tablero local está desactualizado
        if (data.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
           window.CW_SESSION.board = data.board_state;
           _currentTurn = data.current_turn;
           _dbLastMoveTime = new Date(data.last_move_time).getTime();
           _missedTurns = 0;
           updateDOM();
        }
      }
    } catch(e) { console.warn("Sincronizando..."); }
  }, 1500);
}

function renderHTML() {
  const myColor = window.CW_SESSION.myColor;
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'RIVAL';
  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena">
    <div class="game-header-v2">
        <div class="player-info left">
            <span class="label" style="color:${youColorVar}">TÚ</span>
            <span class="score" id="score-you">0</span>
        </div>
        <div class="timer-zone">
            <span id="global-timer" class="clock-display">03:00</span>
            <span id="turn-indicator" class="turn-subtext">CONECTANDO...</span>
        </div>
        <div class="player-info right">
            <span class="label" style="color:${rivalColorVar}">${escHtml(rivalName)}</span>
            <span class="score" id="score-rival">0</span>
        </div>
    </div>
    <div class="board-wrap">
        <div class="board-grid" id="grid">
            ${window.CW_SESSION.board.map((row, r) => row.map((_, c) => `
                <div class="cell" data-r="${r}" data-c="${c}">
                    <div class="cell-mass"></div>
                </div>`).join('')).join('')}
        </div>
    </div>
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:25px; width:200px;">🏳️ ABANDONAR</button>
  </div>`;

  _$container.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell'); 
    if (cell) handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });
  
  _$container.querySelector('#btn-surrender').addEventListener('click', () => {
     _finishGame(window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink', false, "Abandonaste la partida");
  });
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  let pS = 0, bS = 0, idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const state = game.board[r][c]; 
      const dom = cells[idx++];
      if (!dom) continue;
      dom.className = 'cell';
      if (state.owner === 'pink') { dom.classList.add('cell-pink'); pS++; }
      else if (state.owner === 'blue') { dom.classList.add('cell-blue'); bS++; }
      let orbs = ''; 
      for(let i=0; i<state.mass; i++) orbs += `<div class="mass-orb"></div>`;
      dom.querySelector('.cell-mass').innerHTML = orbs;
    }
  }
  const myColor = window.CW_SESSION.myColor;
  const sy = _$container.querySelector('#score-you');
  const sr = _$container.querySelector('#score-rival');
  if (myColor === 'pink') { if(sy) sy.textContent = pS; if(sr) sr.textContent = bS; }
  else { if(sy) sy.textContent = bS; if(sr) sr.textContent = pS; }
}

function _startMasterClock() {
    clearInterval(_masterClockTimer);
    _masterClockTimer = setInterval(() => {
        if (!_active) return clearInterval(_masterClockTimer);
        const now = Date.now();
        let globalLeft = 180 - (Math.floor((now - _dbStartTime) / 1000) - _dbTotalPausedSecs);
        const gt = _$container.querySelector('#global-timer');
        if (gt) gt.textContent = `${Math.floor(Math.max(0,globalLeft) / 60).toString().padStart(2, '0')}:${(Math.max(0,globalLeft) % 60).toString().padStart(2, '0')}`;
        if (globalLeft <= 0) { _finishGame('draw', false, "TIEMPO AGOTADO"); return; }

        let turnLeft = 10 - Math.floor((now - _dbLastMoveTime) / 1000);
        const turnEl = _$container.querySelector('#turn-indicator');
        const isMyTurn = _currentTurn === window.CW_SESSION.myColor;

        if (turnEl) {
            let d = Math.max(0, turnLeft);
            turnEl.textContent = isMyTurn ? `TU TURNO: ${d}s` : `RIVAL: ${d}s`;
            turnEl.style.color = isMyTurn ? 'var(--pink)' : '#aaa';
        }

        if (turnLeft <= 0 && !_isAnimating) {
            if (isMyTurn) {
                _missedTurns++; 
                _dbLastMoveTime = now;
                if (_missedTurns >= 4) _finishGame(window.CW_SESSION.myColor==='pink'?'blue':'pink', false, "ELIMINADO POR AFK");
                else {
                    showToast(`TURNO SALTADO (${_missedTurns}/4)`, 'warning');
                    _passTurn();
                }
            } else if (window.CW_SESSION.isBotMatch && !_botIsMoving) {
                _botIsMoving = true;
                _botMove();
            }
        }
        
        if (window.CW_SESSION.isBotMatch && !isMyTurn && turnLeft <= 8 && !_isAnimating && !_botIsMoving) {
            _botIsMoving = true;
            setTimeout(() => { _botMove(); }, 600);
        }
    }, 1000);
}

function handlePlayerClick(row, col) {
  if (!_active || _isAnimating || _currentTurn !== window.CW_SESSION.myColor) return;
  const cell = window.CW_SESSION.board[row][col];
  if (cell.owner && cell.owner !== window.CW_SESSION.myColor) return;
  _missedTurns = 0; 
  _addMass(row, col, window.CW_SESSION.myColor);
}

async function _addMass(row, col, color) {
  if (_isAnimating) return;
  _isAnimating = true;
  try {
      await _processMass(row, col, color);
      if (_active && !_checkGameOver()) await _passTurn();
  } catch(e) {
      console.error("Error procesando masa:", e);
  } finally {
      _isAnimating = false;
      _botIsMoving = false;
  }
}

async function _processMass(row, col, color) {
  const cell = window.CW_SESSION.board[row][col];
  cell.owner = color; cell.mass++;
  if (cell.mass >= 4) await _explode(row, col, color); else updateDOM();
}

async function _explode(row, col, color) {
  window.CW_SESSION.board[row][col].mass = 0; 
  window.CW_SESSION.board[row][col].owner = null;
  updateDOM();
  const n = [];
  if (row > 0) n.push({row: row - 1, col}); 
  if (row < 4) n.push({row: row + 1, col});
  if (col > 0) n.push({row, col: col - 1}); 
  if (col < 4) n.push({row, col: col + 1});
  await new Promise(r => setTimeout(r, 200));
  for (const pos of n) await _processMass(pos.row, pos.col, color);
}

async function _passTurn() {
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _dbLastMoveTime = Date.now(); 
  _turnCount++;
  
  if (window.CW_SESSION.matchId) {
     try {
         await getSupabase().from('matches').update({ 
             board_state: window.CW_SESSION.board, 
             current_turn: _currentTurn, 
             last_move_time: new Date(_dbLastMoveTime).toISOString() 
         }).eq('id', window.CW_SESSION.matchId);
     } catch(e) { 
         console.warn("Fallo de red al enviar turno, el motor reintentará."); 
     }
  }
  updateDOM();
}

function _botMove() {
  const botColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
  const board = window.CW_SESSION.board;
  let moves = [];
  for(let r=0; r<5; r++) for(let c=0; c<5; c++) {
      if (!board[r][c].owner || board[r][c].owner === botColor) moves.push({r,c});
  }
  if (moves.length > 0) {
      const m = moves[Math.floor(Math.random()*moves.length)];
      _addMass(m.r, m.c, botColor);
  } else {
      _botIsMoving = false;
  }
}

function _checkGameOver() {
  let p = 0, b = 0;
  window.CW_SESSION.board.forEach(row => row.forEach(c => { if(c.owner==='pink') p++; else if(c.owner==='blue') b++; }));
  if (_turnCount >= 2) {
     if (p === 0) { _finishGame('blue'); return true; }
     if (b === 0) { _finishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winnerColor, fromDB = false, reason = null) {
  if (!_active) return; 
  _active = false;
  clearInterval(_masterClockTimer);
  clearInterval(_pollTimer);
  
  const win = winnerColor === window.CW_SESSION.myColor;
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay';
  overlay.innerHTML = `
    <div class="result-card">
        <h1 class="${win ? 'text-win' : 'text-lose'}">${win ? 'VICTORIA' : 'DERROTA'}</h1>
        <p class="result-reason">${reason || (win ? '+50 CP' : 'Sigue practicando')}</p>
        <button class="btn btn-primary" id="btn-return-dash">VOLVER AL INICIO</button>
    </div>
  `;
  _$container.appendChild(overlay);

  _$container.querySelector('#btn-return-dash').addEventListener('click', () => {
     window.location.reload(); // Recarga total para asegurar que no queden procesos fantasmas
  });

  if (!fromDB && window.CW_SESSION.matchId) {
     await getSupabase().from('matches').update({ status:'finished', winner:winnerColor }).eq('id', window.CW_SESSION.matchId).catch(()=>{});
  }
}
