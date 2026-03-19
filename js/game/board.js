/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO: Tablero + IA Estratégica (100% Legal)
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { setView, getProfile, setProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _turnTimer = null;
let _timeLeft = 10;
let _isAnimating = false;
let _turnCount = 0;
let _$container = null; 

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  
  if (!window.CW_SESSION || !window.CW_SESSION.board) {
    showToast('Sesión inválida', 'error');
    setView('dashboard');
    return;
  }

  _active = true;
  _currentTurn = 'pink';
  _isAnimating = false;
  _turnCount = 0;

  renderHTML();
  updateDOM();
  _startTurn();
}

function renderHTML() {
  const rivalName = window.CW_SESSION.botName || 'BOT';

  _$container.innerHTML = `
  <div class="game-arena">
    <div class="game-hud">
      <div style="color:var(--pink);font-weight:900;font-size:1.2rem;text-shadow:0 0 10px var(--pink);">TÚ: <span id="score-pink">0</span></div>
      <div class="hud-timer">00:10</div>
      <div style="color:var(--blue);font-weight:900;font-size:1.1rem;text-shadow:0 0 10px var(--blue); text-transform:uppercase;">${rivalName}: <span id="score-blue">0</span></div>
    </div>
    <div class="board-wrap">
      <div class="board-grid" id="grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px;">
        ${window.CW_SESSION.board.map((row, r) => row.map((_, c) => `
          <div class="cell" data-r="${r}" data-c="${c}"><div class="cell-mass"></div></div>
        `).join('')).join('')}
      </div>
    </div>
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:20px;">🏳️ Rendirse</button>
  </div>`;

  _$container.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });

  _$container.querySelector('#btn-surrender').addEventListener('click', () => {
    _active = false;
    clearInterval(_turnTimer);
    setView('dashboard');
    showToast('Te rendiste.', 'warning');
  });
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  let pinkScore = 0, blueScore = 0;
  let idx = 0;

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

  _$container.querySelector('#score-pink').textContent = pinkScore;
  _$container.querySelector('#score-blue').textContent = blueScore;
}

// ⚡ LÓGICA DE JUGADOR (Expansión Estricta)
function handlePlayerClick(row, col) {
  if (!_active || _isAnimating || _currentTurn !== 'pink') return;
  const cell = window.CW_SESSION.board[row][col];
  
  if (cell.owner === 'blue') return; 

  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (window.CW_SESSION.board[r][c].owner === 'pink') myCellsCount++;
    }
  }

  // REGLA CLAVE: Si ya tienes casillas, SOLO puedes tocar las tuyas.
  if (myCellsCount > 0 && cell.owner !== 'pink') {
    return; 
  }

  clearInterval(_turnTimer);
  _addMass(row, col, 'pink');
}

function _startTurn() {
  if (!_active) return;
  _timeLeft = 10;
  updateTimerUI();

  _turnTimer = setInterval(() => {
    _timeLeft--;
    updateTimerUI();
    if (_timeLeft <= 0) {
      clearInterval(_turnTimer);
      _passTurn(); 
    }
  }, 1000);

  if (_currentTurn === 'blue') {
    setTimeout(() => {
      if (!_active || _currentTurn !== 'blue') return;
      clearInterval(_turnTimer);
      _botMove();
    }, 1000 + Math.random() * 1000);
  }
}

function updateTimerUI() {
  const el = _$container.querySelector('.hud-timer');
  if (el) {
    el.textContent = `00:${_timeLeft.toString().padStart(2, '0')}`;
    if (_timeLeft <= 3) el.classList.add('urgent');
    else el.classList.remove('urgent');
  }
}

function _passTurn() {
  if (!_active) return;
  _turnCount++;
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _startTurn();
}

async function _addMass(row, col, color) {
  _isAnimating = true;
  await _processMass(row, col, color);
  if (!_active) return;

  if (!_checkGameOver()) _passTurn();
  _isAnimating = false;
}

