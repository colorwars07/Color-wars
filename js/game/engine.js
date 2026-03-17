/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/engine.js
 * Game Engine: explosion chain reactions, 65/35 bot AI
 * ═══════════════════════════════════════════════════════
 */

import { getNeighbors }   from '../core/app.js';
import { getSupabase }    from '../core/supabase.js';
import {
  getState, updateGameBoard, setGamePhase2,
  tickGame, setGameOver, clearGame,
  recordWin, recordLoss,
  getProfile, setView, GAME_CFG,
} from '../core/state.js';

// ── Internal ───────────────────────────────────────────
let _gameTimer  = null;
let _botTimer   = null;
let _onRender   = null;
let _onGameOver = null;
let _active     = false;

// ── Public API ─────────────────────────────────────────

export function startEngine(onRender, onGameOver) {
  _onRender   = onRender;
  _onGameOver = onGameOver;
  _active     = true;
  _startPhase1Timer();
}

export function stopEngine() {
  _active = false;
  _clearTimers();
}

export function playerClick(row, col) {
  if (!_active) return;
  const game = getState('currentGame');
  if (!game || game.isOver) return;

  const cell = game.board[row][col];

  if (game.phase === 1) {
    if (cell.owner !== null || cell.blocked) return;
    _placePiece(game.board, row, col, 'pink');
    updateGameBoard(game.board);
    _onRender?.();
    return;
  }

  if (game.phase === 2) {
    if (cell.blocked) return;
    if (cell.owner === 'blue') return;
    _addMass(game.board, row, col, 'pink');
    _onRender?.();
  }
}

export function getCellCounts() {
  const game = getState('currentGame');
  if (!game) return { pink: 0, blue: 0, neutral: 0 };
  return _countCells(game.board);
}

// ── PHASE 1 TIMER ─────────────────────────────────────
function _startPhase1Timer() {
  let elapsed = 0;
  _gameTimer = setInterval(() => {
    if (!_active) return;
    elapsed++;
    tickGame();

    const game = getState('currentGame');
    if (!game) return;

    if (elapsed === 5) {
      _botPhase1Move(game.board);
      _onRender?.();
    }

    if (elapsed >= GAME_CFG.PHASE1_SECS) {
      clearInterval(_gameTimer);
      _gameTimer = null;
      _transitionToPhase2();
    }
  }, 1000);
}

function _botPhase1Move(board) {
  const free = [];
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
      if (!board[r][c].owner && !board[r][c].blocked) free.push([r,c]);
  if (!free.length) return;
  const [r,c] = free[Math.floor(Math.random()*free.length)];
  _placePiece(board, r, c, 'blue');
  updateGameBoard(board);
}

// ── TRANSITION → PHASE 2 ──────────────────────────────
function _transitionToPhase2() {
  setGamePhase2();
  _onRender?.();
  _startPhase2Loop();
  _startBotLoop();
}

// ── PHASE 2 LOOP ──────────────────────────────────────
function _startPhase2Loop() {
  _gameTimer = setInterval(() => {
    if (!_active) return;
    tickGame();
    const game = getState('currentGame');
    if (!game || game.isOver) return;
    _onRender?.();
    if (game.timeLeft <= 0) { _clearTimers(); _resolveByScore(); }
  }, 1000);
}

// ── BOT LOOP (65/35) ──────────────────────────────────
function _startBotLoop() {
  _botTimer = setInterval(() => {
    if (!_active) return;
    const game = getState('currentGame');
    if (!game || game.isOver || game.phase !== 2) return;
    _botPhase2Move(game.board);
    _onRender?.();
  }, GAME_CFG.BOT_INTERVAL_MS);
}

function _botPhase2Move(board) {
  const roll = Math.floor(Math.random() * 100) + 1; // 1–100

  if (roll <= GAME_CFG.BOT_SKILL) {
    // ── Optimal (65%) ─────────────────────────────────
    const readyToExplode = _getCellsByOwner(board, 'blue')
      .filter(([r,c]) => board[r][c].mass === GAME_CFG.EXPLODE_AT - 1);

    if (readyToExplode.length) {
      const [r,c] = readyToExplode[Math.floor(Math.random()*readyToExplode.length)];
      _addMass(board, r, c, 'blue');
      return;
    }

    const edgeCells = _getCellsByOwner(board, 'blue')
      .filter(([r,c]) => !board[r][c].blocked && (r===0||r===4||c===0||c===4));

    if (edgeCells.length) {
      const [r,c] = edgeCells[Math.floor(Math.random()*edgeCells.length)];
      _addMass(board, r, c, 'blue');
      return;
    }

    const own = _getCellsByOwner(board, 'blue').filter(([r,c]) => !board[r][c].blocked);
    if (own.length) {
      const [r,c] = own[Math.floor(Math.random()*own.length)];
      _addMass(board, r, c, 'blue');
      return;
    }

    _botClaimEmpty(board);

  } else {
    // ── Sub-optimal (35%) ─────────────────────────────
    const own = _getCellsByOwner(board, 'blue').filter(([r,c]) => !board[r][c].blocked && board[r][c].mass <= 1);
    const free = [];
    for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
      for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
        if (!board[r][c].owner && !board[r][c].blocked) free.push([r,c]);

    const pool = [...own, ...free];
    if (pool.length) {
      const [r,c] = pool[Math.floor(Math.random()*pool.length)];
      if (!board[r][c].owner) { _placePiece(board, r, c, 'blue'); updateGameBoard(board); }
      else { _addMass(board, r, c, 'blue'); }
    }
  }
}

