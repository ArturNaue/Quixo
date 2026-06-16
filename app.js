const SIZE = 5;
const SYMBOLS = ["X", "O"];
const PLAYER_SETS = {
  2: [
    { id: "X1", symbol: "X", label: "X", seat: "X" },
    { id: "O1", symbol: "O", label: "O", seat: "O" }
  ],
  4: [
    { id: "X1", symbol: "X", label: "X1", seat: "X1" },
    { id: "O1", symbol: "O", label: "O1", seat: "O1" },
    { id: "X2", symbol: "X", label: "X2", seat: "X2" },
    { id: "O2", symbol: "O", label: "O2", seat: "O2" }
  ]
};
const STORAGE_KEY = "quixo-state-v8";
const SCORE_KEY = "quixo-score-v8";
const SETTINGS_KEY = "quixo-settings-v8";
const AI_DELAY = 520;

const boardEl = document.querySelector("#board");
const pushLayer = document.querySelector("#pushLayer");
const messageEl = document.querySelector("#message");
const turnChip = document.querySelector("#turnChip");
const selectionCard = document.querySelector("#selectionCard");
const moveList = document.querySelector("#moveList");
const undoButton = document.querySelector("#undoButton");
const resetButton = document.querySelector("#resetButton");
const rulesButton = document.querySelector("#rulesButton");
const rulesDialog = document.querySelector("#rulesDialog");
const scoreX = document.querySelector("#scoreX");
const scoreO = document.querySelector("#scoreO");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const playerToggles = document.querySelector("#playerToggles");
const ownerChoice = document.querySelector("#ownerChoice");

const arrows = {
  N: "↓",
  S: "↑",
  W: "→",
  E: "←"
};

const sideNames = {
  N: "oben",
  S: "unten",
  W: "links",
  E: "rechts"
};

const initialSettings = () => ({
  playerCount: 2,
  ai: { X1: false, O1: false, X2: false, O2: false }
});

const emptyCell = () => ({ symbol: "", owner: "" });

const initialState = (settings = currentSettings) => ({
  board: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, emptyCell)),
  currentIndex: 0,
  selected: null,
  nextOwner: activePlayers(settings)[0].id,
  winner: null,
  loser: null,
  winningLine: [],
  history: [],
  moves: []
});

let currentSettings = loadSettings();
let state = loadState();
let score = loadScore();
let aiTimer = null;

function activePlayers(settings = currentSettings) {
  return PLAYER_SETS[settings.playerCount];
}

function currentPlayer() {
  return activePlayers()[state.currentIndex] ?? activePlayers()[0];
}

function teamPlayers(symbol = currentPlayer().symbol) {
  return activePlayers().filter((player) => player.symbol === symbol);
}

function opponentSymbol(symbol) {
  return symbol === "X" ? "O" : "X";
}

function normalizeCell(cell) {
  if (typeof cell === "string") return { symbol: cell, owner: cell ? `${cell}1` : "" };
  return { symbol: cell?.symbol || "", owner: cell?.owner || "" };
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if ([2, 4].includes(parsed?.playerCount)) {
      return { ...initialSettings(), ...parsed, ai: { ...initialSettings().ai, ...parsed.ai } };
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
  return initialSettings();
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.board?.length === SIZE && Number.isInteger(parsed.currentIndex)) {
      const players = activePlayers();
      return {
        ...initialState(),
        ...parsed,
        board: parsed.board.map((row) => row.map(normalizeCell)),
        currentIndex: Math.min(parsed.currentIndex, players.length - 1),
        selected: null,
        nextOwner: players.some((player) => player.id === parsed.nextOwner) ? parsed.nextOwner : players[0].id
      };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return initialState();
}

function loadScore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCORE_KEY));
    if (Number.isInteger(parsed?.X) && Number.isInteger(parsed?.O)) return parsed;
  } catch {
    localStorage.removeItem(SCORE_KEY);
  }
  return { X: 0, O: 0 };
}

function save() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, selected: null }));
  localStorage.setItem(SCORE_KEY, JSON.stringify(score));
}

function isBorder(row, col) {
  return row === 0 || row === SIZE - 1 || col === 0 || col === SIZE - 1;
}

