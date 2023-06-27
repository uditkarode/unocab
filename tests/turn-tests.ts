import {
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { Card, colorSwitchingScs } from "../types.ts";
import { mkts } from "./test-utils.ts";
import { UnocabError } from "../errors.ts";

export default mkts((makeGame, tn) => {
  Deno.test(tn("Playing a card increases the turn"), () => {
    const redOne = { type: "one", color: "red" } satisfies Card;
    const [game, p1] = makeGame(Array(2).fill(redOne));

    game.play(p1, redOne);

    assertThrows(
      () => game.play(p1, redOne),
      UnocabError,
      "It is not your turn"
    );
  });

  Deno.test(tn("Drawing after +2 forfeits drawing player's turn"), () => {
    const redOne = { type: "one", color: "red" } satisfies Card;
    const [game, p1] = makeGame([{ type: "plus-two", color: "red" }, redOne]);
    game.draw(p1);
    assertThrows(
      () => game.play(p1, redOne),
      UnocabError,
      "It is not your turn"
    );
  });

  Deno.test(tn("Drawing after +4 forfeits drawing player's turn"), () => {
    const redOne = { type: "one", color: "red" } satisfies Card;
    const [game, p1, p2] = makeGame([
      redOne,
      ...Array(7).fill({ type: "plus-four" }),
      redOne,
    ]);
    game.play(p1, { type: "plus-four" });
    game.chooseColor(p1, "yellow");
    game.draw(p2);
    assertThrows(
      () => game.play(p2, redOne),
      UnocabError,
      "It is not your turn"
    );
  });

  Deno.test(tn("Drawing Skip skips the next person's turn"), () => {
    const redOne = { type: "one", color: "red" } satisfies Card;
    const redSkip = { type: "skip", color: "red" } satisfies Card;
    const [game, p1] = makeGame([redOne, redSkip, redOne]);

    game.play(p1, redSkip);
    game.play(p1, redOne);
  });

  Deno.test(tn("Drawing Reverse with 2 players keeps turn"), () => {
    const redOne = { type: "one", color: "red" } satisfies Card;
    const redReverse = { type: "reverse", color: "red" } satisfies Card;
    const [game, p1] = makeGame([redOne, redReverse, redOne]);

    game.play(p1, redReverse);
    game.play(p1, redOne);
  });

  Deno.test(
    tn(
      "Drawing Reverse with more than 2 (here 3) players reverses turn counter"
    ),
    () => {
      const redOne = { type: "one", color: "red" } satisfies Card;
      const redReverse = { type: "reverse", color: "red" } satisfies Card;

      const [game, p1, p2, p3] = makeGame(
        [
          redOne,
          ...Array(7).fill(redOne),
          ...Array(7).fill(redOne),
          ...Array(7).fill(redReverse),
        ],
        3
      );

      game.play(p1, redOne);
      game.play(p2, redOne);
      game.play(p3, redReverse);
      game.play(p2, redOne);
      game.play(p1, redOne);
    }
  );

  Deno.test(
    tn(
      `Turn is increased only after choosing color after playing one of ${colorSwitchingScs.options.join(
        "/"
      )}`
    ),
    () => {
      for (const csCardType of colorSwitchingScs.options) {
        const csCard = { type: csCardType } satisfies Card;
        const [game, p1] = makeGame([{ type: "one", color: "red" }, csCard]);
        game.play(p1, csCard);
        assertEquals(game.activePlayer(), p1);
        game.chooseColor(p1, "red");
        assertNotEquals(game.activePlayer(), p1);
      }
    }
  );
});
