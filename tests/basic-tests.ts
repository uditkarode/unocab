import { Game } from "../game.ts";
import { Card, CardPlayedEvent, colorSwitchingScs } from "../types.ts";
import {
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { mkts } from "./test-utils.ts";
import { UnocabError } from "../errors.ts";
import { ENGINE_ID } from "../utils.ts";

export default mkts((makeGame, tn) => {
  Deno.test(tn("Cards are removed from deck when played"), () => {
    const redOne = { type: "one", color: "red" } satisfies Card;
    const [game, p1] = makeGame([redOne, redOne]);

    const getRedOnes = () =>
      game
        .handOf(p1)
        .filter((card) => card.type == "one" && card.color == "red").length;

    const oldRedOnes = getRedOnes();
    game.play(p1, redOne);
    const newRedOnes = getRedOnes();

    assertEquals(oldRedOnes - 1, newRedOnes);
  });

  Deno.test(
    tn("Cannot play cards of a different color and different type"),
    () => {
      const [game, p1] = makeGame([
        { type: "one", color: "red" },
        { type: "two", color: "blue" },
      ]);
      assertThrows(
        () => game.play(p1, { type: "two", color: "blue" }),
        UnocabError,
        "Must play card of type one or color red, found two of color blue"
      );
    }
  );

  Deno.test(tn("Can play cards of same color but different type"), () => {
    const [game, p1] = makeGame([
      { type: "one", color: "red" },
      { type: "two", color: "red" },
    ]);
    game.play(p1, { type: "two", color: "red" });
  });

  Deno.test(tn("Can play cards of same type but different color"), () => {
    const [game, p1] = makeGame([
      { type: "one", color: "red" },
      { type: "one", color: "blue" },
    ]);
    game.play(p1, { type: "one", color: "blue" });
  });

  Deno.test(tn("Player not in the match cannot perform any actions"), () => {
    const [game] = makeGame();
    const fakeId = "hey, I am a fake uuid! I'm not even in the right format.";

    const checkThrows = (fn: () => void) =>
      assertThrows(fn, UnocabError, `This player is not in the game`);

    checkThrows(() => game.play(fakeId, { type: "plus-four" }));
    checkThrows(() => game.chooseColor(fakeId, "red"));
    checkThrows(() => game.callBluff(fakeId));
    checkThrows(() => game.draw(fakeId));
    checkThrows(() => game.pass(fakeId));
    checkThrows(() => game.leave(fakeId));
  });

  Deno.test(
    tn(
      "Bluff call fails if the +4 player does not have a card of the current color"
    ),
    () => {
      const blueTwo = { type: "two", color: "blue" } satisfies Card;
      const [game, p1, p2] = makeGame([
        { type: "one", color: "red" },
        ...Array(6).fill(blueTwo),
        { type: "plus-four" },
      ]);

      game.play(p1, { type: "plus-four" });
      game.chooseColor(p1, "blue");
      const cardsBeforeBluffCall = game.handOf(p2).length;
      game.callBluff(p2);
      const cardsAfterBluffCall = game.handOf(p2).length;
      assertEquals(cardsAfterBluffCall, cardsBeforeBluffCall + 6);

      const state = game.state;
      if (!state.shorthandMode) {
        const lastEvent = state.events.at(-1)!;
        if (
          lastEvent.type != "game_info" ||
          lastEvent.info.type != "bluff_call_failed" ||
          lastEvent.info.by != p2 ||
          lastEvent.info.of != p1
        ) {
          throw new Error("Invalid game_info entry");
        }
      }
    }
  );

  Deno.test(
    tn("Bluff call succeeds if the +4 player has a card of the current color"),
    () => {
      const redOne = { type: "one", color: "red" } satisfies Card;
      const [game, p1, p2] = makeGame([redOne, redOne, { type: "plus-four" }]);

      game.play(p1, { type: "plus-four" });
      game.chooseColor(p1, "blue");
      const cardsBeforeBluffCall = game.handOf(p1).length;
      game.callBluff(p2);
      const cardsAfterBluffCall = game.handOf(p1).length;
      assertEquals(cardsAfterBluffCall, cardsBeforeBluffCall + 4);

      if (!game.state.shorthandMode) {
        const lastEvent = game.state.events.at(-1)!;
        if (
          lastEvent.type != "game_info" ||
          lastEvent.info.type != "bluff_call_succeeded" ||
          lastEvent.info.by != p2 ||
          lastEvent.info.of != p1
        ) {
          throw new Error("Invalid game_info entry");
        }
      }
    }
  );

  Deno.test(
    tn(
      "Expected card is undefined (meaning any card) after playing a color switching card"
    ),
    () => {
      for (const cardType of colorSwitchingScs.options) {
        const csCard = { type: cardType } satisfies Card;
        const redOne = { type: "one", color: "red" } satisfies Card;

        const [game, p1, p2] = makeGame([
          redOne,
          ...Array(6).fill(redOne),
          csCard,
          redOne,
        ]);

        game.play(p1, redOne);
        game.play(p2, redOne);
        game.play(p1, csCard);
        game.chooseColor(p1, "red");

        const expected = game.expectedCard();
        assertEquals(expected.expectedType, undefined);
      }
    }
  );

  Deno.test(tn("Color picker changes color"), () => {
    const colorPicker = { type: "color-chooser" } satisfies Card;
    const [game, p1] = makeGame([{ type: "one", color: "red" }, colorPicker]);
    game.play(p1, colorPicker);
    game.chooseColor(p1, "yellow");
    assertEquals(game.expectedCard().expectedColor, "yellow");
  });

  Deno.test(
    tn("Expected card after +2 and a draw is of +2 or the previous +2's color"),
    () => {
      const redPlusTwo = { type: "plus-two", color: "red" } satisfies Card;
      const [game, p1, p2] = makeGame([
        { type: "one", color: "red" },
        redPlusTwo,
      ]);

      game.play(p1, redPlusTwo);
      game.draw(p2);

      assertEquals(game.expectedCard(), {
        expectedType: "plus-two",
        expectedColor: "red",
      });
    }
  );

  Deno.test(
    tn(
      "Can play +2 of another color after playing a +2 and having the other player draw"
    ),
    () => {
      const redPlusTwo = { type: "plus-two", color: "red" } satisfies Card;
      const bluePlusTwo = { type: "plus-two", color: "blue" } satisfies Card;
      const redOne = { type: "one", color: "red" } satisfies Card;

      const [game, p1, p2] = makeGame([redOne, redPlusTwo, bluePlusTwo]);

      game.play(p1, redPlusTwo);
      game.draw(p2);

      assertEquals(game.expectedCard(), {
        expectedType: "plus-two",
        expectedColor: "red",
      });

      game.play(p1, bluePlusTwo);
    }
  );

  Deno.test(tn("Cannot play a color switching card as the last card"), () => {
    colorSwitchingScs.options.forEach((csCardType) => {
      const redOne = { type: "one", color: "red" } satisfies Card;
      const csCard = { type: csCardType } satisfies Card;
      const [game, p1, p2] = makeGame([
        redOne,
        ...Array(6).fill(redOne),
        csCard,
        ...Array(7).fill(redOne),
      ]);

      Array(6)
        .fill(null)
        .forEach(() => {
          game.play(p1, redOne);
          game.play(p2, redOne);
        });

      assertThrows(
        () => game.play(p1, csCard),
        UnocabError,
        `Cannot play one of ${colorSwitchingScs.options} as the last card`
      );
    });
  });

  Deno.test(tn("At most 10 players can join a game"), () => {
    const [game] = makeGame([], 10);
    assertThrows(
      () => game.join(ENGINE_ID),
      UnocabError,
      "At most 10 players can join a game"
    );
  });

  Deno.test(
    tn("Game ends when only one player is left with cards and reports loser"),
    () => {
      const redOne: Card = { type: "one", color: "red" };
      const [game, p1, p2] = makeGame(Array(15).fill(redOne));

      Array(6)
        .fill(null)
        .forEach(() => {
          game.play(p1, redOne);
          game.play(p2, redOne);
        });

      game.play(p1, redOne);

      assertThrows(
        () => game.play(p2, redOne),
        UnocabError,
        "This game has ended"
      );

      assertEquals(game.hasEnded(), { loser: p2 });
    }
  );

  Deno.test(
    tn("Chosen card is always random without customRandomCards"),
    () => {
      let cpe1: CardPlayedEvent;
      let cpe2: CardPlayedEvent;

      // random cards might sometimes end up being the same.
      // retry 3 times just in case this happens.
      const retryAttempts = 3;
      for (let attempt = 0; attempt < retryAttempts; attempt++) {
        const game = new Game();
        const game2 = new Game();

        cpe1 = game.eventsOfType("card_played")[0];
        cpe2 = game2.eventsOfType("card_played")[0];

        const cardsAreSame =
          cpe1.card.type == cpe2.card.type &&
          cpe1.card.color == cpe2.card.color;

        if (!cardsAreSame) break;
      }

      assertNotEquals(cpe1!, cpe2!);
    }
  );

  Deno.test(tn("Cannot play cards you don't have"), () => {
    const redOne: Card = { type: "one", color: "red" };
    const blueOne: Card = { type: "one", color: "blue" };

    const [game, p1] = makeGame(Array(8).fill(redOne));
    assertThrows(
      () => game.play(p1, blueOne),
      UnocabError,
      "You do not have this card"
    );
  });

  Deno.test(
    tn(
      "Able to serialise, deserialise, and continue a game without impacting state"
    ),
    () => {
      const redOne: Card = { type: "one", color: "red" };
      const [originalGame, p1, p2] = makeGame(Array(15).fill(redOne));

      originalGame.play(p1, redOne);
      originalGame.play(p2, redOne);

      const serialisedState = originalGame.serialise();
      const deserialisedGame = new Game<true>({ serialisedState });

      originalGame.play(p1, redOne);
      originalGame.play(p2, redOne);

      deserialisedGame.play(p1, redOne);
      deserialisedGame.play(p2, redOne);

      assertEquals(originalGame.state, deserialisedGame.state);
    }
  );

  Deno.test(tn("Playing pile is shuffled and turned into deck"), () => {
    const redOne: Card = { type: "one", color: "red" };
    const blueOne: Card = { type: "one", color: "blue" };

    const [game, p1] = makeGame(Array(8).fill(redOne));
    assertThrows(
      () => game.play(p1, blueOne),
      UnocabError,
      "You do not have this card"
    );
  });

  Deno.test(
    tn("Games with the same initial seed create the same initial state"),
    () => {
      const game1 = new Game({ initialSeed: 4087001209 });
      const game2 = new Game({ initialSeed: 4087001209 });

      const game3 = new Game({ initialSeed: "cats" });
      const game4 = new Game({ initialSeed: "cats" });

      assertEquals(game1.state, game2.state);
      assertEquals(game3.state, game4.state);
    }
  );

  Deno.test(
    tn("Games with different initial seed create different initial state"),
    () => {
      const game1 = new Game({ initialSeed: 4087001209 });
      const game2 = new Game({ initialSeed: 9326378342 });

      const game3 = new Game({ initialSeed: "cats" });
      const game4 = new Game({ initialSeed: "dogs" });

      assertNotEquals(game1.state, game2.state);
      assertNotEquals(game3.state, game4.state);
    }
  );

  Deno.test(tn("State is not modifiable"), () => {
    const [game] = makeGame();
    game.state.index = -100;
    assertNotEquals(game.state.index, -100);
  });

  Deno.test(
    tn("Unable to perform any actions with less than 2 players"),
    () => {
      const redOne = { type: "one", color: "red" } satisfies Card;
      const [game, p1, p2] = makeGame(Array(22).fill(redOne));
      game.leave(p1, p2);

      const checkThrows = (fn: () => void) =>
        assertThrows(
          fn,
          UnocabError,
          "An active game must have at least two players"
        );

      checkThrows(() => game.play(p1, redOne));
      game.join(p1);
      checkThrows(() => game.play(p1, redOne));
      game.join(p2);
      game.play(p1, redOne);
    }
  );

  type Assert<T, _U extends T> = never;

  Deno.test(
    tn("Type of state changes accordingly with shorthand mode argument"),
    () => {
      const game1 = new Game();
      type falseWhenNotGiven = Assert<
        false,
        (typeof game1)["state"]["shorthandMode"]
      >;

      const game2 = new Game<boolean>();
      type bothWhenSetToBoolean = Assert<
        boolean,
        (typeof game2)["state"]["shorthandMode"]
      >;

      const game3 = new Game({ shorthandMode: true });
      type trueWhenSetToTrue = Assert<
        true,
        (typeof game3)["state"]["shorthandMode"]
      >;

      const game4 = new Game({ shorthandMode: false });
      type falseWhenSetToFalse = Assert<
        false,
        (typeof game4)["state"]["shorthandMode"]
      >;
    }
  );

  Deno.test("getPile() returns the pile", () => {
    const redOne: Card = { type: "one", color: "red" };
    const [game, p1, p2] = makeGame([redOne, ...Array(14).fill(redOne)]);
    game.play(p1, redOne);
    game.play(p2, redOne);
    game.draw(p1);
    game.pass(p1);
    game.play(p2, redOne);
    game.play(p1, redOne);

    const pile = game.getPile();
    assertEquals(pile, [redOne, redOne, redOne, redOne, redOne]);
  });

  Deno.test("Playing pile is shuffled into deck when it ends", () => {
    const redOne: Card = { type: "one", color: "red" };
    const [game, p1, p2] = makeGame([redOne, ...Array(14).fill(redOne)]);
    game.play(p1, redOne);
    game.play(p2, redOne);
    game.draw(p1);
    game.pass(p1);
    game.play(p2, redOne);
    game.play(p1, redOne);

    Array(46)
      .fill(null)
      .forEach(() => {
        [p2, p1].forEach((p) => {
          game.draw(p);
          game.pass(p);
        });
      });

    game.draw(p2);
    game.pass(p2);

    // the deck is now empty
    assertEquals(game.state.cache.deck.length, 0);

    const pile = game.getPile();
    const pileCards = pile.length;
    assertEquals(pileCards, 5);
    assertEquals(pile, [redOne, redOne, redOne, redOne, redOne]);

    const result = game.draw(p1);
    assertEquals(result?.formatted, "Drawing 1 card(s)");
    assertEquals(game.state.cache.deck.length, 4);
  });
});
