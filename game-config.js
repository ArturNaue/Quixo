export const QUIXO_AI_LEVELS = {
  easy: {
    label: "Leicht",
    maxDepth: 1,
    timeLimitMs: 140,
    randomTopMoves: 5,
    useAlphaBeta: true,
    useIterativeDeepening: false,
    useTranspositionTable: false,
    tacticalDefenseDepth: 1,
    noise: 12,
    quiescenceDepth: 0
  },
  medium: {
    label: "Mittel",
    maxDepth: 2,
    timeLimitMs: 850,
    randomTopMoves: 1,
    useAlphaBeta: true,
    useIterativeDeepening: true,
    useTranspositionTable: false,
    tacticalDefenseDepth: 1,
    noise: 0,
    quiescenceDepth: 1
  },
  hard: {
    label: "Schwer",
    maxDepth: 4,
    timeLimitMs: 1800,
    randomTopMoves: 1,
    useAlphaBeta: true,
    useIterativeDeepening: true,
    useTranspositionTable: true,
    tacticalDefenseDepth: 2,
    noise: 0,
    quiescenceDepth: 1
  },
  expert: {
    label: "Experte",
    maxDepth: 7,
    timeLimitMs: 4700,
    randomTopMoves: 1,
    useAlphaBeta: true,
    useIterativeDeepening: true,
    useTranspositionTable: true,
    tacticalDefenseDepth: 2,
    noise: 0,
    quiescenceDepth: 2
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
    insertion: "opposite-edge-only",
    drawAfterPliesWithoutProgress: 120
  },
  weights: {
    terminalWin: 1_000_000,
    draw: 0,
    ownLine: [0, 8, 48, 190, 1650, 50_000],
    opponentLine: [0, 12, 64, 270, 2550, 70_000],
    fork: 980,
    opponentFork: 1320,
    mobility: 8,
    opponentMobility: 9,
    material: 11,
    center: 18,
    innerRing: 7,
    cornerPenalty: 5,
    block: 34,
    tempo: 8,
    ownedTeamPiece: 4,
    openingEdgeControl: 18,
    endgameThreat: 620,
    tacticalInstability: 420
  }
};
