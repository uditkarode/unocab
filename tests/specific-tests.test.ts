import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { makeGame } from "./test-utils.ts";
import { Card } from "../types.ts";
import { Game } from "../game.ts";
import { ENGINE_ID } from "../utils.ts";

Deno.test("expectedCard() works after 5 draw/pass in shorthand mode", () => {
  const [game, p1, p2] = makeGame(true)([{ type: "one", color: "red" }]);

  game.draw(p1);
  game.pass(p1);
  game.draw(p2);
  game.pass(p2);
  game.draw(p1);
  game.pass(p1);

  const expected = game.expectedCard();
  assertNotEquals(expected, {
    expectedType: undefined,
    expectedColor: undefined,
  });
});

Deno.test(
  "expectedCard() works after calling bluff after some draw/pass",
  () => {
    const plusFour: Card = { type: "plus-four" };
    const yellowZero: Card = { type: "zero", color: "yellow" };
    const [game, p1, p2] = makeGame(true)([
      yellowZero,
      ...Array(7).fill(yellowZero),
      ...Array(6).fill(yellowZero),
      plusFour,
    ]);

    game.draw(p1);
    game.pass(p1);
    game.draw(p2);
    game.play(p2, plusFour);
    game.chooseColor(p2, "blue");
    game.callBluff(p1);

    const expected = game.expectedCard();
    assertNotEquals(expected, {
      expectedType: undefined,
      expectedColor: undefined,
    });
  }
);

Deno.test("eventsOfType returns all events of mentioned type", () => {
  const redOne: Card = { type: "one", color: "red" };
  const [game, p1, p2] = makeGame(false)([redOne, ...Array(14).fill(redOne)]);
  game.play(p1, redOne);
  game.play(p2, redOne);
  game.draw(p1);
  game.pass(p1);
  game.play(p2, redOne);

  const cardPlayEvents = game.eventsOfType("card_played");
  assertEquals(cardPlayEvents, [
    { type: "card_played", by: ENGINE_ID, card: redOne },
    { type: "card_played", by: p1, card: redOne },
    { type: "card_played", by: p2, card: redOne },
    { type: "card_played", by: p2, card: redOne },
  ]);

  const drawEvents = game.eventsOfType("draw");
  assertEquals(drawEvents, [{ type: "draw", by: p1 }]);

  const passEvents = game.eventsOfType("pass");
  assertEquals(passEvents, [{ type: "pass", by: p1 }]);
});

Deno.test("An event is created when a player leaves", () => {
  const [game, p1] = makeGame(false)();
  game.leave(p1);
  assertEquals(game.state.events.at(-1), {
    type: "game_info",
    info: {
      type: "player_left",
      id: p1,
    },
  });
});

Deno.test("Jumping to the latest event gives the same state", () => {
  const game = new Game();
  const oldState = game.state;
  game.jumpToEventIndex(0);
  const newState = game.state;
  assertEquals(oldState, newState);
});

Deno.test("Able to undo a move using jumpToEventIndex", () => {
  const game = new Game({ initialSeed: 4087001194 });
  const p1 = "383f5d8b-ac86-439b-a836-9829adde2d39";

  game.join(p1, crypto.randomUUID());
  game.play(p1, { type: "seven", color: "blue" });

  // jump to the second last index, where the above move does not exist
  game.jumpToEventIndex(-2);

  game.play(p1, { type: "seven", color: "blue" });
});
