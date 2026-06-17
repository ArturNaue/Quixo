import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { QUIXO_AI_LEVELS, createQuixoAi } from "./ai-engine";

const SIZE = 5;
const STORAGE_KEY = "quixo-state-v11";
const SCORE_KEY = "quixo-score-v11";
const SETTINGS_KEY = "quixo-settings-v11";
const AI_DELAY = 520;
const DEFAULT_AI_LEVEL = "hard";

type SymbolMark = "" | "X" | "O";
type PlayerId = "X1" | "O1" | "X2" | "O2";
type Direction = "N" | "S" | "W" | "E";

type Cell = {
  symbol: SymbolMark;
  owner: PlayerId | "";
};

type Player = {
  id: PlayerId;
  symbol: Exclude<SymbolMark, "">;
  label: string;
  seat: string;
};

type Settings = {
  playerCount: 2 | 4;
  ai: Record<PlayerId, boolean>;
  aiLevel: Record<PlayerId, string>;
};

type Move = {
  row: number;
  col: number;
  side: Direction;
  owner: PlayerId;
};

type Snapshot = {
  board: Cell[][];
  currentIndex: number;
  nextOwner: PlayerId;
  winner: SymbolMark | null;
  loser: SymbolMark | null;
  winningLine: string[];
  moves: string[];
  score: Score;
};

type GameState = {
  board: Cell[][];
  currentIndex: number;
  selected: { row: number; col: number } | null;
  nextOwner: PlayerId;
  winner: SymbolMark | null;
  loser: SymbolMark | null;
  winningLine: string[];
  history: Snapshot[];
  moves: string[];
};

type Score = Record<"X" | "O", number>;

const PLAYER_SETS: Record<2 | 4, Player[]> = {
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

const arrows: Record<Direction, string> = {
  N: "↓",
  S: "↑",
  W: "→",
  E: "←"
};

const sideNames: Record<Direction, string> = {
  N: "oben",
  S: "unten",
  W: "links",
  E: "rechts"
};

const quixoAi = createQuixoAi();

const emptyCell = (): Cell => ({ symbol: "", owner: "" });
const cloneBoard = (board: Cell[][]): Cell[][] => board.map((row) => row.map((cell) => ({ ...cell })));
const activePlayers = (settings: Settings): Player[] => PLAYER_SETS[settings.playerCount];

function initialSettings(): Settings {
  return {
    playerCount: 2,
    ai: { X1: false, O1: false, X2: false, O2: false },
    aiLevel: { X1: DEFAULT_AI_LEVEL, O1: DEFAULT_AI_LEVEL, X2: DEFAULT_AI_LEVEL, O2: DEFAULT_AI_LEVEL }
  };
}

function normalizeAiLevels(levels: Partial<Record<PlayerId, string>> = {}): Record<PlayerId, string> {
  const valid = Object.keys(QUIXO_AI_LEVELS);
  return Object.fromEntries(
    (Object.keys(initialSettings().aiLevel) as PlayerId[]).map((playerId) => [
      playerId,
      valid.includes(levels[playerId] || "") ? levels[playerId] : DEFAULT_AI_LEVEL
    ])
  ) as Record<PlayerId, string>;
}

function normalizeCell(cell: Cell | string | null | undefined): Cell {
  if (typeof cell === "string") return { symbol: cell as SymbolMark, owner: cell ? (`${cell}1` as PlayerId) : "" };
  return { symbol: (cell?.symbol || "") as SymbolMark, owner: (cell?.owner || "") as PlayerId | "" };
}

function initialState(settings: Settings): GameState {
  return {
    board: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, emptyCell)),
    currentIndex: 0,
    selected: null,
    nextOwner: activePlayers(settings)[0].id,
    winner: null,
    loser: null,
    winningLine: [],
    history: [],
    moves: []
  };
}

function loadSettings(): Settings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if ([2, 4].includes(parsed?.playerCount)) {
      const defaults = initialSettings();
      return {
        ...defaults,
        ...parsed,
        ai: { ...defaults.ai, ...parsed.ai },
        aiLevel: normalizeAiLevels(parsed.aiLevel)
      };
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
  return initialSettings();
}