function extractionSides(row, col) {
  const sides = [];
  if (row === 0) sides.push("N");
  if (row === SIZE - 1) sides.push("S");
  if (col === 0) sides.push("W");
  if (col === SIZE - 1) sides.push("E");
  return sides;
}

function legalPushSides(row, col) {
  const blocked = new Set(extractionSides(row, col));
  const candidates = [];
  if (col >= 0) candidates.push("N", "S");
  if (row >= 0) candidates.push("W", "E");
  return candidates.filter((side) => !blocked.has(side));
}

function isFirstRound() {
  return state.moves.length < activePlayers().length;
}

function isSelectable(row, col) {
  const player = currentPlayer();
  const cell = state.board[row][col];
  if (state.winner || !isBorder(row, col)) return false;
  if (isFirstRound()) return cell.symbol === "";
  if (cell.symbol === "") return true;
  if (cell.symbol !== player.symbol) return false;
  return currentSettings.playerCount === 2 || cell.owner === player.id;
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function snapshot() {
  return {
    board: cloneBoard(state.board),
    currentIndex: state.currentIndex,
    nextOwner: state.nextOwner,
    winner: state.winner,
    loser: state.loser,
    winningLine: [...state.winningLine],
    moves: [...state.moves],
    score: { ...score }
  };
}

function selectCell(row, col) {
  if (isCurrentAi()) return;
  if (!isSelectable(row, col)) {
    messageEl.textContent = state.winner
      ? `${winnerLabel()} hat gewonnen. Starte eine neue Partie.`
      : "Dieser Wuerfel ist nicht spielbar.";
    return;
  }
  state.selected = { row, col };
  state.nextOwner = defaultOwnerForSelection();
  const value = state.board[row][col].symbol;
  const symbolText = value ? `bleibt ${currentPlayer().symbol}` : `wird zu ${currentPlayer().symbol}`;
  messageEl.textContent = `Wuerfel ${labelCell(row, col)} gewaehlt: ${symbolText}. Schiebe ihn von einer markierten Seite ein.`;
  render();
}

function labelCell(row, col) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function selectedSymbol() {
  if (!state.selected) return "";
  const cell = state.board[state.selected.row][state.selected.col];
  return cell.symbol || currentPlayer().symbol;
}

function defaultOwnerForSelection() {
  if (currentSettings.playerCount === 2) return currentPlayer().id;
  return state.nextOwner && teamPlayers().some((player) => player.id === state.nextOwner)
    ? state.nextOwner
    : currentPlayer().id;
}

function heldCubePosition(row, col) {
  const cell = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  const wrapRect = pushLayer.getBoundingClientRect();
  const cellRect = cell?.getBoundingClientRect();
  if (!cellRect || !wrapRect.width || !wrapRect.height) return null;

  const gap = Math.min(cellRect.width, cellRect.height) * 0.35;
  let centerX = cellRect.left + cellRect.width / 2 - wrapRect.left;
  let centerY = cellRect.top + cellRect.height / 2 - wrapRect.top;

  if (row === 0) centerY = cellRect.top - gap - cellRect.height / 2 - wrapRect.top;
  if (row === SIZE - 1) centerY = cellRect.bottom + gap + cellRect.height / 2 - wrapRect.top;
  if (col === 0) centerX = cellRect.left - gap - cellRect.width / 2 - wrapRect.left;
  if (col === SIZE - 1) centerX = cellRect.right + gap + cellRect.width / 2 - wrapRect.left;

  return {
    left: `${centerX}px`,
    top: `${centerY}px`,
    width: `${cellRect.width}px`,
    height: `${cellRect.height}px`
  };
}

function applyPush(board, row, col, side, symbol, owner) {
  const next = cloneBoard(board);
  next[row][col] = null;
  const placed = { symbol, owner };

  if (side === "N") {
    for (let r = row; r > 0; r -= 1) next[r][col] = next[r - 1][col];
    next[0][col] = placed;
  }
  if (side === "S") {
    for (let r = row; r < SIZE - 1; r += 1) next[r][col] = next[r + 1][col];
    next[SIZE - 1][col] = placed;
  }
  if (side === "W") {
    for (let c = col; c > 0; c -= 1) next[row][c] = next[row][c - 1];
    next[row][0] = placed;
  }
  if (side === "E") {
    for (let c = col; c < SIZE - 1; c += 1) next[row][c] = next[row][c + 1];
    next[row][SIZE - 1] = placed;
  }

  return next.map((line) => line.map((cell) => cell ?? emptyCell()));
}

function pushSelected(side) {
  if (!state.selected || state.winner || isCurrentAi()) return;
  performMove(state.selected.row, state.selected.col, side, state.nextOwner);
}

function performMove(row, col, side, owner = currentPlayer().id) {
  const player = currentPlayer();
  if (!isSelectable(row, col) || !legalPushSides(row, col).includes(side)) return false;
  const legalOwner = teamPlayers(player.symbol).some((candidate) => candidate.id === owner) ? owner : player.id;

  state.history.push(snapshot());
  state.board = applyPush(state.board, row, col, side, player.symbol, legalOwner);
  const ownerText = currentSettings.playerCount === 4 ? ` -> ${ownerLabel(legalOwner)}` : "";
  state.moves.unshift(`${player.label}: ${labelCell(row, col)} von ${sideNames[side]}${ownerText}`);
  const result = evaluateWinner(player.symbol);
  state.selected = null;

  if (result) {
    state.winner = result.winner;
    state.loser = result.loser;
    state.winningLine = result.line;
    score[result.winner] += 1;
    messageEl.textContent = result.loser === player.symbol
      ? `${teamLabel(result.loser)} verliert: gegnerische Reihe geschaffen.`
      : `${teamLabel(result.winner)} gewinnt mit fuenf in einer Reihe.`;
  } else {
    state.currentIndex = nextPlayableIndex(state.currentIndex);
    state.nextOwner = currentPlayer().id;
    state.winningLine = [];
    messageEl.textContent = `${currentPlayer().label} ist am Zug. Waehle einen Randwuerfel.`;
  }

  save();
  render();
  scheduleAi();
  return true;
}

function nextPlayableIndex(startIndex) {
  const players = activePlayers();
  for (let step = 1; step <= players.length; step += 1) {
    const index = (startIndex + step) % players.length;
    if (legalMovesFor(players[index]).length > 0) return index;
  }
  return (startIndex + 1) % players.length;
}

function allLines() {
  const lines = [];
  for (let i = 0; i < SIZE; i += 1) {
    lines.push(Array.from({ length: SIZE }, (_, col) => [i, col]));
    lines.push(Array.from({ length: SIZE }, (_, row) => [row, i]));
  }
  lines.push(Array.from({ length: SIZE }, (_, i) => [i, i]));
  lines.push(Array.from({ length: SIZE }, (_, i) => [i, SIZE - 1 - i]));
  return lines;
}

function linesForSymbol(symbol) {
  return allLines()
    .filter((line) => line.every(([row, col]) => state.board[row][col].symbol === symbol))
    .map((line) => line.map(([row, col]) => `${row}-${col}`));
}

function evaluateWinner(moverSymbol) {
  const opponent = opponentSymbol(moverSymbol);
  const opponentLines = linesForSymbol(opponent);
  if (opponentLines.length) return { winner: opponent, loser: moverSymbol, line: opponentLines[0] };
  const ownLines = linesForSymbol(moverSymbol);
  if (ownLines.length) return { winner: moverSymbol, loser: opponent, line: ownLines[0] };
  return null;
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  clearTimeout(aiTimer);
  const { score: previousScore, ...previousState } = previous;
  score = previousScore ?? score;
  state = { ...state, ...previousState, selected: null };
  messageEl.textContent = `${currentPlayer().label} ist wieder am Zug.`;
  save();
  render();
  scheduleAi();
}

function resetGame() {
  clearTimeout(aiTimer);
  state = initialState();
  messageEl.textContent = currentSettings.playerCount === 4 ? "Neue Partie. X1 beginnt." : "Neue Partie. X beginnt.";
  save();
  render();
  scheduleAi();
}

function legalMovesFor(player) {
  const moves = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const cell = state.board[row][col];
      const legalCell = isBorder(row, col)
        && !state.winner
        && (isFirstRound()
          ? cell.symbol === ""
          : cell.symbol === "" || (cell.symbol === player.symbol && (currentSettings.playerCount === 2 || cell.owner === player.id)));
      if (!legalCell) continue;
      for (const side of legalPushSides(row, col)) {
        for (const owner of teamPlayers(player.symbol).map((candidate) => candidate.id)) {
          moves.push({ row, col, side, owner });
        }
      }
    }
  }
  return moves;
}

