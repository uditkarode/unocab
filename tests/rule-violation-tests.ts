import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { Card, colorSwitchingScs } from "../types.ts";
import { mkts } from "./test-utils.ts";
import { UnocabError } from "../errors.ts";

export default mkts((makeGame, tn) => {
  Deno.test(tn("Cannot do anything apart from choose color after +4"), () => {
    const redOne = { type: "one", color: "red" } satisfies Card;
    const [game, p1] = makeGame([redOne, { type: "plus-four" }]);

    game.play(p1, { type: "plus-four" });
    const validEvents = game.validEvents(p1);
    assertEquals(validEvents.length, 1);
    assertEquals(validEvents[0].type, "choose-color");
  });

  Deno.test(
    tn(
      "Cannot play a card of the same color on +2, must draw or play another +2"
    ),
    () => {
      const redOne: Card = { type: "one", color: "red" };
      const redPlusTwo: Card = { type: "plus-two", color: "red" };
      const [game, p1, p2] = makeGame([
        redOne,
        ...Array(6).fill(redOne),
        redPlusTwo,
        ...Array(7).fill(redOne),
      ]);

      game.play(p1, redOne);
      game.play(p2, redOne);
      game.play(p1, redPlusTwo);
      assertThrows(
        () => game.play(p2, redOne),
        UnocabError,
        "Must draw or play another +2 on a +2"
      );
    }
  );

  Deno.test(tn("Cannot pass without drawing"), () => {
    const [game, p1] = makeGame([{ type: "one", color: "red" }]);
    assertThrows(
      () => game.pass(p1),
      UnocabError,
      "Cannot pass without drawing"
    );
  });

  Deno.test(tn("Cannot draw twice in a row"), () => {
    const [game, p1] = makeGame([{ type: "one", color: "red" }]);
    game.draw(p1);
    assertThrows(
      () => game.draw(p1),
      UnocabError,
      "Cannot draw twice in a row"
    );
  });

  Deno.test(
    tn(
      "Cannot call bluff when the last card is not a +4 or a color has not yet been chosen"
    ),
    () => {
      const [game, p1] = makeGame([{ type: "one", color: "red" }]);
      assertThrows(
        () => game.callBluff(p1),
        UnocabError,
        "You cannot call bluff when the last card is not a +4 or a color has not yet been chosen"
      );
    }
  );

  Deno.test(
    tn(
      `can only switch colors if you played one of [${colorSwitchingScs.options}] in the last turn`
    ),
    () => {
      const [game, p1] = makeGame([{ type: "one", color: "red" }]);
      assertThrows(
        () => game.chooseColor(p1, "red"),
        UnocabError,
        `You can only switch colors if you played one of [${colorSwitchingScs.options}] in the last turn`
      );
    }
  );

  Deno.test(tn("Must either draw or call bluff after +4"), () => {
    const redOne: Card = { type: "one", color: "red" };
    const plusFour: Card = { type: "plus-four" };
    const [game, p1, p2] = makeGame([
      redOne,
      ...Array(6).fill(redOne),
      plusFour,
      ...Array(7).fill(redOne),
    ]);

    game.play(p1, redOne);
    game.play(p2, redOne);
    game.play(p1, plusFour);
    game.chooseColor(p1, "red");

    assertThrows(
      () => game.play(p2, redOne),
      UnocabError,
      "Must either draw or call bluff after +4"
    );
  });
});
