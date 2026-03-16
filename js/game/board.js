/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * 5×5 Board Renderer + HUD + Result Screen
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, formatTime, sleep } from '../core/app.js';
import {
  initGameState, getGame, setView, clearGame,
  getWalletBs, ECONOMY, GAME_CFG,
} from '../core/state.js';
import { startEngine, stopEngine, playerClick, getCellCounts } from './engine.js';

registerView('game', initGameView);

let $container = null;

export async function initGameView($el) {
  $container = $el;

  initGameState();
  mountArena($container);

  startEngine(
    ()       => renderBoard(),
    (winner) => showResult(winner)
  );

  renderBoard();
}

// ── ARENA SKELETON ────────────────────────────────────
function mountArena($c) {
  $c.innerHTML = `
  <div class="game-arena" id="arena-wrap">

    <div class="game-hud" id="game-hud">
      <div id="hud-phase" style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-family:var(--font-mono);font-size:.52rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;" id="hud-phase-label">FASE 1</span>
        <span style="font-family:var(--font-body);font-size:.76rem;color:var(--text-base);" id="hud-phase-sub">Elige tu celda</span>
      </div>
      <div class="hud-timer" id="hud-timer">0:10</div>
      <div id="hud-counts" style="display:flex;flex-direction:column;gap:2px;align-items:flex-end;">
        <div style="display:flex;align-items:center;gap:.35rem;">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--pink);box-shadow:0 0 4px var(--pink-dim);display:inline-block;"></span>
          <span style="font-family:var(--font-display);font-size:.72rem;font-weight:700;color:var(--pink);" id="hud-pink">0</span>
        </div>
        <div style="display:flex;align-items:center;gap:.35rem;">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--blue);box-shadow:0 0 4px var(--blue-dim);display:inline-block;"></span>
          <span style="font-family:var(--font-display);font-size:.72rem;font-weight:700;color:var(--blue);" id="hud-blue">0</span>
        </div>
      </div>
    </div>

    <div class="board-wrap">
      <div class="board-grid" id="board-grid" role="grid" aria-label="Tablero Color Wars 5x5"></div>
    </div>

    <div style="display:flex;gap:1.25rem;flex-wrap:wrap;justify-content:center;font-family:var(--font-mono);font-size:.58rem;color:var(--text-ghost);letter-spacing:.06em;">
      <span><span style="color:var(--pink);">■</span> TÚ</span>
      <span><span style="color:var(--blue);">■</span> BOT</span>
      <span><span style="color:var(--text-ghost);">■</span> BLOQUEADA</span>
    </div>

    <button id="btn-surrender" class="btn btn-ghost" style="font-size:.6rem;letter-spacing:.1em;margin-top:.25rem;">
      🏳 Rendirse
    </button>

  </div>`;

  // Build initial cells
  const $grid = $container.querySelector('#board-grid');
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++) {
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++) {
      const $cell = document.createElement('div');
      $cell.className  = 'cell';
      $cell.dataset.row = r;
      $cell.dataset.col = c;
      $cell.setAttribute('role','gridcell');
      $cell.setAttribute('aria-label', `Celda ${r+1}-${c+1}`);
      $cell.addEventListener('click', () => playerClick(r, c));
      $grid.appendChild($cell);
    }
  }

  $container.querySelector('#btn-surrender')?.addEventListener('click', () => {
    if (confirm('¿Seguro que quieres rendirte? Perderás la partida.')) {
      stopEngine();
      showResult('blue');
    }
  });
}

// ── BOARD RENDER ──────────────────────────────────────
function renderBoard() {
  if (!$container) return;
  const game = getGame();
  if (!game) return;

  updateHUD(game);

  const $cells = $container.querySelectorAll('.cell');
  const playerHasCell = game.board.some(row => row.some(c => c.owner === 'pink'));

  $cells.forEach($cell => {
    const r    = parseInt($cell.dataset.row);
    const c    = parseInt($cell.dataset.col);
    const cell = game.board[r][c];
    updateCell($cell, cell, game.phase, playerHasCell);
  });
}

function updateHUD(game) {
  const $timer = $container.querySelector('#hud-timer');
  const $label = $container.querySelector('#hud-phase-label');
  const $sub   = $container.querySelector('#hud-phase-sub');
  const $pink  = $container.querySelector('#hud-pink');
  const $blue  = $container.querySelector('#hud-blue');

  if ($timer) {
    $timer.textContent = formatTime(game.timeLeft);
    $timer.classList.toggle('urgent', game.phase === 2 && game.timeLeft <= 30);
  }

  if ($label) $label.textContent = game.phase === 1 ? 'FASE 1 · SELECCIÓN' : 'FASE 2 · BATALLA';
  if ($sub)   $sub.textContent   = game.phase === 1 ? 'Elige tu celda de inicio' : 'Clic en tu celda para +1 masa';

  const counts = getCellCounts();
  if ($pink) $pink.textContent = counts.pink;
  if ($blue) $blue.textContent = counts.blue;
}