function isCurrentAi() {
  return Boolean(currentSettings.ai[currentPlayer().id]);
}

function scoreMove(move, player) {
  const boardBackup = state.board;
  state.board = applyPush(state.board, move.row, move.col, move.side, player.symbol, move.owner);
  const result = evaluateWinner(player.symbol);
  let scoreValue = Math.random();
  if (result?.winner === player.symbol) scoreValue += 1000;
  if (result?.winner === opponentSymbol(player.symbol)) scoreValue -= 1000;
  for (const line of allLines()) {
    const values = line.map(([row, col]) => state.board[row][col].symbol);
    const own = values.filter((value) => value === player.symbol).length;
    const opp = values.filter((value) => value === opponentSymbol(player.symbol)).length;
    if (opp === 0) scoreValue += own * own;
    if (own === 0) scoreValue -= opp * opp * 0.7;
  }
  state.board = boardBackup;
  return scoreValue;
}

function chooseAiMove() {
  const player = currentPlayer();
  const moves = legalMovesFor(player);
  if (!moves.length) return null;
  return moves
    .map((move) => ({ move, score: scoreMove(move, player) }))
    .sort((a, b) => b.score - a.score)[0].move;
}

function scheduleAi() {
  clearTimeout(aiTimer);
  if (!state.winner && isCurrentAi()) {
    messageEl.textContent = `${currentPlayer().label} denkt nach ...`;
    aiTimer = setTimeout(() => {
      const move = chooseAiMove();
      if (move) performMove(move.row, move.col, move.side, move.owner);
    }, AI_DELAY);
  }
}

