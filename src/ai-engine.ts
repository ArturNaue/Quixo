export const QUIXO_AI_LEVELS = {
  easy: {
    label: "Leicht",
    maxDepth: 1,
    timeLimitMs: 140,
    randomTopMoves: 5,
    useAlphaBeta: false,
    useIterativeDeepening: false,
    useTranspositionTable: false,
    tacticalDefenseDepth: 1,
    noise: 12
  },
  medium: {
    label: "Mittel",
    maxDepth: 2,
    timeLimitMs: 850,
    randomTopMoves: 1,
    useAlphaBeta: true,
    useIterativeDeepening: false,
    useTranspositionTable: false,
    tacticalDefenseDepth: 1,
    noise: 0
  },
  hard: {
    label: "Schwer",
    maxDepth: 3,
    timeLimitMs: 1800,
    randomTopMoves: 1,
    useAlphaBeta: true,
    useIterativeDeepening: true,
    useTranspositionTable: true,
    tacticalDefenseDepth: 2,
    noise: 0
  },
  expert: {
    label: "Experte",
    maxDepth: 6,
    timeLimitMs: 4600,
    randomTopMoves: 1,
    useAlphaBeta: true,
    useIterativeDeepening: true,
    useTranspositionTable: true,
    tacticalDefenseDepth: 2,
    noise: 0
  }
};

export const QUIXO_CONFIG = {
  id: "quixo",
  board: {
    rows: 5,
    cols: 5,
    topology: "square-grid",
    selectable: "border"
  },
  pieces: {
    empty: { symbol: "", owner: "" },
    symbols: ["X", "O"]
  },
  phases: {
    openingPlies: 8,
    endgameThreatCount: 3
  },
  variants: {
    twoPlayer: {
      playerCount: 2,
      players: [
        { id: "X1", symbol: "X", label: "X" },
        { id: "O1", symbol: "O", label: "O" }
      ]
    },
    fourPlayerTeams: {
      playerCount: 4,
      players: [
        { id: "X1", symbol: "X", label: "X1" },
        { id: "O1", symbol: "O", label: "O1" },
        { id: "X2", symbol: "X", label: "X2" },
        { id: "O2", symbol: "O", label: "O2" }
      ]
    }
  },
  rules: {
    firstRoundNeutralOnly: true,
    movablePieces: "empty-or-own-symbol",
    fourPlayerOwnerLock: true,
    opponentLineCreatedLoses: true,
    insertion: "opposite-edge-only"
  },
  weights: {
    terminalWin: 1_000_000,
    ownLine: [0, 8, 42, 170, 1450, 50_000],
    opponentLine: [0, 10, 56, 235, 2300, 70_000],
    fork: 820,
    opponentFork: 1120,
    mobility: 7,
    opponentMobility: 8,
    material: 10,
    center: 16,
    innerRing: 7,
    cornerPenalty: 4,
    block: 30,
    tempo: 5,
    ownedTeamPiece: 4,
    endgameThreat: 520
  }
};

const DIRECTIONS = ["N", "S", "W", "E"];
const INF = 1_000_000_000;