async function _processMass(row, col, color) {
  if (!_active) return;
  const cell = window.CW_SESSION.board[row][col];
  cell.owner = color;
  cell.mass++;

  if (cell.mass >= 4) {
    await _explode(row, col, color);
  } else {
    updateDOM();
  }
}

async function _explode(row, col, color) {
  if (!_active) return;
  window.CW_SESSION.board[row][col].mass = 0;
  window.CW_SESSION.board[row][col].owner = null; 
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

// ⚡ LÓGICA DE BOT: IA ESTRATÉGICA (100% LEGAL, CERO TRAMPAS)
function _botMove() {
  const board = window.CW_SESSION.board;
  const humanWinsNext = window.CW_SESSION.humanWinsNext; 
  
  // 1. Recopilar todas las casillas que le pertenecen al Bot
  const botCells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner === 'blue') botCells.push({r, c, mass: board[r][c].mass});
    }
  }

  // Si es el primer turno del Bot (no tiene casillas), agarra una vacía
  if (botCells.length === 0) {
    const emptyPool = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[r][c].owner) emptyPool.push({r, c});
      }
    }
    if (emptyPool.length > 0) {
        const startMove = emptyPool[Math.floor(Math.random() * emptyPool.length)];
        _addMass(startMove.r, startMove.c, 'blue');
    } else {
        _passTurn();
    }
    return;
  }

  // --- MODO DIABLO: JUEGA A MATAR (Lógica Estratégica) ---
  if (humanWinsNext === false) {
    // Prioridad 1: ¡Disparar! Tocar las de masa 3 para generar explosiones
    const readyToExplode = botCells.filter(cell => cell.mass === 3);
    if (readyToExplode.length > 0) {
      const move = readyToExplode[Math.floor(Math.random() * readyToExplode.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }
    
    // Prioridad 2: ¡Cargar el arma! Tocar las de masa 2 para llevarlas a 3
    const massTwo = botCells.filter(cell => cell.mass === 2);
    if (massTwo.length > 0) {
      const move = massTwo[Math.floor(Math.random() * massTwo.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }

    // Prioridad 3: Expandir lo que queda (masa 1)
    const move = botCells[Math.floor(Math.random() * botCells.length)];
    _addMass(move.r, move.c, 'blue');
    return;
  } 
  
  // --- MODO TONTO: JUEGA A PERDER (Pero respetando las reglas) ---
  if (humanWinsNext === true) {
    // Busca sus propias casillas, pero EVITA las que están a punto de explotar
    const safeCells = botCells.filter(cell => cell.mass < 3);

    if (safeCells.length > 0) {
      // Engorda pendejamente las que no hacen daño
      const move = safeCells[Math.floor(Math.random() * safeCells.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    } else {
      // Si TODAS sus casillas son de 3 bolitas (acorralado), no le queda otra que tocar una
      const move = botCells[Math.floor(Math.random() * botCells.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }
  }
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

async function _finishGame(winner) {
  _active = false;
  clearInterval(_turnTimer);
  const win = winner === 'pink';
  
  try {
    const profile = getProfile();
    const sb = getSupabase();
    
    if (win) {
      const newBalance = Number(profile.wallet_bs) + 320;
      const newWins = (profile.wins || 0) + 1;
      await sb.from('users').update({ wallet_bs: newBalance, wins: newWins }).eq('id', profile.id);
      setProfile({ ...profile, wallet_bs: newBalance, wins: newWins });
    } else {
      const newLosses = (profile.losses || 0) + 1;
      await sb.from('users').update({ losses: newLosses }).eq('id', profile.id);
      setProfile({ ...profile, losses: newLosses });
    }
  } catch (e) {}

  _$container.innerHTML += `
    <div class="result-screen">
      <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem;">${win ? '+320 Bs acreditados' : 'Te han masacrado'}</p>
      <button class="btn btn-primary" id="btn-exit">VOLVER AL INICIO</button>
    </div>
  `;
  _$container.querySelector('#btn-exit').addEventListener('click', () => setView('dashboard'));
}