function updateCell($cell, cell, phase, playerHasCell) {
  // Remove color classes
  $cell.classList.remove('cell-pink','cell-blue','blocked','phase1-avail');

  if (cell.blocked) {
    $cell.classList.add('blocked');
    $cell.innerHTML = `<span style="font-size:.65rem;color:var(--text-ghost);">✕</span>`;
    return;
  }

  if (cell.owner === 'pink')      $cell.classList.add('cell-pink');
  else if (cell.owner === 'blue') $cell.classList.add('cell-blue');
  else if (phase === 1 && !playerHasCell) $cell.classList.add('phase1-avail');

  // Mass orbs (visual max 3)
  const vis = Math.min(cell.mass, 3);
  $cell.innerHTML = vis > 0
    ? `<div class="cell-mass">${Array.from({length:vis},(_,i)=>`<div class="mass-orb" style="animation-delay:${i*.28}s;"></div>`).join('')}</div>`
    : '';

  $cell.setAttribute('aria-label',
    cell.owner
      ? `${cell.owner==='pink'?'Tuya':'Enemiga'}, masa ${vis}`
      : 'Vacía'
  );
}

// ── RESULT SCREEN ─────────────────────────────────────
async function showResult(winner) {
  stopEngine();

  const playerWon = winner === 'pink';
  const counts    = getCellCounts();
  const walletBs  = getWalletBs();

  const html = `
  <div class="result-screen" id="result-screen">

    <div class="result-title ${playerWon ? 'result-win' : 'result-lose'}">
      ${playerWon ? '¡VICTORIA!' : 'DERROTA'}
    </div>

    <p style="font-family:var(--font-display);font-size:.72rem;letter-spacing:.2em;color:var(--text-dim);text-transform:uppercase;">
      ${playerWon ? 'Dominaste la arena' : 'El bot te superó esta vez'}
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;background:var(--surface-1);border:1px solid var(--border-dim);border-radius:var(--r-lg);padding:1.1rem 1.75rem;margin:.35rem 0;width:100%;max-width:320px;">
      <div style="text-align:center;border-right:1px solid var(--border-ghost);padding-right:1.25rem;">
        <p style="font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.2rem;">Tus celdas</p>
        <p style="font-family:var(--font-display);font-size:1.9rem;font-weight:900;color:var(--pink);text-shadow:0 0 10px var(--pink-dim);">${counts.pink}</p>
      </div>
      <div style="text-align:center;">
        <p style="font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.2rem;">Celdas del bot</p>
        <p style="font-family:var(--font-display);font-size:1.9rem;font-weight:900;color:var(--blue);text-shadow:0 0 10px var(--blue-dim);">${counts.blue}</p>
      </div>
    </div>

    <div style="background:${playerWon?'rgba(0,184,108,.08)':'rgba(255,0,127,.08)'};border:1px solid ${playerWon?'rgba(0,184,108,.3)':'rgba(255,0,127,.3)'};border-radius:var(--r-md);padding:.65rem 1.35rem;font-family:var(--font-mono);font-size:.72rem;line-height:1.9;text-align:center;width:100%;max-width:320px;">
      ${playerWon
        ? `<span style="color:#00b86c;font-size:.95rem;font-weight:700;">+${ECONOMY.WINNER_PRIZE_BS} Bs acreditados 🎉</span>`
        : `<span style="color:var(--pink);">Perdiste ${ECONOMY.ENTRY_FEE_BS} Bs de entrada</span>`}
      <br>
      <span style="color:var(--text-dim);font-size:.62rem;">Saldo actual: ${walletBs.toLocaleString('es-VE')} Bs</span>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;gap:.65rem;width:100%;max-width:300px;">
      <button id="btn-play-again" class="btn btn-battle" style="height:54px;font-size:.82rem;"
        ${walletBs < ECONOMY.ENTRY_FEE_BS ? 'disabled' : ''}>
        ⚔ JUGAR DE NUEVO
      </button>
      <button id="btn-to-dash" class="btn btn-ghost" style="width:100%;font-size:.68rem;">
        ← Volver al Panel
      </button>
    </div>

    ${walletBs < ECONOMY.ENTRY_FEE_BS ? `<p style="font-family:var(--font-mono);font-size:.62rem;color:var(--pink);text-align:center;">Saldo insuficiente. Recarga para jugar.</p>` : ''}

  </div>`;

  const $arena = $container.querySelector('#arena-wrap');
  if ($arena) $arena.insertAdjacentHTML('beforeend', html);
  else $container.insertAdjacentHTML('beforeend', html);

  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    document.getElementById('result-screen')?.remove();
    clearGame();
    setView('matchmaking');
  });

  document.getElementById('btn-to-dash')?.addEventListener('click', () => {
    clearGame();
    setView('dashboard');
  });
}
