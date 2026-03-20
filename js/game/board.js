/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * EL MONOLITO DE LA GUERRA: 
 * HUD Rígido + Reloj Global (3 Min) + Desempate por Masa
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml } from '../core/app.js';
import { setView, getProfile, reloadProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _turnTimer = null;
let _graceTimer = null;
let _globalTimer = null; // ⏱️ El Reloj del Apocalipsis
let _timeLeft = 10;
let _globalTimeLeft = 180; // ⏱️ 3 Minutos (180 segundos)
let _totalWait = 0;
let _isAnimating = false;
let _turnCount = 0;
let _missedTurns = 0; // ⏱️ Ley Anti-AFK
let _$container = null; 
let _matchChannel = null; 

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { setView('dashboard'); return; }

  _active = true; _currentTurn = 'pink'; _isAnimating = false; _turnCount = 0; _missedTurns = 0; 
  _globalTimeLeft = 180; // Reiniciar los 3 minutos
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        if (matchData.status === 'finished' || matchData.status === 'cancelled') { setView('dashboard'); return; }
        if (matchData.board_state) window.CW_SESSION.board = matchData.board_state;
        if (matchData.current_turn) _currentTurn = matchData.current_turn;
        
        let pieces = 0;
        for(let r=0; r<BOARD_SIZE; r++) { for(let c=0; c<BOARD_SIZE; c++) { if (matchData.board_state[r][c].owner) pieces++; } }
        _turnCount = pieces;
      }
    } catch(e) {}

    if (!window.CW_SESSION.isBotMatch) {
      _matchChannel = sb.channel(`game_${window.CW_SESSION.matchId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${window.CW_SESSION.matchId}` }, (payload) => {
          const newData = payload.new;
          if (newData.status === 'finished' || newData.status === 'cancelled') { if (newData.winner) _finishGame(newData.winner, true); return; }
          if (newData.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
             window.CW_SESSION.board = newData.board_state; _currentTurn = newData.current_turn;
             updateDOM(); _startTurn();
          }
        }).subscribe();
    }
  }
  renderHTML(); updateDOM(); 
  _startGlobalTimer(); // Arranca el conteo regresivo de 3 minutos
  _startTurn();
}