function loadState(settings: Settings): GameState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed?.board?.length === SIZE && Number.isInteger(parsed.currentIndex)) {
      const players = activePlayers(settings);
      return {
        ...initialState(settings),
        ...parsed,
        board: parsed.board.map((row: Cell[]) => row.map(normalizeCell)),
        currentIndex: Math.min(parsed.currentIndex, players.length - 1),
        selected: null,
        nextOwner: players.some((player) => player.id === parsed.nextOwner) ? parsed.nextOwner : players[0].id
      };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return initialState(settings);
}

function loadScore(): Score {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCORE_KEY) || "null");
    if (Number.isInteger(parsed?.X) && Number.isInteger(parsed?.O)) return parsed;
  } catch {
    localStorage.removeItem(SCORE_KEY);
  }
  return { X: 0, O: 0 };
}

function isBorder(row: number, col: number): boolean {
  return row === 0 || row === SIZE - 1 || col === 0 || col === SIZE - 1;
}

function extractionSides(row: number, col: number): Direction[] {
  const sides: Direction[] = [];
  if (row === 0) sides.push("N");
  if (row === SIZE - 1) sides.push("S");
  if (col === 0) sides.push("W");
  if (col === SIZE - 1) sides.push("E");
  return sides;
}

function legalPushSides(row: number, col: number): Direction[] {
  const blocked = new Set(extractionSides(row, col));
  const candidates: Direction[] = ["N", "S", "W", "E"];
  return candidates.filter((side) => !blocked.has(side));
}

