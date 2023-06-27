import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { Card } from "../types.ts";
import { mkts } from "./test-utils.ts";

export default mkts((makeGame, tn) => {
  Deno.test(tn("Drawing after +2 draws 2 cards"), () => {
    const redPlusTwo = { type: "plus-two", color: "red" } satisfies Card;
    const [game, p1, p2] = makeGame([
      { type: "one", color: "red" },
      redPlusTwo,
    ]);

    game.play(p1, redPlusTwo);

    const cardsBeforeDraw = game.handOf(p2).length;
    game.draw(p2);
    const cardsAfterDraw = game.handOf(p2).length;

    assertEquals(cardsAfterDraw, cardsBeforeDraw + 2);
  });

  Deno.test(
    tn("+2 stacks only if stackPlusTwos is enabled and resets after draw"),
    () => {
      const redPlusTwo = { type: "plus-two", color: "red" } satisfies Card;
      const redOne = { type: "one", color: "red" } satisfies Card;
      const [game, p1, p2] = makeGame([redOne, ...Array(14).fill(redPlusTwo)]);

      // play 4 +2s in a row
      game.play(p1, redPlusTwo);
      game.play(p2, redPlusTwo);
      game.play(p1, redPlusTwo);
      game.play(p2, redPlusTwo);

      let cardsBeforeDraw = game.handOf(p1).length;
      game.draw(p1);
      let cardsAfterDraw = game.handOf(p1).length;

      // including the +2 played at the beginning, drawn = 4*2 cards
      assertEquals(cardsAfterDraw, cardsBeforeDraw + 8);

      game.play(p2, redPlusTwo);

      cardsBeforeDraw = game.handOf(p1).length;
      game.draw(p1);
      cardsAfterDraw = game.handOf(p1).length;

      // just one +2 after a draw, so only 2 additional cards
      assertEquals(cardsAfterDraw, cardsBeforeDraw + 2);

      // now, with stackPlusTwos disabled
      const [game2, p1_2, p2_2] = makeGame(
        [redOne, ...Array(14).fill(redPlusTwo)],
        2,
        false
      );

      // play 4 +2s in a row
      game2.play(p1_2, redPlusTwo);
      game2.play(p2_2, redPlusTwo);
      game2.play(p1_2, redPlusTwo);
      game2.play(p2_2, redPlusTwo);

      cardsBeforeDraw = game2.handOf(p1_2).length;
      game2.draw(p1_2);
      cardsAfterDraw = game2.handOf(p1_2).length;

      // including the +2 played at the beginning, drawn = 4*2 cards
      assertEquals(cardsAfterDraw, cardsBeforeDraw + 2);
    }
  );

  Deno.test(tn("Drawing after +4 draws 4 cards"), () => {
    const [game, p1, p2] = makeGame([
      { type: "one", color: "red" },
      { type: "plus-four" },
    ]);
    game.play(p1, { type: "plus-four" });
    game.chooseColor(p1, "yellow");
    const cardsBeforeDraw = game.handOf(p2).length;
    game.draw(p2);
    const cardsAfterDraw = game.handOf(p2).length;
    assertEquals(cardsAfterDraw, cardsBeforeDraw + 4);
  });
});