function renderHTML() {
  const myColor = window.CW_SESSION.myColor;
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'RIVAL';
  const myName = getProfile()?.username || 'TÚ';

  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena" id="arena-main" style="display:flex; flex-direction:column; align-items:center;">
    
    <div style="background: rgba(10, 10, 15, 0.85); border: 1px solid var(--border-ghost); border-radius: 14px; padding: 12px 15px; margin-bottom: 25px; width: 100%; max-width: 380px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
        
        <div style="display: flex; justify-content: space-between; align-items: center; height: 45px;">
            <div style="display: flex; flex-direction: column; align-items: flex-start; width: 30%;">
                <span style="color:${youColorVar}; font-size: 0.65rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">${escHtml(myName)}</span>
                <span style="color: white; font-size: 1.4rem; font-weight: 900;" id="score-you">0</span>
            </div>
            
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 40%;">
                <span id="global-timer" style="color: #ffaa00; font-family: var(--font-display); font-size: 2rem; letter-spacing: 2px; text-shadow: 0 0 15px rgba(255,170,0,0.5); line-height: 1;">03:00</span>
            </div>
            
            <div style="display: flex; flex-direction: column; align-items: flex-end; width: 30%;">
                <span style="color:${rivalColorVar}; font-size: 0.65rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">${escHtml(rivalName)}</span>
                <span style="color: white; font-size: 1.4rem; font-weight: 900;" id="score-rival">0</span>
            </div>
        </div>

        <div style="height: 20px; display: flex; justify-content: center; align-items: center; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;">
            <span id="turn-indicator" style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: bold; letter-spacing: 1px; color: white;">INICIANDO...</span>
        </div>
    </div>

    <div class="board-wrap">
      <div class="board-grid" id="grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px;">
        ${window.CW_SESSION.board.map((row, r) => row.map((_, c) => `
          <div class="cell" data-r="${r}" data-c="${c}"><div class="cell-mass"></div></div>
        `).join('')).join('')}
      </div>
    </div>
    
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:25px;">🏳️ Abandonar</button>
  </div>`;

  _$container.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell'); if (!cell) return;
    handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });

  _$container.querySelector('#btn-surrender').addEventListener('click', () => {
    const rivalColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
    _finishGame(rivalColor, false);
  });
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  if(cells.length === 0) return; 

  let pinkScore = 0, blueScore = 0; let idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const stateCell = game.board[r][c];
      const domCell = cells[idx++];
      domCell.className = 'cell';
      if (stateCell.owner === 'pink') { domCell.classList.add('cell-pink'); pinkScore++; }
      else if (stateCell.owner === 'blue') { domCell.classList.add('cell-blue'); blueScore++; }

      let orbs = '';
      for(let i = 0; i < stateCell.mass; i++) orbs += `<div class="mass-orb"></div>`;
      domCell.querySelector('.cell-mass').innerHTML = orbs;
    }
  }

  const myColor = window.CW_SESSION.myColor;
  const sYou = _$container.querySelector('#score-you'); const sRiv = _$container.querySelector('#score-rival');
  if (myColor === 'pink') {
    if(sYou) sYou.textContent = pinkScore; if(sRiv) sRiv.textContent = blueScore;
  } else {
    if(sYou) sYou.textContent = blueScore; if(sRiv) sRiv.textContent = pinkScore;
  }
}

// ⏱️ EL RELOJ DEL APOCALIPSIS (3 Minutos)
function _startGlobalTimer() {
    clearInterval(_globalTimer);
    _globalTimer = setInterval(() => {
        if (!_active) return clearInterval(_globalTimer);
        _globalTimeLeft--;
        
        let m = Math.floor(_globalTimeLeft / 60).toString().padStart(2, '0');
        let s = (_globalTimeLeft % 60).toString().padStart(2, '0');
        
        const gt = _$container.querySelector('#global-timer');
        if (gt) {
            gt.textContent = `${m}:${s}`;
            // Efecto de tensión en los últimos 30 segundos
            if (_globalTimeLeft <= 30) {
                gt.style.color = "#ff4444";
                gt.style.textShadow = "0 0 15px rgba(255,68,68,0.8)";
            }
        }

        if (_globalTimeLeft <= 0) {
            clearInterval(_globalTimer);
            _handleTimeOut(); // Se acabó el tiempo, evaluar la mesa
        }
    }, 1000);
}

// ⚖️ EL JUEZ DEL EMPATE (Calcula Celdas y Masa)
function _handleTimeOut() {
    if (!_active) return;
    _active = false;
    clearInterval(_turnTimer);
    clearInterval(_graceTimer);
    
    let pCells = 0, bCells = 0, pMass = 0, bMass = 0;
    const board = window.CW_SESSION.board;
    
    for (let r = 0; r < BOARD_SIZE; r++) {
       for (let c = 0; c < BOARD_SIZE; c++) {
           if (board[r][c].owner === 'pink') { pCells++; pMass += board[r][c].mass; }
           else if (board[r][c].owner === 'blue') { bCells++; bMass += board[r][c].mass; }
       }
    }

    let winner = null;
    let title = "¡TIEMPO AGOTADO!";
    let reason = "";

    if (pCells > bCells) { 
        winner = 'pink'; reason = `Gana por Dominio (${pCells} a ${bCells} casillas)`; 
    } else if (bCells > pCells) { 
        winner = 'blue'; reason = `Gana por Dominio (${bCells} a ${pCells} casillas)`; 
    } else {
        // ¡EMPATE DE TERRITORIOS! Desempate por puntos internos (Masa)
        if (pMass > bMass) { 
            winner = 'pink'; reason = `¡DESEMPATE! Gana por Masa Crítica (${pMass} a ${bMass} pts)`; 
        } else if (bMass > pMass) { 
            winner = 'blue'; reason = `¡DESEMPATE! Gana por Masa Crítica (${bMass} a ${pMass} pts)`; 
        } else {
            // Empate absoluto (Muy raro)
            winner = Math.random() > 0.5 ? 'pink' : 'blue';
            reason = `Empate Absoluto. Muerte Súbita al azar.`;
        }
    }

    // Pantalla de Tensión antes de mostrar el ganador
    _$container.innerHTML = `
        <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
          <h1 style="color:#ffaa00; font-family:var(--font-display); font-size: 2rem; text-shadow: 0 0 20px #ffaa00; text-align:center; margin-bottom: 10px;">¡CAMPANA FINAL!</h1>
          <p style="color:white; font-family:var(--font-mono); text-transform:uppercase;">Calculando territorios y masa...</p>
        </div>
    `;

    // A los 3 segundos, declara al ganador oficialmente
    setTimeout(() => {
        _finishGame(winner, false, reason);
    }, 3000);
}

function handlePlayerClick(row, col) {
  const myColor = window.CW_SESSION.myColor;
  if (!_active || _isAnimating) return;
  if (_currentTurn !== myColor) { showToast('Espera tu turno', 'warning'); return; }

  const cell = window.CW_SESSION.board[row][col];
  if (cell.owner && cell.owner !== myColor) { showToast('Casilla enemiga', 'error'); return; }

  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) { if (window.CW_SESSION.board[r][c].owner === myColor) myCellsCount++; }
  }
  
  if (myCellsCount > 0 && cell.owner !== myColor) { 
      showToast('Debes expandir tus propias fichas', 'warning'); 
      return; 
  }

  // ⏱️ Tocaste legalmente: El Contador Anti-AFK vuelve a cero
  _missedTurns = 0; 
  clearInterval(_turnTimer); _addMass(row, col, myColor);
}

function _startTurn() {
  if (!_active) return;
  clearInterval(_turnTimer); clearInterval(_graceTimer);
  _timeLeft = 10; updateTimerUI();

  const myColor = window.CW_SESSION.myColor;
  const botColor = myColor === 'pink' ? 'blue' : 'pink'; 

  if (_currentTurn === myColor) {
    _turnTimer = setInterval(() => {
      _timeLeft--; updateTimerUI();
      if (_timeLeft <= 0) { 
          clearInterval(_turnTimer); 
          
          // ⏱️ LEY DE INACTIVIDAD
          _missedTurns++;
          
          if (_missedTurns >= 4) {
              showToast('Descalificado por inactividad', 'error');
              _finishGame(botColor, false, "Descalificación por Inactividad (AFK)");
          } else {
              if (_missedTurns === 3) {
                  showToast('¡⚠️ ÚLTIMO AVISO! Juega o pierdes', 'warning');
              } else {
                  showToast(`Turno saltado (${_missedTurns}/4)`, 'warning');
              }
              _passTurn();
          }
      }
    }, 1000);
  } else {
    if (!window.CW_SESSION.isBotMatch) {
      _totalWait = 40; 
      _graceTimer = setInterval(() => {
        _totalWait--;
        if (_totalWait <= 30) updateTimerUI(_totalWait); else updateTimerUI(); 
        if (_totalWait <= 0) { clearInterval(_graceTimer); claimForfeitVictory(); }
      }, 1000);
    } else {
      setTimeout(() => {
        if (!_active || _currentTurn !== botColor) return;
        _botMove();
      }, 700 + Math.random() * 500); 
    }
  }
}

// 📏 HUD TEXT MODIFIER (Rigid Update)
function updateTimerUI(graceTime = null) {
  const el = _$container.querySelector('#turn-indicator');
  const myColor = window.CW_SESSION.myColor;
  if (!el) return;

  if (graceTime !== null) {
    el.textContent = `DESCONECTADO: ${graceTime}s`;
    el.style.color = "var(--pink)"; return;
  }

  if (_currentTurn === myColor) {
    el.innerHTML = `TU TURNO: <span style="color:var(--text-bright); font-size:1.1em;">${_timeLeft.toString().padStart(2, '0')}</span>`; 
    el.style.color = "var(--text-bright)";
  } else {
    el.innerHTML = `ESPERANDO RIVAL: <span style="color:var(--text-dim);">${_timeLeft.toString().padStart(2, '0')}</span>`; 
    el.style.color = "var(--text-dim)";
  }
  
  if (_timeLeft <= 3 && _currentTurn === myColor) el.style.color = "#ff4444";
}

async function claimForfeitVictory() {
  if (!_active) return;
  _finishGame(window.CW_SESSION.myColor, false, "El rival se desconectó");
}

async function _passTurn() {
  if (!_active) return;
  _turnCount++;
  const nextTurn = _currentTurn === 'pink' ? 'blue' : 'pink';

  if (_currentTurn === window.CW_SESSION.myColor || window.CW_SESSION.isBotMatch) {
     _currentTurn = nextTurn; updateTimerUI(); 
     if (window.CW_SESSION.matchId) {
         const sb = getSupabase();
         sb.from('matches').update({ board_state: window.CW_SESSION.board, current_turn: nextTurn })
           .eq('id', window.CW_SESSION.matchId).catch(()=>{});
     }
     _startTurn();
  }
}

async function _addMass(row, col, color) {
  _isAnimating = true; await _processMass(row, col, color);
  if (!_active) return;
  if (!_checkGameOver()) _passTurn();
  _isAnimating = false;
}

async function _processMass(row, col, color) {
  if (!_active) return;
  const cell = window.CW_SESSION.board[row][col];
  cell.owner = color; cell.mass++;

  if (cell.mass >= 4) { await _explode(row, col, color); } else { updateDOM(); }
}

async function _explode(row, col, color) {
  if (!_active) return;
  window.CW_SESSION.board[row][col].mass = 0; window.CW_SESSION.board[row][col].owner = null; 
  updateDOM();

  const neighbors = [];
  if (row > 0) neighbors.push({row: row - 1, col});
  if (row < BOARD_SIZE - 1) neighbors.push({row: row + 1, col});
  if (col > 0) neighbors.push({row, col: col - 1});
  if (col < BOARD_SIZE - 1) neighbors.push({row, col: col + 1});

  await new Promise(r => setTimeout(r, 200));

  for (const n of neighbors) {
    if (!_active) break;
    await _processMass(n.row, n.col, color);
  }
}

// ═════════════════════════════════════════════════════════
// 🧠 MOTOR MINIMAX (Gran Maestro de Ajedrez)
// ═════════════════════════════════════════════════════════

function _cloneBoard(board) {
  return board.map(row => row.map(cell => ({ owner: cell.owner, mass: cell.mass })));
}

function _getValidMoves(board, color) {
  let moves = [];
  let hasCells = false;
  for (let r=0; r<BOARD_SIZE; r++) {
    for (let c=0; c<BOARD_SIZE; c++) {
      if (board[r][c].owner === color) hasCells = true;
    }
  }
  for (let r=0; r<BOARD_SIZE; r++) {
    for (let c=0; c<BOARD_SIZE; c++) {
      if (hasCells) {
        if (board[r][c].owner === color) moves.push({r, c});
      } else {
        if (!board[r][c].owner) moves.push({r, c});
      }
    }
  }
  return moves;
}

function _simulateMove(board, r, c, color) {
  let temp = _cloneBoard(board);
  let queue = [{r, c, color}];
  let iterations = 0;

  while(queue.length > 0 && iterations < 300) {
    iterations++;
    let current = queue.shift();
    let cell = temp[current.r][current.c];

    cell.owner = current.color;
    cell.mass++;

    if (cell.mass >= 4) {
      cell.mass = 0;
      cell.owner = null;
      if (current.r > 0) queue.push({r: current.r - 1, c: current.c, color: current.color});
      if (current.r < 4) queue.push({r: current.r + 1, c: current.c, color: current.color});
      if (current.c > 0) queue.push({r: current.r, c: current.c - 1, color: current.color});
      if (current.c < 4) queue.push({r: current.r, c: current.c + 1, color: current.color});
    }
  }
  return temp;
}

function _evaluateBoard(board, botColor, enemyColor) {
  let botScore = 0; let enemyScore = 0;
  for (let r=0; r<BOARD_SIZE; r++) {
    for (let c=0; c<BOARD_SIZE; c++) {
      let cell = board[r][c];
      if (cell.owner === botColor) {
        botScore += (cell.mass * 10);
        if (cell.mass === 3) botScore += 50; 
      } else if (cell.owner === enemyColor) {
        enemyScore += (cell.mass * 10);
        if (cell.mass === 3) enemyScore += 50;
      }
    }
  }
  if (botScore > 0 && enemyScore === 0) return 999999; 
  if (enemyScore > 0 && botScore === 0) return -999999; 
  return botScore - enemyScore;
}

function _botMove() {
  try {
    const board = window.CW_SESSION.board;
    const enemyColor = window.CW_SESSION.myColor;
    const botColor = enemyColor === 'pink' ? 'blue' : 'pink'; 

    let validMoves = _getValidMoves(board, botColor);
    if (validMoves.length === 0) { _passTurn(); return; }

    if (validMoves.length === 25 && !board[2][2].owner) {
      _addMass(2, 2, botColor); return;
    }

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of validMoves) {
      let simBoard1 = _simulateMove(board, move.r, move.c, botColor);
      let eval1 = _evaluateBoard(simBoard1, botColor, enemyColor);
      
      if (eval1 > 900000 && _turnCount >= 2) {
         _addMass(move.r, move.c, botColor); return;
      }

      let enemyMoves = _getValidMoves(simBoard1, enemyColor);
      let worstCaseScore = Infinity;

      for (const eMove of enemyMoves) {
         let simBoard2 = _simulateMove(simBoard1, eMove.r, eMove.c, enemyColor);
         let eval2 = _evaluateBoard(simBoard2, botColor, enemyColor);
         if (eval2 < worstCaseScore) worstCaseScore = eval2; 
      }

      if (enemyMoves.length === 0) worstCaseScore = 999999;
      worstCaseScore += Math.random();

      if (worstCaseScore > bestScore) {
         bestScore = worstCaseScore;
         bestMove = move;
      }
    }

    if (bestMove) { _addMass(bestMove.r, bestMove.c, botColor); } 
    else { _addMass(validMoves[0].r, validMoves[0].c, botColor); } 

  } catch (err) { console.error("Error en Motor Cuántico:", err); _passTurn(); }
}

function _checkGameOver() {
  let pink = 0, blue = 0;
  const board = window.CW_SESSION.board;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner === 'pink') pink++;
      else if (board[r][c].owner === 'blue') blue++;
    }
  }
  if (_turnCount >= 2) {
     if (pink === 0 && blue > 0) { _finishGame('blue'); return true; }
     if (blue === 0 && pink > 0) { _finishGame('pink'); return true; }
  }
  return false;
}

// ⚡ SALIDA BLINDADA CON RAZÓN DE VICTORIA
async function _finishGame(winnerColor, fromDB = false, customReason = null) {
  if (!_active) return; 
  _active = false;
  
  clearInterval(_turnTimer); clearInterval(_graceTimer); clearInterval(_globalTimer);
  if (_matchChannel) _matchChannel.unsubscribe();
  
  const myColor = window.CW_SESSION.myColor;
  const win = winnerColor === myColor;
  const displayReason = customReason ? customReason : (win ? '+50 CP acreditados' : 'Perdiste la batalla');

  _$container.innerHTML = `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
      <h1 class="result-title" style="color:var(--text-dim); font-size: 1.4rem;">PROCESANDO...</h1>
    </div>
  `;
  
  try {
    const sb = getSupabase();
    if (!fromDB && window.CW_SESSION.matchId) {
       await sb.from('matches')
         .update({ status: 'finished', winner: winnerColor, board_state: window.CW_SESSION.board })
         .eq('id', window.CW_SESSION.matchId);
    }
  } catch (e) { console.error("Error guardando final:", e); }

  _$container.innerHTML = `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
      <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem; text-align:center; max-width: 80%;">${displayReason}</p>
      <button class="btn btn-primary" id="btn-exit" style="width:200px;">VOLVER AL INICIO</button>
    </div>
  `;
  
  _$container.querySelector('#btn-exit').addEventListener('click', async () => {
    const $btn = _$container.querySelector('#btn-exit'); 
    $btn.textContent = "SALIENDO..."; $btn.style.opacity = "0.7"; $btn.style.pointerEvents = "none";

    if (window.CW_SESSION && window.CW_SESSION.matchId) {
        try {
           const sb = getSupabase();
           await sb.from('matches').update({ status: 'finished' }).eq('id', window.CW_SESSION.matchId);
        } catch(e) {}
    }

    window.CW_SESSION = null; 
    await reloadProfile(); 
    setView('dashboard');
  });
}