function labelCell(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function opponentSymbol(symbol: Exclude<SymbolMark, "">): Exclude<SymbolMark, ""> {
  return symbol === "X" ? "O" : "X";
}

function allLines(): number[][][] {
  const lines = [];
  for (let i = 0; i < SIZE; i += 1) {
    lines.push(Array.from({ length: SIZE }, (_, col) => [i, col]));
    lines.push(Array.from({ length: SIZE }, (_, row) => [row, i]));
  }
  lines.push(Array.from({ length: SIZE }, (_, i) => [i, i]));
  lines.push(Array.from({ length: SIZE }, (_, i) => [i, SIZE - 1 - i]));
  return lines;
}

function applyPush(board: Cell[][], row: number, col: number, side: Direction, symbol: Exclude<SymbolMark, "">, owner: PlayerId): Cell[][] {
  const next = cloneBoard(board) as (Cell | null)[][];
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

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [state, setState] = useState<GameState>(() => loadState(loadSettings()));
  const [score, setScore] = useState<Score>(() => loadScore());
  const [message, setMessage] = useState("Waehle einen Randwuerfel: leer oder dein eigenes Symbol.");
  const [heldStyle, setHeldStyle] = useState<CSSProperties | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pushLayerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const aiTimerRef = useRef<number | null>(null);

  const players = activePlayers(settings);
  const currentPlayer = players[state.currentIndex] ?? players[0];

  const teamPlayers = useCallback(
    (symbol = currentPlayer.symbol) => players.filter((player) => player.symbol === symbol),
    [currentPlayer.symbol, players]
  );

  const isFirstRound = useCallback(() => state.moves.length < players.length, [players.length, state.moves.length]);

  const isSelectable = useCallback(
    (row: number, col: number, player = currentPlayer, board = state.board) => {
      const cell = board[row][col];
      if (state.winner || !isBorder(row, col)) return false;
      if (isFirstRound()) return cell.symbol === "";
      if (cell.symbol === "") return true;
      if (cell.symbol !== player.symbol) return false;
      return settings.playerCount === 2 || cell.owner === player.id;
    },
    [currentPlayer, isFirstRound, settings.playerCount, state.board, state.winner]
  );

  const legalMovesFor = useCallback(
    (player: Player, board = state.board, currentState = state): Move[] => {
      const moves: Move[] = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          const cell = board[row][col];
          const firstRound = currentState.moves.length < players.length;
          const legalCell =
            isBorder(row, col) &&
            !currentState.winner &&
            (firstRound
              ? cell.symbol === ""
              : cell.symbol === "" || (cell.symbol === player.symbol && (settings.playerCount === 2 || cell.owner === player.id)));
          if (!legalCell) continue;
          for (const side of legalPushSides(row, col)) {
            for (const owner of players.filter((candidate) => candidate.symbol === player.symbol).map((candidate) => candidate.id)) {
              moves.push({ row, col, side, owner });
            }
          }
        }
      }
      return moves;
    },
    [players, settings.playerCount, state]
  );

  const nextPlayableIndex = useCallback(
    (startIndex: number, currentState: GameState) => {
      for (let step = 1; step <= players.length; step += 1) {
        const index = (startIndex + step) % players.length;
        if (legalMovesFor(players[index], currentState.board, { ...currentState, currentIndex: index }).length > 0) return index;
      }
      return (startIndex + 1) % players.length;
    },
    [legalMovesFor, players]
  );

  const evaluateWinner = useCallback((board: Cell[][], moverSymbol: Exclude<SymbolMark, "">) => {
    const linesForSymbol = (symbol: SymbolMark) =>
      allLines()
        .filter((line) => line.every(([row, col]) => board[row][col].symbol === symbol))
        .map((line) => line.map(([row, col]) => `${row}-${col}`));
    const opponent = opponentSymbol(moverSymbol);
    const opponentLines = linesForSymbol(opponent);
    if (opponentLines.length) return { winner: opponent, loser: moverSymbol, line: opponentLines[0] };
    const ownLines = linesForSymbol(moverSymbol);
    if (ownLines.length) return { winner: moverSymbol, loser: opponent, line: ownLines[0] };
    return null;
  }, []);

  const ownerLabel = useCallback((owner: PlayerId | "") => players.find((player) => player.id === owner)?.label || owner || "-", [players]);
  const teamLabel = useCallback((symbol: SymbolMark | null) => (settings.playerCount === 4 ? `Team ${symbol}` : symbol || ""), [settings.playerCount]);
  const isCurrentAi = Boolean(settings.ai[currentPlayer.id]);

  const selectedSymbol = useCallback((): SymbolMark => {
    if (!state.selected) return "";
    const cell = state.board[state.selected.row][state.selected.col];
    return cell.symbol || currentPlayer.symbol;
  }, [currentPlayer.symbol, state.board, state.selected]);

  const defaultOwnerForSelection = useCallback((): PlayerId => {
    if (settings.playerCount === 2) return currentPlayer.id;
    return state.nextOwner && teamPlayers().some((player) => player.id === state.nextOwner) ? state.nextOwner : currentPlayer.id;
  }, [currentPlayer.id, settings.playerCount, state.nextOwner, teamPlayers]);

  const snapshot = useCallback(
    (currentState = state): Snapshot => ({
      board: cloneBoard(currentState.board),
      currentIndex: currentState.currentIndex,
      nextOwner: currentState.nextOwner,
      winner: currentState.winner,
      loser: currentState.loser,
      winningLine: [...currentState.winningLine],
      moves: [...currentState.moves],
      score: { ...score }
    }),
    [score, state]
  );

  const save = useCallback((nextSettings = settings, nextState = state, nextScore = score) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...nextState, selected: null }));
    localStorage.setItem(SCORE_KEY, JSON.stringify(nextScore));
  }, [score, settings, state]);

  const performMove = useCallback(
    (row: number, col: number, side: Direction, owner = currentPlayer.id) => {
      if (!isSelectable(row, col) || !legalPushSides(row, col).includes(side)) return false;
      const legalOwner = teamPlayers(currentPlayer.symbol).some((candidate) => candidate.id === owner) ? owner : currentPlayer.id;
      const nextBoard = applyPush(state.board, row, col, side, currentPlayer.symbol, legalOwner);
      const result = evaluateWinner(nextBoard, currentPlayer.symbol);
      const ownerText = settings.playerCount === 4 ? ` -> ${ownerLabel(legalOwner)}` : "";
      const nextState: GameState = {
        ...state,
        history: [...state.history, snapshot()],
        board: nextBoard,
        moves: [`${currentPlayer.label}: ${labelCell(row, col)} von ${sideNames[side]}${ownerText}`, ...state.moves],
        selected: null,
        winningLine: []
      };
      let nextScore = score;

      if (result) {
        nextScore = { ...score, [result.winner]: score[result.winner] + 1 };
        nextState.winner = result.winner;
        nextState.loser = result.loser;
        nextState.winningLine = result.line;
        setMessage(
          result.loser === currentPlayer.symbol
            ? `${teamLabel(result.loser)} verliert: gegnerische Reihe geschaffen.`
            : `${teamLabel(result.winner)} gewinnt mit fuenf in einer Reihe.`
        );
      } else {
        nextState.currentIndex = nextPlayableIndex(state.currentIndex, nextState);
        nextState.nextOwner = players[nextState.currentIndex].id;
        nextState.winner = null;
        nextState.loser = null;
        setMessage(`${players[nextState.currentIndex].label} ist am Zug. Waehle einen Randwuerfel.`);
      }

      setState(nextState);
      setScore(nextScore);
      save(settings, nextState, nextScore);
      return true;
    },
    [currentPlayer, evaluateWinner, isSelectable, nextPlayableIndex, ownerLabel, players, save, score, settings, snapshot, state, teamLabel, teamPlayers]
  );

  const selectCell = (row: number, col: number) => {
    if (isCurrentAi) return;
    if (!isSelectable(row, col)) {
      setMessage(state.winner ? `${teamLabel(state.winner)} hat gewonnen. Starte eine neue Partie.` : "Dieser Wuerfel ist nicht spielbar.");
      return;
    }
    const value = state.board[row][col].symbol;
    const symbolText = value ? `bleibt ${currentPlayer.symbol}` : `wird zu ${currentPlayer.symbol}`;
    const nextState = { ...state, selected: { row, col }, nextOwner: defaultOwnerForSelection() };
    setState(nextState);
    setMessage(`Wuerfel ${labelCell(row, col)} gewaehlt: ${symbolText}. Schiebe ihn von einer markierten Seite ein.`);
  };

  const undo = () => {
    const previous = state.history[state.history.length - 1];
    if (!previous) return;
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    const nextState: GameState = {
      ...state,
      board: previous.board,
      currentIndex: previous.currentIndex,
      nextOwner: previous.nextOwner,
      winner: previous.winner,
      loser: previous.loser,
      winningLine: previous.winningLine,
      moves: previous.moves,
      history: state.history.slice(0, -1),
      selected: null
    };
    setState(nextState);
    setScore(previous.score);
    setMessage(`${players[nextState.currentIndex].label} ist wieder am Zug.`);
    save(settings, nextState, previous.score);
  };

  const resetGame = () => {
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    const nextState = initialState(settings);
    setState(nextState);
    setMessage(settings.playerCount === 4 ? "Neue Partie. X1 beginnt." : "Neue Partie. X beginnt.");
    save(settings, nextState, score);
  };

  const setMode = (playerCount: 2 | 4) => {
    if (settings.playerCount === playerCount) return;
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    const nextSettings = { ...settings, playerCount };
    const nextState = initialState(nextSettings);
    setSettings(nextSettings);
    setState(nextState);
    setMessage(playerCount === 4 ? "Vier Spieler: X1 beginnt." : "Zwei Spieler: X beginnt.");
    save(nextSettings, nextState, score);
  };

  useEffect(() => {
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    if (!state.winner && isCurrentAi) {
      setMessage(`${currentPlayer.label} denkt nach ...`);
      aiTimerRef.current = window.setTimeout(() => {
        const difficulty = settings.aiLevel[currentPlayer.id] || DEFAULT_AI_LEVEL;
        const move = quixoAi.chooseMove(state, settings, difficulty);
        if (move) performMove(move.row, move.col, move.side, move.owner);
      }, AI_DELAY);
    }
    return () => {
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    };
  }, [currentPlayer.id, currentPlayer.label, isCurrentAi, performMove, settings, state]);

  useLayoutEffect(() => {
    const update = () => {
      if (!state.selected || !boardRef.current || !pushLayerRef.current) {
        setHeldStyle(null);
        return;
      }
      const { row, col } = state.selected;
      const cell = boardRef.current.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
      const wrapRect = pushLayerRef.current.getBoundingClientRect();
      const cellRect = cell?.getBoundingClientRect();
      if (!cellRect || !wrapRect.width || !wrapRect.height) {
        setHeldStyle(null);
        return;
      }
      const gap = Math.min(cellRect.width, cellRect.height) * 0.35;
      let centerX = cellRect.left + cellRect.width / 2 - wrapRect.left;
      let centerY = cellRect.top + cellRect.height / 2 - wrapRect.top;
      if (row === 0) centerY = cellRect.top - gap - cellRect.height / 2 - wrapRect.top;
      if (row === SIZE - 1) centerY = cellRect.bottom + gap + cellRect.height / 2 - wrapRect.top;
      if (col === 0) centerX = cellRect.left - gap - cellRect.width / 2 - wrapRect.left;
      if (col === SIZE - 1) centerX = cellRect.right + gap + cellRect.width / 2 - wrapRect.left;
      setHeldStyle({
        left: `${centerX}px`,
        top: `${centerY}px`,
        width: `${cellRect.width}px`,
        height: `${cellRect.height}px`
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [state.board, state.selected]);

  const winning = useMemo(() => new Set(state.winningLine), [state.winningLine]);
  const selected = state.selected;
  const pushSides = selected ? legalPushSides(selected.row, selected.col) : [];

  const cellLabel = (cell: Cell) => {
    if (!cell.symbol) return "neutral";
    return settings.playerCount === 4 ? `${cell.symbol}, Punkt ${ownerLabel(cell.owner)}` : cell.symbol;
  };

  const selectionText = () => {
    if (state.selected) {
      const { row, col } = state.selected;
      const value = state.board[row][col].symbol;
      const symbolText = value ? `${currentPlayer.symbol}` : `neutral -> ${currentPlayer.symbol}`;
      return `${labelCell(row, col)} ${symbolText} - ${legalPushSides(row, col).map((side) => sideNames[side]).join(", ")}`;
    }
    if (state.winner) return `${teamLabel(state.winner)} hat die Partie gewonnen.`;
    return isCurrentAi ? `${currentPlayer.label} ist KI-Spieler` : "Noch kein Wuerfel gewaehlt";
  };

  return (
    <>
      <main className="app-shell">
        <section className="game-panel" aria-label="Quixo Spielfeld">
          <div className="topbar">
            <div>
              <p className="eyebrow">Abstract Strategy</p>
              <h1>Quixo</h1>
            </div>
            <div className="status-card" aria-live="polite">
              <span className="status-label">Am Zug</span>
              <span className={`player-chip ${currentPlayer.symbol === "O" ? "o" : ""}`}>{currentPlayer.label}</span>
            </div>
          </div>

          <div className="board-wrap">
            <div className="push-layer" ref={pushLayerRef} aria-hidden="true">
              {selected && heldStyle ? <div className={`held-cube ${selectedSymbol().toLowerCase()}`} style={heldStyle} /> : null}
              {selected
                ? pushSides.map((side) => (
                    <button
                      key={side}
                      type="button"
                      className="push-button"
                      data-side={side}
                      style={side === "N" || side === "S" ? { left: `${18 + selected.col * 16}%` } : { top: `${18 + selected.row * 16}%` }}
                      title={`Von ${sideNames[side]} einschieben`}
                      aria-label={`Von ${sideNames[side]} einschieben`}
                      onClick={() => performMove(selected.row, selected.col, side, state.nextOwner)}
                    >
                      {arrows[side]}
                    </button>
                  ))
                : null}
            </div>
            <div className="board" ref={boardRef} role="grid" aria-label="5 mal 5 Quixo Brett">
              {state.board.map((rowCells, row) =>
                rowCells.map((cell, col) => {
                  const isSelected = selected?.row === row && selected?.col === col;
                  const visibleSymbol = isSelected ? "" : cell.symbol;
                  const selectedLabel = isSelected ? `Luecke, Wuerfel ${selectedSymbol()} entnommen` : cellLabel(cell);
                  const classes = [
                    "cell",
                    visibleSymbol.toLowerCase(),
                    isSelectable(row, col) && !isCurrentAi ? "legal" : "",
                    isSelected ? "gap" : "",
                    winning.has(`${row}-${col}`) ? "win" : ""
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      className={classes}
                      role="gridcell"
                      data-row={row}
                      data-col={col}
                      aria-label={`${labelCell(row, col)} ${selectedLabel}`}
                      onClick={() => selectCell(row, col)}
                    >
                      {cell.owner && !isSelected && settings.playerCount === 4 ? <span className="owner-mark">{ownerLabel(cell.owner).slice(-1)}</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="message-row">
            <p>{message}</p>
            <button className="text-button" type="button" onClick={() => dialogRef.current?.showModal()}>
              Regeln
            </button>
          </div>
        </section>

        <aside className="side-panel" aria-label="Spielkontrolle">
          <section className="control-block">
            <h2>Partie</h2>
            <div className="mode-switch" aria-label="Spielmodus">
              {[2, 4].map((mode) => (
                <button key={mode} className={`mode-button ${settings.playerCount === mode ? "active" : ""}`} type="button" onClick={() => setMode(mode as 2 | 4)}>
                  {mode} Spieler
                </button>
              ))}
            </div>
            <div className="score-grid">
              <div className="score-box player-x">
                <span>X</span>
                <strong>{score.X}</strong>
              </div>
              <div className="score-box player-o">
                <span>O</span>
                <strong>{score.O}</strong>
              </div>
            </div>
            <div className="button-row">
              <button className="icon-button" type="button" aria-label="Zug zuruecknehmen" title="Zug zuruecknehmen" disabled={state.history.length === 0} onClick={undo}>
                <span aria-hidden="true">↶</span>
              </button>
              <button className="primary-button" type="button" onClick={resetGame}>
                Neue Partie
              </button>
            </div>
          </section>

          <section className="control-block">
            <h2>Spieler</h2>
            <div className="ai-grid">
              {players.map((player) => (
                <div className="ai-row" key={player.id}>
                  <label className={`ai-toggle ${player.symbol.toLowerCase()}`}>
                    <span>{player.label}</span>
                    <input
                      type="checkbox"
                      checked={settings.ai[player.id]}
                      aria-label={`${player.label} KI`}
                      onChange={(event) => {
                        const nextSettings = { ...settings, ai: { ...settings.ai, [player.id]: event.target.checked } };
                        setSettings(nextSettings);
                        save(nextSettings, state, score);
                      }}
                    />
                  </label>
                  <select
                    className="ai-level"
                    aria-label={`${player.label} KI-Stufe`}
                    disabled={!settings.ai[player.id]}
                    value={settings.aiLevel[player.id]}
                    onChange={(event) => {
                      const nextSettings = { ...settings, aiLevel: { ...settings.aiLevel, [player.id]: event.target.value } };
                      setSettings(nextSettings);
                      save(nextSettings, state, score);
                    }}
                  >
                    {Object.entries(QUIXO_AI_LEVELS).map(([value, profile]) => (
                      <option key={value} value={value}>
                        {(profile as { label: string }).label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="control-block">
            <h2>Auswahl</h2>
            <div className="selection-card">{selectionText()}</div>
            {settings.playerCount === 4 && state.selected && !state.winner ? (
              <div className="owner-choice">
                {teamPlayers().map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={`owner-button ${state.nextOwner === player.id ? "active" : ""}`}
                    onClick={() => setState({ ...state, nextOwner: player.id })}
                  >
                    Punkt {player.label}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="control-block moves-block">
            <h2>Zuege</h2>
            <ol className="move-list">
              {state.moves.slice(0, 18).map((move, index) => (
                <li key={`${move}-${index}`}>{move}</li>
              ))}
            </ol>
          </section>
        </aside>
      </main>

      <dialog ref={dialogRef} className="rules-dialog">
        <form method="dialog">
          <div className="dialog-head">
            <h2>Quixo Regeln</h2>
            <button className="icon-button" value="close" aria-label="Schliessen" title="Schliessen">
              ×
            </button>
          </div>
          <p>Waehle am Rand einen neutralen oder eigenen Wuerfel. Er wird immer mit deinem Zeichen nach oben zurueckgelegt.</p>
          <p>Der Wuerfel wird an einem Ende der unvollstaendigen Reihe eingeschoben. Er darf nicht an der Stelle zurueckgelegt werden, an der er entnommen wurde.</p>
          <p>Im Vier-Spieler-Modus spielen X1 und X2 gegen O1 und O2. Ein Teamwuerfel darf nur bewegt werden, wenn sein Punkt dem Spieler am Zug zugeordnet ist.</p>
          <p>Wer eine gegnerische Fuenferreihe schafft, verliert, auch wenn gleichzeitig eine eigene Fuenferreihe entsteht.</p>
        </form>
      </dialog>
    </>
  );
}
