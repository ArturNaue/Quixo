import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { createQuixoAi } from "../src/ai-engine";

const ai = createQuixoAi();
const settings = {
  playerCount: 2,
  ai: { X1: true, O1: false, X2: false, O2: false },
  aiLevel: { X1: "expert", O1: "hard", X2: "hard", O2: "hard" }
};

const emptyCell = () => ({ symbol: "", owner: "" });
const emptyBoard = () => Array.from({ length: 5 }, () => Array.from({ length: 5 }, emptyCell));

describe("Quixo AI", () => {
  it("generates deterministic opening moves", () => {
    const state = { board: emptyBoard(), currentIndex: 0, moves: [] };
    const moves = ai.legalMoves(state, settings);
    assert.equal(moves.length, 44, "empty opening has every border cube with legal insertion sides");

    const first = ai.chooseMove(state, settings, "hard", { seed: 1234 });
    const second = ai.chooseMove(state, settings, "hard", { seed: 1234 });
    assert.deepEqual(
      { row: first.row, col: first.col, side: first.side, owner: first.owner },
      { row: second.row, col: second.col, side: second.side, owner: second.owner },
      "same seed and state produce the same move"
    );
  });

  it("takes an immediate win", () => {
    const board = emptyBoard();
    board[0][0] = { symbol: "X", owner: "X1" };
    board[0][1] = { symbol: "X", owner: "X1" };
    board[0][2] = { symbol: "X", owner: "X1" };
    board[0][3] = { symbol: "X", owner: "X1" };
    board[0][4] = { symbol: "", owner: "" };
    const state = { board, currentIndex: 0, moves: Array.from({ length: 8 }, (_, index) => ({ index })) };
    const move = ai.chooseMove(state, settings, "expert", { seed: 99 });
    const child = ai.applyMove(state, settings, move);
    assert.equal(child.winner, "X", "expert AI takes an immediate five-in-a-row win");
  });

  it("respects four-player point ownership", () => {
    const fourPlayer = { ...settings, playerCount: 4 };
    const board = emptyBoard();
    board[0][0] = { symbol: "X", owner: "X2" };
    const state = { board, currentIndex: 0, moves: Array.from({ length: 8 }, (_, index) => ({ index })) };
    const moves = ai.legalMoves(state, fourPlayer);
    assert.equal(
      moves.some((move) => move.row === 0 && move.col === 0),
      false,
      "four-player mode respects point ownership for selecting team cubes"
    );
  });
});
