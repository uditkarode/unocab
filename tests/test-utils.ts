import { Game } from "../game.ts";
import { Card } from "../types.ts";
import { XOR } from "../utils.ts";

export class TestGame<T extends boolean = false> extends Game<T> {
  private customRandomCards: { cards: Card[]; index: 0 } | undefined;

  private customRandomCard() {
    if (!this.customRandomCards) return;
    if (this.customRandomCards.index >= this.customRandomCards.cards.length)
      return;
    return this.customRandomCards.cards[this.customRandomCards.index++];
  }

  constructor(
    props: XOR<
      { serialisedState?: string },
      {
        shorthandMode?: T;
        stackPlusTwos?: boolean;
        initialSeed?: string | number;
        noInit?: boolean;
        customRandomCards?: Card[];
      }
    > = {}
  ) {
    // @ts-expect-error pass it anyway even if we serialise state, no harm in it for tests
    super({ ...props, noInit: true });

    // assign custom random cards (for tests and the like)
    if (props.customRandomCards) {
      this.customRandomCards = { cards: props.customRandomCards, index: 0 };
    }

    super.init(this.customRandomCard());
  }

  protected override deckTopCard() {
    const crCard = this.customRandomCard();
    const deckTopCard = super.deckTopCard();
    return crCard ?? deckTopCard;
  }

  override jumpToEventIndex(index: number) {
    if (this.customRandomCards) {
      console.log(
        "! warning ! using jumpToEventIndex with custom random cards"
      );
    }

    return super.jumpToEventIndex(index);
  }
}

/**
 * the make game function.
 * the first card is the pile top card, and every 7 cards after that are the decks.
 * @param shorthandMode whether to use shorthand mode for the game
 * @returns a function that takes custom random cards and creates a game
 */
export const makeGame =
  (shorthandMode: boolean) =>
  (
    customRandomCards: Card[] = [],
    playerCount = 2,
    stackPlusTwos = true
  ): [TestGame<boolean>, ...string[]] => {
    const players = Array(playerCount)
      .fill(null)
      .map(() => crypto.randomUUID());

    const game = new TestGame({
      customRandomCards,
      shorthandMode,
      stackPlusTwos,
    });
    game.join(...players);
    return [game, ...players];
  };

export type MakeGame = ReturnType<typeof makeGame>;

// the make test suite function
type testNameFn = (name: string) => string;
export function mkts(
  fn: (
    makeGame: MakeGame,
    /** transforms the test name to include additional information about the test */
    tn: testNameFn
  ) => void
) {
  return function (makeGame: MakeGame, suffix: string) {
    fn(makeGame, (og) => `${og} (${suffix})`);
  };
}
