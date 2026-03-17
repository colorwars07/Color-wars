/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/engine.js
 * Game Engine: TURN-BASED (10s) con Control de Ronda
 * ═══════════════════════════════════════════════════════
 */

import { getNeighbors }   from '../core/app.js';
import {
  updateGameBoard, setGameOver, recordWin, recordLoss,
  GAME_CFG, subscribe, getGame
} from '../core/state.js';

let _active = false;
let _onRender = null;
let _onGameOver = null;

let _currentTurn = 'pink'; 
let _turnTimer = null;
let _timeLeft = 10;
let _isAnimating = false;
let _turnCount = 0; // ⚡ AQUÍ ESTÁ LA SOLUCIÓN AL CORTOCIRCUITO

const _stateCache = { currentGame: null };
subscribe('currentGame', (val) => { _stateCache.currentGame = val; });
(function initCache() { _stateCache.currentGame = getGame(); })();
function getState(key) { return _stateCache[key]; }

export function startEngine(onRender, onGameOver) {
  _onRender = onRender;
  _onGameOver = onGameOver;
  _active = true;
  _currentTurn = 'pink';
  _isAnimating = false;
  _turnCount = 0; // Reiniciamos el contador de turnos
  _startTurn();
}

export function stopEngine() {
  _active = false;
  if (_turnTimer) clearInterval(_turnTimer);
}

export function getCellCounts() {
  const game = getState('currentGame');
  if (!game) return { pink: 0, blue: 0, neutral: 0 };
  let pink = 0, blue = 0, neutral = 0;
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++) {
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++) {
      const cell = game.board[r][c];
      if (cell.blocked) continue;
      if (cell.owner === 'pink') pink++;
      else if (cell.owner === 'blue') blue++;
      else neutral++;
    }
  }
  return { pink, blue, neutral };
}

export function playerClick(row, col) {
  if (!_active || _isAnimating || _currentTurn !== 'pink') return;

  const game = getState('currentGame');
  if (!game || game.isOver) return;

  const cell = game.board[row][col];
  if (cell.blocked) return;
  if (cell.owner === 'blue') return; // Solo tuyas o vacías

  _clearTimer();
  _addMass(game.board, row, col, 'pink');
}

function _startTurn() {
  if (!_active) return;
  _timeLeft = 10;
  _updateTimerUI();

  _turnTimer = setInterval(() => {
    _timeLeft--;
    _updateTimerUI();

    if (_timeLeft <= 0) {
      _clearTimer();
      _passTurn(); // Turno perdido por inactividad
    }
  }, 1000);

  if (_currentTurn === 'blue') {
    setTimeout(() => {
      if (!_active || _currentTurn !== 'blue') return;
      _clearTimer();
      _botMove(getState('currentGame').board);
    }, 1500 + Math.random() * 1000);
  }
}

function _clearTimer() {
  if (_turnTimer) { clearInterval(_turnTimer); _turnTimer = null; }
}

function _updateTimerUI() {
  const el = document.querySelector('.hud-timer');
  if (el) {
    el.textContent = `00:${_timeLeft.toString().padStart(2, '0')}`;
    if (_timeLeft <= 3) el.classList.add('urgent');
    else el.classList.remove('urgent');
  }
}

function _passTurn() {
  if (!_active) return;
  _turnCount++; // ⚡ AUMENTAMOS EL TURNO
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _startTurn();
}

// ── LÓGICA DE MASA Y EXPLOSIÓN ─────────────────────────
async function _addMass(board, row, col, color) {
  _isAnimating = true; 
  await _processMass(board, row, col, color);
  
  if (!_active) return;
  
  const gameOver = _checkGameOver(board);
  if (!gameOver) {
    _passTurn();
  }
  _isAnimating = false;
}

async function _processMass(board, row, col, color) {
  if (!_active) return;
  const cell = board[row][col];
  if (cell.blocked) return;

  cell.owner = color;
  cell.mass++;

  if (cell.mass >= 4) { 
    await _explode(board, row, col, color);
  } else {
    updateGameBoard(board);
    _onRender?.();
  }
}

async function _explode(board, row, col, color) {
  if (!_active) return;
  
  board[row][col].mass = 0;
  board[row][col].owner = null; 
  updateGameBoard(board);
  _onRender?.();

  const neighbors = getNeighbors(row, col, GAME_CFG.BOARD_SIZE);
  await new Promise(r => setTimeout(r, 200));

  for (const n of neighbors) {
    if (!_active) break;
    const freshGame = getState('currentGame');
    if (!freshGame) break;
    await _processMass(freshGame.board, n.row, n.col, color);
  }
}

// ── IA DEL BOT ────────────────────────────────
function _botMove(board) {
  const roll = Math.floor(Math.random() * 100) + 1;

  if (roll <= 65) {
    const readyToExplode = _getCells(board, 'blue').filter(c => board[c[0]][c[1]].mass === 3);
    if (readyToExplode.length) {
      const [r, c] = readyToExplode[Math.floor(Math.random() * readyToExplode.length)];
      _addMass(board, r, c, 'blue');
      return;
    }
    const own = _getCells(board, 'blue');
    if (own.length) {
      const [r, c] = own[Math.floor(Math.random() * own.length)];
      _addMass(board, r, c, 'blue');
      return;
    }
  } 

  const ownLow = _getCells(board, 'blue').filter(c => board[c[0]][c[1]].mass <= 1);
  const free = _getEmptyCells(board);
  const pool = [...ownLow, ...free];
  
  if (pool.length) {
    const [r, c] = pool[Math.floor(Math.random() * pool.length)];
    _addMass(board, r, c, 'blue');
  } else {
    _passTurn(); 
  }
}

// ── CHECK GAME OVER ───────────────────────────────────
function _checkGameOver(board) {
  let pink = 0, blue = 0;
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++) {
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++) {
      if (board[r][c].blocked) continue;
      if (board[r][c].owner === 'pink') pink++;
      else if (board[r][c].owner === 'blue') blue++;
    }
  }

  // ⚡ LA SOLUCIÓN: La regla de muerte súbita solo aplica desde la Ronda 2
  // (cuando ambos jugadores ya tuvieron la oportunidad de poner fichas)
  if (_turnCount >= 2) {
     if (pink === 0 && blue > 0) { _finishGame('blue'); return true; }
     if (blue === 0 && pink > 0) { _finishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winner) {
  stopEngine();
  setGameOver(winner);

  if (winner === 'pink') await recordWin();
  else await recordLoss();

  _onGameOver?.(winner);
}

function _getCells(board, color) {
  const res = [];
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
      if (board[r][c].owner === color) res.push([r, c]);
  return res;
}

function _getEmptyCells(board) {
  const res = [];
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
      if (!board[r][c].owner && !board[r][c].blocked) res.push([r, c]);
  return res;
}
