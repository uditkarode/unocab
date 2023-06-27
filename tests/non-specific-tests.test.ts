// the first custom random card is going to be the first card of the game
// the next 7 cards are the cards of the first player

import basicTests from "./basic-tests.ts";
import drawTests from "./draw-tests.ts";
import ruleViolationTests from "./rule-violation-tests.ts";
import { makeGame } from "./test-utils.ts";
import turnTests from "./turn-tests.ts";

const test = {
  // ─── Just add suites created using `mkts` here ────────────────────────────
  fns: [basicTests, drawTests, ruleViolationTests, turnTests],

  types: [
    ["full", makeGame(false)],
    ["shorthand", makeGame(true)],
  ],
} as const;

for (const [suffix, makeGame] of test.types) {
  for (const testFn of test.fns) {
    testFn(makeGame, suffix);
  }
}