function renderBoard() {
  boardEl.innerHTML = "";
  const winning = new Set(state.winningLine);

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const cellValue = state.board[row][col];
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      const isSelected = state.selected?.row === row && state.selected?.col === col;
      const visibleSymbol = isSelected ? "" : cellValue.symbol;
      const selectedLabel = isSelected ? `Luecke, Wuerfel ${selectedSymbol()} entnommen` : cellLabel(cellValue);
      cell.setAttribute("aria-label", `${labelCell(row, col)} ${selectedLabel}`);
      cell.dataset.row = row;
      cell.dataset.col = col;
      if (visibleSymbol) cell.classList.add(visibleSymbol.toLowerCase());
      if (cellValue.owner && !isSelected && currentSettings.playerCount === 4) {
        const ownerMark = document.createElement("span");
        ownerMark.className = "owner-mark";
        ownerMark.textContent = ownerLabel(cellValue.owner).slice(-1);
        cell.append(ownerMark);
      }
      if (isSelectable(row, col) && !isCurrentAi()) cell.classList.add("legal");
      if (isSelected) cell.classList.add("gap");
      if (winning.has(`${row}-${col}`)) cell.classList.add("win");
      cell.addEventListener("click", () => selectCell(row, col));
      boardEl.append(cell);
    }
  }
}

function cellLabel(cell) {
  if (!cell.symbol) return "neutral";
  return currentSettings.playerCount === 4 ? `${cell.symbol}, Punkt ${ownerLabel(cell.owner)}` : cell.symbol;
}