export function createQuixoAi(config = QUIXO_CONFIG) {
  const lines = buildLines(config.board.rows, config.board.cols);
  const allCells = buildCells(config.board.rows, config.board.cols);
  const borderCells = allCells.filter(([row, col]) => isBorder(config, row, col));
  const positionWeights = buildPositionWeights(config);

  function playersFor(settings) {
    if (settings.playerCount === 4) return config.variants.fourPlayerTeams.players;
    return config.variants.twoPlayer.players;
  }

  function opponentSymbol(symbol) {
    return config.pieces.symbols.find((candidate) => candidate !== symbol) || "";
  }

  function normalizeState(state) {
    return {
      board: cloneBoard(state.board),
      currentIndex: state.currentIndex || 0,
      moves: Array.isArray(state.moves) ? [...state.moves] : []
    };
  }

  function legalMoves(state, settings, player = playersFor(settings)[state.currentIndex]) {
    const moves = [];
    const players = playersFor(settings);
    const firstRound = config.rules.firstRoundNeutralOnly && state.moves.length < players.length;
    const owners = players.filter((candidate) => candidate.symbol === player.symbol).map((candidate) => candidate.id);

    for (const [row, col] of borderCells) {
      const cell = state.board[row][col];
      const isOwn = cell.symbol === player.symbol;
      const legalCell = firstRound
        ? !cell.symbol
        : !cell.symbol || (isOwn && (settings.playerCount === 2 || cell.owner === player.id));
      if (!legalCell) continue;

      for (const side of legalPushSides(config, row, col)) {
        for (const owner of owners) moves.push({ row, col, side, owner });
      }
    }

    return moves;
  }

  function applyMove(state, settings, move) {
    const players = playersFor(settings);
    const player = players[state.currentIndex] || players[0];
    const legalOwner = players.some((candidate) => candidate.id === move.owner && candidate.symbol === player.symbol)
      ? move.owner
      : player.id;
    const board = applyPush(config, state.board, move.row, move.col, move.side, player.symbol, legalOwner);
    const result = evaluateWinner(board, player.symbol);
    const nextState = {
      board,
      currentIndex: state.currentIndex,
      moves: [move, ...state.moves],
      winner: result?.winner || null,
      loser: result?.loser || null,
      winningLine: result?.line || []
    };

    if (!result) {
      nextState.currentIndex = nextPlayableIndex(nextState, settings, state.currentIndex);
    }

    return nextState;
  }

  function evaluateWinner(board, moverSymbol) {
    const opponent = opponentSymbol(moverSymbol);
    const opponentLine = lines.find((line) => line.every(([row, col]) => board[row][col].symbol === opponent));
    if (opponentLine) return { winner: opponent, loser: moverSymbol, line: keyLine(opponentLine) };
    const ownLine = lines.find((line) => line.every(([row, col]) => board[row][col].symbol === moverSymbol));
    if (ownLine) return { winner: moverSymbol, loser: opponent, line: keyLine(ownLine) };
    return null;
  }

  function nextPlayableIndex(state, settings, startIndex) {
    const players = playersFor(settings);
    for (let step = 1; step <= players.length; step += 1) {
      const index = (startIndex + step) % players.length;
      if (legalMoves({ ...state, currentIndex: index }, settings, players[index]).length) return index;
    }
    return (startIndex + 1) % players.length;
  }

  function chooseMove(rawState, settings, difficulty = "expert", options: Record<string, any> = {}) {
    const profile = QUIXO_AI_LEVELS[difficulty] || QUIXO_AI_LEVELS.expert;
    const state = normalizeState(rawState);
    const players = playersFor(settings);
    const rootPlayer = players[state.currentIndex] || players[0];
    const rootSymbol = rootPlayer.symbol;
    const rootMoves = legalMoves(state, settings, rootPlayer);
    if (!rootMoves.length) return null;

    const startedAt = now();
    const deadline = startedAt + profile.timeLimitMs;
    const seed = options.seed ?? hashState(state, settings);
    const random = mulberry32(seed);
    const table = profile.useTranspositionTable ? new Map() : null;
    const context = { settings, profile, rootSymbol, deadline, table, random, nodes: 0, timedOut: false };
    const immediate = bestImmediateMove(state, settings, rootMoves, rootSymbol, rootPlayer);
    if (immediate) return { ...immediate, meta: { difficulty, depth: 1, nodes: 1, score: INF / 2, timedOut: false } };

    const defensive = urgentDefense(state, settings, rootMoves, rootSymbol, profile.tacticalDefenseDepth);
    if (defensive) return { ...defensive, meta: { difficulty, depth: 1, nodes: rootMoves.length, score: INF / 3, timedOut: false } };

    if (difficulty === "easy") {
      return chooseEasyMove(state, settings, rootMoves, rootSymbol, profile, random);
    }

    let best = null;
    const maxDepth = Math.max(1, profile.maxDepth);
    const depths = profile.useIterativeDeepening
      ? Array.from({ length: maxDepth }, (_, index) => index + 1)
      : [maxDepth];

    for (const depth of depths) {
      const ordered = orderMoves(state, settings, rootMoves, rootSymbol, rootPlayer, context);
      let iterationBest = null;
      let alpha = -INF;

      for (const entry of ordered) {
        if (now() >= deadline) {
          context.timedOut = true;
          break;
        }
        const child = applyMove(state, settings, entry.move);
        const score = search(child, depth - 1, alpha, INF, context);
        if (context.timedOut) break;
        if (!iterationBest || score > iterationBest.score) iterationBest = { move: entry.move, score };
        if (profile.useAlphaBeta) alpha = Math.max(alpha, score);
      }

      if (iterationBest) best = { ...iterationBest, depth };
      if (context.timedOut) break;
    }

    const fallback = best || orderMoves(state, settings, rootMoves, rootSymbol, rootPlayer, context)[0];
    return {
      ...fallback.move,
      meta: {
        difficulty,
        depth: fallback.depth || 1,
        nodes: context.nodes,
        score: Math.round(fallback.score || 0),
        timedOut: context.timedOut
      }
    };
  }

  function chooseEasyMove(state, settings, moves, rootSymbol, profile, random) {
    const player = playersFor(settings)[state.currentIndex];
    const ordered = orderMoves(state, settings, moves, rootSymbol, player, { profile, random, nodes: 0 });
    const poolSize = Math.min(profile.randomTopMoves, ordered.length);
    const index = Math.floor(random() * poolSize);
    return {
      ...ordered[index].move,
      meta: {
        difficulty: "easy",
        depth: 1,
        nodes: ordered.length,
        score: Math.round(ordered[index].score),
        timedOut: false
      }
    };
  }

  function search(state, depth, alpha, beta, context) {
    context.nodes += 1;
    if (context.nodes % 512 === 0 && now() >= context.deadline) {
      context.timedOut = true;
      return evaluate(state, context.settings, context.rootSymbol);
    }

    if (state.winner || depth <= 0) return evaluate(state, context.settings, context.rootSymbol);

    const key = context.table ? `${hashState(state, context.settings)}:${depth}:${state.currentIndex}` : "";
    const cached = key && context.table.get(key);
    if (cached && cached.depth >= depth) return cached.score;

    const players = playersFor(context.settings);
    const player = players[state.currentIndex];
    const moves = legalMoves(state, context.settings, player);
    if (!moves.length) return evaluate(state, context.settings, context.rootSymbol);

    const maximizing = player.symbol === context.rootSymbol;
    let best = maximizing ? -INF : INF;
    const ordered = orderMoves(state, context.settings, moves, context.rootSymbol, player, context);

    for (const entry of ordered) {
      const child = applyMove(state, context.settings, entry.move);
      const score = search(child, depth - 1, alpha, beta, context);
      if (context.timedOut) break;

      if (maximizing) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, score);
        beta = Math.min(beta, best);
      }
      if (context.profile.useAlphaBeta && alpha >= beta) break;
    }

    if (key && !context.timedOut) context.table.set(key, { depth, score: best });
    return best;
  }

  function evaluate(state, settings, rootSymbol) {
    if (state.winner) {
      const sign = state.winner === rootSymbol ? 1 : -1;
      return sign * (config.weights.terminalWin - state.moves.length);
    }

    const opponent = opponentSymbol(rootSymbol);
    const weights = config.weights;
    let score = weights.tempo * (playersFor(settings)[state.currentIndex].symbol === rootSymbol ? 1 : -1);
    let ownOpenFours = 0;
    let opponentOpenFours = 0;
    let ownOpenThrees = 0;
    let opponentOpenThrees = 0;

    for (const line of lines) {
      const values = line.map(([row, col]) => state.board[row][col].symbol);
      const own = values.filter((value) => value === rootSymbol).length;
      const opp = values.filter((value) => value === opponent).length;
      const empty = values.length - own - opp;

      if (opp === 0) {
        score += weights.ownLine[own] + empty * weights.block;
        if (own === 4 && empty === 1) ownOpenFours += 1;
        if (own === 3 && empty === 2) ownOpenThrees += 1;
      }
      if (own === 0) {
        score -= weights.opponentLine[opp] + empty * weights.block;
        if (opp === 4 && empty === 1) opponentOpenFours += 1;
        if (opp === 3 && empty === 2) opponentOpenThrees += 1;
      }
    }

    score += ownOpenFours * weights.endgameThreat - opponentOpenFours * weights.endgameThreat * 1.4;
    score += Math.max(0, ownOpenFours - 1) * weights.fork;
    score -= Math.max(0, opponentOpenFours - 1) * weights.opponentFork;
    score += Math.max(0, ownOpenThrees - 1) * weights.fork * 0.35;
    score -= Math.max(0, opponentOpenThrees - 1) * weights.opponentFork * 0.45;

    for (const [row, col] of allCells) {
      const cell = state.board[row][col];
      if (!cell.symbol) continue;
      const sign = cell.symbol === rootSymbol ? 1 : -1;
      score += sign * weights.material;
      score += sign * positionWeights[row][col];
      if (settings.playerCount === 4 && cell.owner) score += sign * weights.ownedTeamPiece;
    }

    const rootMobility = teamMobility(state, settings, rootSymbol);
    const opponentMobility = teamMobility(state, settings, opponent);
    score += rootMobility * weights.mobility - opponentMobility * weights.opponentMobility;

    return score;
  }

  function teamMobility(state, settings, symbol) {
    const players = playersFor(settings);
    return players
      .filter((player) => player.symbol === symbol)
      .reduce((total, player) => total + legalMoves({ ...state, currentIndex: players.indexOf(player) }, settings, player).length, 0);
  }

  function bestImmediateMove(state, settings, moves, rootSymbol, player) {
    for (const move of orderMoves(state, settings, moves, rootSymbol, player, { profile: QUIXO_AI_LEVELS.medium, nodes: 0 })) {
      const child = applyMove(state, settings, move.move);
      if (child.winner === rootSymbol) return move.move;
    }
    return null;
  }

  function urgentDefense(state, settings, moves, rootSymbol, depth) {
    if (depth <= 0) return null;
    const safeMoves = moves.filter((move) => {
      const child = applyMove(state, settings, move);
      if (child.winner) return child.winner === rootSymbol;
      return !hasImmediateWin(child, settings, opponentSymbol(rootSymbol));
    });
    if (safeMoves.length === moves.length || !safeMoves.length) return null;
    const player = playersFor(settings)[state.currentIndex];
    return orderMoves(state, settings, safeMoves, rootSymbol, player, { profile: QUIXO_AI_LEVELS.medium, nodes: 0 })[0].move;
  }

  function hasImmediateWin(state, settings, symbol) {
    const players = playersFor(settings);
    const player = players[state.currentIndex];
    if (player.symbol !== symbol) return false;
    return legalMoves(state, settings, player).some((move) => applyMove(state, settings, move).winner === symbol);
  }

  function orderMoves(state, settings, moves, rootSymbol, player, context) {
    return moves
      .map((move) => {
        const child = applyMove(state, settings, move);
        let score = evaluate(child, settings, rootSymbol);
        if (child.winner === player.symbol) score += 900_000;
        if (child.winner && child.winner !== player.symbol) score -= 900_000;
        if (move.row === 0 || move.row === config.board.rows - 1) score += 3;
        if (move.col === 0 || move.col === config.board.cols - 1) score += 3;
        score += (context.profile?.noise || 0) * (context.random ? context.random() - 0.5 : 0);
        return { move, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  return {
    config,
    levels: QUIXO_AI_LEVELS,
    playersFor,
    legalMoves,
    applyMove,
    evaluate,
    evaluateWinner,
    chooseMove
  };
}

function isBorder(config, row, col) {
  return row === 0 || row === config.board.rows - 1 || col === 0 || col === config.board.cols - 1;
}

function extractionSides(config, row, col) {
  const sides = [];
  if (row === 0) sides.push("N");
  if (row === config.board.rows - 1) sides.push("S");
  if (col === 0) sides.push("W");
  if (col === config.board.cols - 1) sides.push("E");
  return sides;
}

function legalPushSides(config, row, col) {
  const blocked = new Set(extractionSides(config, row, col));
  return DIRECTIONS.filter((side) => !blocked.has(side));
}

function applyPush(config, board, row, col, side, symbol, owner) {
  const next = cloneBoard(board);
  next[row][col] = null;
  const placed = { symbol, owner };

  if (side === "N") {
    for (let r = row; r > 0; r -= 1) next[r][col] = next[r - 1][col];
    next[0][col] = placed;
  }
  if (side === "S") {
    for (let r = row; r < config.board.rows - 1; r += 1) next[r][col] = next[r + 1][col];
    next[config.board.rows - 1][col] = placed;
  }
  if (side === "W") {
    for (let c = col; c > 0; c -= 1) next[row][c] = next[row][c - 1];
    next[row][0] = placed;
  }
  if (side === "E") {
    for (let c = col; c < config.board.cols - 1; c += 1) next[row][c] = next[row][c + 1];
    next[row][config.board.cols - 1] = placed;
  }

  return next.map((line) => line.map((cell) => cell || { symbol: "", owner: "" }));
}

function buildLines(rows, cols) {
  const lines = [];
  for (let row = 0; row < rows; row += 1) lines.push(Array.from({ length: cols }, (_, col) => [row, col]));
  for (let col = 0; col < cols; col += 1) lines.push(Array.from({ length: rows }, (_, row) => [row, col]));
  lines.push(Array.from({ length: rows }, (_, index) => [index, index]));
  lines.push(Array.from({ length: rows }, (_, index) => [index, cols - 1 - index]));
  return lines;
}

function buildCells(rows, cols) {
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) cells.push([row, col]);
  }
  return cells;
}

function buildPositionWeights(config) {
  const centerRow = (config.board.rows - 1) / 2;
  const centerCol = (config.board.cols - 1) / 2;
  return Array.from({ length: config.board.rows }, (_, row) =>
    Array.from({ length: config.board.cols }, (_, col) => {
      const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
      const corner = (row === 0 || row === config.board.rows - 1) && (col === 0 || col === config.board.cols - 1);
      return Math.round((config.weights.center - distance * config.weights.innerRing) - (corner ? config.weights.cornerPenalty : 0));
    })
  );
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ symbol: cell.symbol || "", owner: cell.owner || "" })));
}

function keyLine(line) {
  return line.map(([row, col]) => `${row}-${col}`);
}

function hashState(state, settings) {
  let hash = 2166136261;
  const add = (value) => {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  add(settings.playerCount);
  add(state.currentIndex);
  for (const row of state.board) {
    for (const cell of row) add(`${cell.symbol}${cell.owner}|`);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function now() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}