function _botClaimEmpty(board) {
  const free = [];
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
      if (!board[r][c].owner && !board[r][c].blocked) free.push([r,c]);
  if (!free.length) return;
  const [r,c] = free[Math.floor(Math.random()*free.length)];
  _placePiece(board, r, c, 'blue');
  updateGameBoard(board);
}

// ── BOARD MUTATIONS ────────────────────────────────────
function _placePiece(board, row, col, color) {
  board[row][col].owner = color;
  board[row][col].mass  = 1;
}

function _addMass(board, row, col, color) {
  const cell = board[row][col];
  if (cell.blocked) return;

  if (!cell.owner) cell.owner = color;
  if (cell.owner !== color) cell.owner = color;

  cell.mass++;

  if (cell.mass >= GAME_CFG.EXPLODE_AT) {
    _explode(board, row, col, color);
  } else {
    updateGameBoard(board);
  }
}

function _explode(board, row, col, color) {
  board[row][col].mass    = 0;
  board[row][col].owner   = null;
  board[row][col].blocked = true;

  updateGameBoard(board);

  const neighbors = getNeighbors(row, col, GAME_CFG.BOARD_SIZE);

  neighbors.forEach(({ row: nr, col: nc }, idx) => {
    setTimeout(() => {
      if (!_active) return;
      const freshGame = getState('currentGame');
      if (!freshGame) return;
      const nb = freshGame.board[nr][nc];
      if (nb.blocked) return;

      nb.owner = color;
      nb.mass++;

      if (nb.mass >= GAME_CFG.EXPLODE_AT) {
        _explode(freshGame.board, nr, nc, color);
      } else {
        updateGameBoard(freshGame.board);
        _onRender?.();
        _checkGameOver(freshGame.board);
      }
    }, idx * 110);
  });
}

// ── GAME OVER ──────────────────────────────────────────
function _checkGameOver(board) {
  const game = getState('currentGame');
  if (!game || game.isOver || game.phase !== 2) return;

  const { pink, blue, neutral } = _countCells(board);
  if (neutral > 0) return; 

  if (pink === 0) { _clearTimers(); _finishGame('blue'); }
  else if (blue === 0) { _clearTimers(); _finishGame('pink'); }
}

function _resolveByScore() {
  const game = getState('currentGame');
  if (!game || game.isOver) return;
  const { pink, blue } = _countCells(game.board);
  _finishGame(pink >= blue ? 'pink' : 'blue');
}

async function _finishGame(winner) {
  stopEngine();
  setGameOver(winner);

  const playerWon = winner === 'pink';

  if (playerWon) {
    await recordWin();
  } else {
    await recordLoss();
  }

  _onGameOver?.(winner);
}

// ── Helpers ────────────────────────────────────────────
function _countCells(board) {
  let pink = 0, blue = 0, neutral = 0;
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell.blocked) continue;
      if (cell.owner === 'pink')  pink++;
      else if (cell.owner === 'blue') blue++;
      else neutral++;
    }
  return { pink, blue, neutral };
}

function _getCellsByOwner(board, color) {
  const res = [];
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
      if (board[r][c].owner === color) res.push([r,c]);
  return res;
}

function _clearTimers() {
  if (_gameTimer) { clearInterval(_gameTimer); _gameTimer = null; }
  if (_botTimer)  { clearInterval(_botTimer);  _botTimer  = null; }
}

function getState(key) {
  return _stateCache[key];
}

import { subscribe, getGame } from '../core/state.js';
const _stateCache = { currentGame: null };

subscribe('currentGame', (val) => { _stateCache.currentGame = val; });

(function initCache() {
  _stateCache.currentGame = getGame();
})();