function renderPushButtons() {
  pushLayer.innerHTML = "";
  if (!state.selected || state.winner) return;

  const { row, col } = state.selected;
  const heldPosition = heldCubePosition(row, col);
  if (heldPosition) {
    const heldCube = document.createElement("div");
    heldCube.className = `held-cube ${selectedSymbol().toLowerCase()}`;
    heldCube.setAttribute("aria-label", `Entnommener Wuerfel ${selectedSymbol()}`);
    heldCube.style.left = heldPosition.left;
    heldCube.style.top = heldPosition.top;
    heldCube.style.width = heldPosition.width;
    heldCube.style.height = heldPosition.height;
    pushLayer.append(heldCube);
  }

  for (const side of legalPushSides(row, col)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "push-button";
    button.dataset.side = side;
    button.textContent = arrows[side];
    button.title = `Von ${sideNames[side]} einschieben`;
    button.setAttribute("aria-label", button.title);
    if (side === "N" || side === "S") {
      button.style.left = `${18 + col * 16}%`;
    } else {
      button.style.top = `${18 + row * 16}%`;
    }
    button.addEventListener("click", () => pushSelected(side));
    pushLayer.append(button);
  }
}

function renderSidePanel() {
  const player = currentPlayer();
  turnChip.textContent = player.label;
  turnChip.classList.toggle("o", player.symbol === "O");
  scoreX.textContent = score.X;
  scoreO.textContent = score.O;
  undoButton.disabled = state.history.length === 0;

  if (state.selected) {
    const { row, col } = state.selected;
    const value = state.board[row][col].symbol;
    const symbolText = value ? `${player.symbol}` : `neutral -> ${player.symbol}`;
    selectionCard.textContent = `${labelCell(row, col)} ${symbolText} - ${legalPushSides(row, col)
      .map((side) => sideNames[side])
      .join(", ")}`;
  } else if (state.winner) {
    selectionCard.textContent = `${teamLabel(state.winner)} hat die Partie gewonnen.`;
  } else {
    selectionCard.textContent = isCurrentAi() ? `${player.label} ist KI-Spieler` : "Noch kein Wuerfel gewaehlt";
  }

  moveList.innerHTML = "";
  for (const move of state.moves.slice(0, 18)) {
    const item = document.createElement("li");
    item.textContent = move;
    moveList.append(item);
  }
}

function renderSettings() {
  for (const button of modeButtons) {
    button.classList.toggle("active", Number(button.dataset.mode) === currentSettings.playerCount);
  }

  playerToggles.innerHTML = "";
  for (const player of activePlayers()) {
    const label = document.createElement("label");
    label.className = `ai-toggle ${player.symbol.toLowerCase()}`;
    label.innerHTML = `<span>${player.label}</span><input type="checkbox" ${currentSettings.ai[player.id] ? "checked" : ""} aria-label="${player.label} KI">`;
    label.querySelector("input").addEventListener("change", (event) => {
      currentSettings.ai[player.id] = event.target.checked;
      save();
      render();
      scheduleAi();
    });
    playerToggles.append(label);
  }
}

function renderOwnerChoice() {
  ownerChoice.innerHTML = "";
  if (currentSettings.playerCount !== 4 || !state.selected || state.winner) {
    ownerChoice.hidden = true;
    return;
  }

  ownerChoice.hidden = false;
  for (const player of teamPlayers()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `owner-button ${state.nextOwner === player.id ? "active" : ""}`;
    button.textContent = `Punkt ${player.label}`;
    button.addEventListener("click", () => {
      state.nextOwner = player.id;
      render();
    });
    ownerChoice.append(button);
  }
}

function ownerLabel(owner) {
  return activePlayers().find((player) => player.id === owner)?.label || owner || "-";
}

function teamLabel(symbol) {
  return currentSettings.playerCount === 4 ? `Team ${symbol}` : symbol;
}

function winnerLabel() {
  return state.winner ? teamLabel(state.winner) : "";
}

function render() {
  renderBoard();
  renderPushButtons();
  renderSidePanel();
  renderSettings();
  renderOwnerChoice();
}

function setMode(playerCount) {
  if (currentSettings.playerCount === playerCount) return;
  clearTimeout(aiTimer);
  currentSettings.playerCount = playerCount;
  state = initialState();
  messageEl.textContent = playerCount === 4 ? "Vier Spieler: X1 beginnt." : "Zwei Spieler: X beginnt.";
  save();
  render();
  scheduleAi();
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(Number(button.dataset.mode)));
});
undoButton.addEventListener("click", undo);
resetButton.addEventListener("click", resetGame);
rulesButton.addEventListener("click", () => rulesDialog.showModal());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

render();
scheduleAi();
