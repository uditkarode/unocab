import { UECode, UnocabError } from "./errors.ts";
import {
  Card,
  CardColor,
  CardPlayedEvent,
  FullGameState,
  GameEvent,
  GameState,
  InfoEvent,
  PlayerId,
  ProcessEventResult,
  ShorthandGameState,
  colorSwitchingScs,
  gameState,
  playerId,
} from "./types.ts";
import {
  DECK,
  ENGINE_ID,
  MAX_PLAYERS,
  MAX_SHORTHAND_EVENTS,
  MIN_PLAYERS,
  XOR,
  cyrb128,
  exhaustive,
  includes,
} from "./utils.ts";

export class Game<Shorthand extends boolean = false> {
  // FullGameState if Shorthand is false.
  // ShorthandGameState if Shorthand is true.
  // GameState (FullGameState | ShorthandGameState) if Shorthand is boolean.
  protected _state: boolean extends Shorthand
    ? GameState
    : true extends Shorthand
    ? ShorthandGameState
    : FullGameState;

  get state() {
    return structuredClone(this._state) as typeof this._state;
  }

  constructor(
    // if a serialised state is provided, none of the
    // customisation props are used, so don't allow
    // passing them together with the serialised state.
    props: XOR<
      { serialisedState?: string },
      {
        shorthandMode?: Shorthand;
        stackPlusTwos?: boolean;
        initialSeed?: string | number;
        noInit?: boolean;
      }
    > = {}
  ) {
    if ("serialisedState" in props && props.serialisedState) {
      const state = JSON.parse(props.serialisedState);
      gameState.parse(state);
      this._state = state;
    } else {
      const initialSeed = (() => {
        if (props.initialSeed) {
          return typeof props.initialSeed == "string"
            ? cyrb128(props.initialSeed)
            : props.initialSeed;
        }

        const randomValues = new Uint32Array(1);
        crypto.getRandomValues(randomValues);
        return randomValues[0];
      })();

      const commonState = {
        index: 0,
        players: [],
        initialSeed,
        stackPlusTwos: props.stackPlusTwos ?? true,
        cache: {
          hands: {},
          deck: [],
          seed: initialSeed,
          ended: false,
          stackedPlusTwos: 0,
          turnStep: 1,
          pile: [],
          last3CardPlayOrColorChanges: [],
        },
      } satisfies Omit<GameState, "shorthandMode" | "events">;

      if (props.shorthandMode) {
        const shorthandGameState = {
          shorthandMode: true,
          events: [],
          ...commonState,
        } satisfies ShorthandGameState;

        // @ts-expect-error todo: figure out why we cannot narrow here
        this._state = shorthandGameState;
      } else {
        const fullGameState = {
          shorthandMode: false,
          events: [],
          ...commonState,
        } satisfies FullGameState;

        // @ts-expect-error todo: figure out why we cannot narrow here
        this._state = fullGameState;
      }

      if (!props.noInit) {
        // assign everything that needs random(), since it
        // cannot be used before _state is assigned.
        this.init();
      }
    }
  }

  // mulberry32
  protected random(): number {
    let t = (this._state.cache.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  protected shuffleDeck() {
    const toShuffle = this._state.cache.deck;

    for (let i = toShuffle.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
    }

    this.recordEvent({
      type: "game_info",
      info: {
        type: "seed_changed",
        newSeed: this._state.cache.seed,
      },
    });
  }

  protected nonInfoEvents() {
    return this.state.events.filter((e) => e.type !== "game_info");
  }

  protected init(customDeckTopCard?: Card) {
    this._state.cache.deck = structuredClone(DECK);
    this.shuffleDeck();

    // todo: return the deck top card here, and figure out what
    // happens when it happens to be a color switching card.
    const pileTopCard = (() => {
      if (customDeckTopCard) return customDeckTopCard;
      const index = this._state.cache.deck.findIndex(
        (card) => !includes(colorSwitchingScs.options, card.type)
      );
      const [ptc] = this._state.cache.deck.splice(index, 1);
      return ptc;
    })();

    const firstCardPlayEvent = {
      type: "card_played",
      by: ENGINE_ID,
      card: pileTopCard,
    } satisfies CardPlayedEvent;

    this._state.events = [firstCardPlayEvent];
    this._state.cache.pile = [pileTopCard];
    this._state.cache.last3CardPlayOrColorChanges = [pileTopCard];
  }

  protected recordEvent(event: GameEvent | InfoEvent) {
    if (this._state.shorthandMode) {
      if (event.type == "game_info") return;

      // in shorthand mode, we keep at most MAX_SHORTHAND_EVENTS
      if (this._state.events.length == MAX_SHORTHAND_EVENTS) {
        this._state.events.shift();
      }

      this._state.events.push(event);
    } else this._state.events.push(event);
  }

  protected deckTopCard() {
    // if the deck is empty, shuffle the playing pile and make it the new deck
    if (!this._state.cache.deck.length) {
      const pile = this.getPile();
      if (!pile.length) {
        throw new UnocabError(
          UECode.DeckPileExhausted,
          undefined,
          "Both the deck and pile have been exhausted, cannot draw"
        );
      }

      this._state.cache.deck = pile;
      this.shuffleDeck();

      this._state.cache.pile = [];
      this.recordEvent({
        type: "game_info",
        info: { type: "pile_to_deck" },
      });
    }

    return this._state.cache.deck.shift()!;
  }

  /**
   * Returns the last two events that don't have the type "game_info".
   * @param ignoredEvents - the number of non-info events to ignore from
   * the end. This param is useful, say, when checking during a bluff call,
   * where you might need to ignore the last 3 events.
   */
  lastTwoNonInfoEvents(ignoredEvents?: number) {
    // one game event is always guaranteed to be present, since at the
    // start of the game, the engine always plays a card.
    return this.nonInfoEvents()
      .slice(-2 + (ignoredEvents ?? 0), ignoredEvents)
      .reverse() as [GameEvent] | [GameEvent, GameEvent];
  }

  /**
   * Returns the playing pile. This is where the first card is
   * played, and where all the subsequent cards played by players
   * are put. It is guaranteed to have one card at the start.
   *
   * ```typescript
   * const game = new Game();
   * game.play(p1, { type: "one", color: "red" });
   * game.play(p2, { type: "one", color: "green" });
   *
   * assertEquals(game.getPile(), [
   *  { type: "six", color: "red" }, // randomly chosen by engine
   *  { type: "one", color: "red" },
   *  { type: "one", color: "green" },
   * ]);
   * ```
   */
  getPile(): Card[] {
    return structuredClone(this._state.cache.pile);
  }

  /**
   * @param bluffSiteCheck - if set to true, the last 3 events will be ignored.
   *
   * Check whether the given event is valid at the current
   * state of the game.
   *
   * ```typescript
   * const game = new Game();
   * game.draw(p1);
   *
   * // false, since you cannot call bluff after drawing
   * game.checkEvent({ type: "bluff_called", by: p1 });
   *
   * // true, since you can pass after drawing
   * game.checkEvent({ type: "pass", by: p1 }); // true
   *
   * game.pass(p1);
   *
   * // false, since you cannot pass without drawing
   * game.checkEvent({ type: "draw", by: p2 }); // false
   * ```
   */
  checkEvent(event: GameEvent, bluffSiteCheck = false) {
    if (!bluffSiteCheck) {
      // if a player leaves before another player calls bluff, this should still work
      const playerCount = this._state.players.length;
      if (playerCount < MIN_PLAYERS) {
        return new UnocabError(
          UECode.TooFewPlayers,
          { playerCount },
          "An active game must have at least two players"
        );
      }

      // during a bluff site check, an actual move is not being checked for
      if (event.by != this.activePlayer()) {
        return new UnocabError(
          UECode.NotPlayersTurn,
          { playerId: event.by },
          "It is not your turn"
        );
      }
    }

    const gameEnded = this.hasEnded();
    if (gameEnded) {
      return new UnocabError(
        UECode.GameEnded,
        { loser: gameEnded.loser },
        "This game has ended"
      );
    }

    // during a bluff site check, we need to not consider
    // the last 3 events, since those would be the playing
    // of +4, a color change, and a bluff call. By going
    // back 3 steps, we reach a point where we check the
    // event as if the player has not yet played a +4. This
    // allows us to figure out if the player was bluffing.
    const [lastEvent, secondLastEvent] = this.lastTwoNonInfoEvents(
      bluffSiteCheck ? -3 : undefined
    );

    // if the last card was a color switching card, enforce color choose
    if (
      lastEvent.type == "card_played" &&
      includes(colorSwitchingScs.options, lastEvent.card.type) &&
      event.type != "choose-color"
    ) {
      return new UnocabError(
        UECode.MustPickColor,
        { performedEvent: event },
        "Must pick color after playing a color switching card"
      );
    }

    // if the last card was a +2, enforce draw or play of another +2
    if (
      lastEvent.type == "card_played" &&
      lastEvent.card.type == "plus-two" &&
      event.type != "draw"
    ) {
      const plusTwoPlayed =
        event.type == "card_played" && event.card.type == "plus-two";

      if (!plusTwoPlayed) {
        return new UnocabError(
          UECode.MustDrawOrPlusTwo,
          { performedEvent: event },
          "Must draw or play another +2 on a +2"
        );
      }
    }

    if (secondLastEvent) {
      // if the last card was a +4, enforce draw or call bluff
      if (
        secondLastEvent.type == "card_played" &&
        secondLastEvent.card.type == "plus-four" &&
        event.type != "draw" &&
        event.type != "bluff_called"
      ) {
        return new UnocabError(
          UECode.MustDrawOrCallBluff,
          { performedEvent: event },
          "Must either draw or call bluff after +4"
        );
      }
    }

    if (event.type == "card_played") {
      const card = event.card;

      if (
        includes(colorSwitchingScs.options, card.type) &&
        this.handOf(event.by).length == 1
      ) {
        return new UnocabError(
          UECode.MustNotPlayLastCardColorChanging,
          { performedEvent: event },
          `Cannot play one of ${colorSwitchingScs.options} as the last card`
        );
      }

      // if any of these are/have undefined, they become a non-condition.
      const { expectedColor, expectedType } = this.expectedCard(bluffSiteCheck);

      if (
        expectedType != card.type &&
        (card.color ?? expectedColor) != expectedColor
      ) {
        let msg = "Must play ";
        if (expectedType) {
          msg += `card of type ${expectedType}`;
        }

        if (expectedColor) {
          const ecErr = `color ${expectedColor}`;
          msg += msg == "Must play " ? `card of ${ecErr}` : ` or ${ecErr}`;
        }

        const cardColor = card.color;
        msg += `, found ${card.type}${
          cardColor ? ` of color ${cardColor}` : ""
        }`;

        return new UnocabError(
          UECode.MustPlayExpectedCard,
          {
            expected: { expectedType, expectedColor },
            found: card,
          },
          msg
        );
      }
    } else if (event.type == "draw") {
      if (lastEvent.type == "draw" && lastEvent.by == event.by) {
        return new UnocabError(
          UECode.MustNotDrawTwice,
          undefined,
          "Cannot draw twice in a row"
        );
      }
    } else if (event.type == "pass") {
      const hasDrawn = lastEvent.type == "draw" && lastEvent.by == event.by;
      if (!hasDrawn)
        return new UnocabError(
          UECode.MustNotPassWithoutDraw,
          undefined,
          "Cannot pass without drawing"
        );
    } else if (event.type == "bluff_called") {
      const [, secondLastEvent] = this.lastTwoNonInfoEvents();
      if (
        !secondLastEvent ||
        secondLastEvent.type != "card_played" ||
        secondLastEvent.card.type != "plus-four"
      ) {
        return new UnocabError(
          UECode.CannotCallBluff,
          undefined,
          "You cannot call bluff when the last card is not a +4 or a color has not yet been chosen"
        );
      }
    } else if (event.type == "choose-color") {
      if (
        lastEvent.type != "card_played" ||
        !includes(colorSwitchingScs.options, lastEvent.card.type) ||
        event.by != lastEvent.by
      ) {
        return new UnocabError(
          UECode.CannotSwitchColors,
          undefined,
          `You can only switch colors if you played one of [${colorSwitchingScs.options}] in the last turn`
        );
      }
    }
  }

  // ─── Event Processing Method ─────────────────────────────────────────

  /**
   * This function can be used as an alternative to the user-friendly
   * methods like {@link Game.draw} or {@link Game.pass}, where you are
   * allowed to directly pass in a {@link GameEvent}.
   *
   * ```typescript
   * const game = new Game();
   *
   * // regular way
   * game.draw(p1);
   *
   * // processNewEvent way
   * game.processNewEvent({ type: "draw", by: p1 });
   * ```
   */
  processNewEvent(event: GameEvent): ProcessEventResult {
    if (!playerId.safeParse(event.by).success) {
      throw new UnocabError(
        UECode.InvalidId,
        { id: event.by },
        "Invalid player ID"
      );
    }

    const hand = this.handOf(event.by);

    const err = this.checkEvent(event);
    if (err) throw err;

    // ─── Card Played Event ───────────────────────────────
    if (event.type == "card_played") {
      const currentCard = event.card;
      const cardIndex = hand.findIndex(
        (c) => c.type == event.card.type && c.color == event.card.color
      );

      if (cardIndex < 0) {
        throw new UnocabError(
          UECode.PlayerDoesntHaveCard,
          { playerId: event.by, card: event.card },
          "You do not have this card"
        );
      }

      // remove the card from the players deck
      hand.splice(cardIndex, 1);

      // add this event to the game events
      this.recordEvent(event);

      if (this._state.cache.last3CardPlayOrColorChanges.length == 3)
        this._state.cache.last3CardPlayOrColorChanges.shift();
      this._state.cache.last3CardPlayOrColorChanges.push(currentCard);

      this._state.cache.pile.push(currentCard);

      if (currentCard.type == "plus-two") {
        this._state.cache.stackedPlusTwos++;
      }

      if (currentCard.type == "reverse") {
        this._state.cache.turnStep *= -1;
      }

      if (!includes(colorSwitchingScs.options, currentCard.type)) {
        const turnStepMultiplier = (() => {
          if (currentCard.type == "skip") {
            return 2;
          } else if (currentCard.type == "reverse") {
            return this._state.players.length == 2 ? 2 : 1;
          }

          return 1;
        })();

        this._state.index += this._state.cache.turnStep * turnStepMultiplier;
      }

      // add 'player_won' event if the player's deck is now empty
      if (!this.handOf(event.by).length) {
        this.recordEvent({
          type: "game_info",
          info: {
            type: "player_won",
            id: event.by,
          },
        });

        // if there's only one person left with cards, end the game
        const playersWithCards = Object.entries(this._state.cache.hands)
          .filter(([, v]) => v.length)
          .map(([k]) => k);

        if (playersWithCards.length == 1) {
          this.recordEvent({
            type: "game_info",
            info: {
              type: "game_ended",
              loser: playersWithCards[0],
            },
          });

          this._state.cache.ended = true;

          return {
            type: "player_win_game_end",
            won: event.by,
            lost: playersWithCards[0],
            formatted: `Player ${event.by} won! Game ended.`,
          };
        }

        return {
          type: "player_win",
          won: event.by,
          formatted: `Player ${event.by} won!`,
        };
      }
    }

    // ─── Draw Event ──────────────────────────────────────────────
    else if (event.type == "draw") {
      const [lastEvent, secondLastEvent] = this.lastTwoNonInfoEvents();
      const toDraw = (() => {
        if (
          lastEvent.type == "card_played" &&
          lastEvent.card.type == "plus-two"
        ) {
          const stackedPlusTwos = this._state.stackPlusTwos
            ? this._state.cache.stackedPlusTwos
            : 1;

          return stackedPlusTwos * 2;
        }

        if (
          secondLastEvent &&
          secondLastEvent.type == "card_played" &&
          secondLastEvent.card.type == "plus-four"
        ) {
          return 4;
        }

        return 1;
      })();

      const drawCards = Array(toDraw)
        .fill(null)
        .map(() => this.deckTopCard());

      this.handOf(event.by).push(...drawCards);

      // forfeit the turn after drawing 2/4 cards
      if (toDraw != 1) {
        this._state.index += this._state.cache.turnStep;
      }

      // add this event to the game events
      this.recordEvent(event);
      this._state.cache.stackedPlusTwos = 0;

      return {
        type: "drawing_cards",
        cards: drawCards,
        count: drawCards.length,
        formatted: `Drawing ${drawCards.length} card(s)`,
      };
    }

    // ─── Pass Event ──────────────────────────────────────────────
    else if (event.type == "pass") {
      // add this event to the game events and increase the turn
      this.recordEvent(event);
      this._state.index += this._state.cache.turnStep;
      return {
        type: "turn_passed",
        formatted: "Turn passed",
      };
    }

    // ─── Bluff Called Event ──────────────────────────────────────
    else if (event.type == "bluff_called") {
      // this cast is safe, because it has already been checked for
      // in the checkEvent() function above.
      const [, secondLastEvent] = this.lastTwoNonInfoEvents() as [
        GameEvent,
        CardPlayedEvent
      ];

      const lastPlayerId = secondLastEvent!.by;
      const lastPlayerHand = this.handOf(lastPlayerId)!;

      // add this event to the game events and increase the step
      this.recordEvent(event);
      this._state.index += this._state.cache.turnStep;

      if (
        lastPlayerHand
          .filter((c) => !includes(colorSwitchingScs.options, c.type))
          .some(
            (c) =>
              // if the return value is not an error, it's a valid play
              !this.checkEvent(
                {
                  type: "card_played",
                  card: c,
                  by: ENGINE_ID,
                },
                true
              )
          )
      ) {
        // bluff call succeeded, give 4 cards to last player
        lastPlayerHand.push(
          ...Array(4)
            .fill(null)
            .map(() => this.deckTopCard())
        );

        const info = {
          type: "bluff_call_succeeded" as const,
          by: event.by,
          of: lastPlayerId,
        };

        this.recordEvent({
          type: "game_info",
          info,
        });

        return {
          ...info,
          formatted: "Bluff called! giving 4 cards to the previous player.",
        } as const;
      } else {
        // bluff call failed, give 6 cards to current player
        this.handOf(event.by).push(
          ...Array(6)
            .fill(null)
            .map(() => this.deckTopCard())
        );

        const info = {
          type: "bluff_call_failed" as const,
          by: event.by,
          of: lastPlayerId,
        };

        this.recordEvent({
          type: "game_info",
          info,
        });

        return {
          ...info,
          formatted: "Bluff call failed! Giving 6 cards to current player",
        } as const;
      }
    }

    // ─── Choose Color Event ──────────────────────────────
    else if (event.type == "choose-color") {
      if (this._state.cache.last3CardPlayOrColorChanges.length == 3)
        this._state.cache.last3CardPlayOrColorChanges.shift();

      this._state.cache.last3CardPlayOrColorChanges.push(event.color);

      // add this event to the game events and increase the turn
      this.recordEvent(event);
      this._state.index += this._state.cache.turnStep;

      return {
        type: "color_changed",
        to: event.color,
        formatted: `Color changed to ${event.color}`,
      };
    } else exhaustive(event);

    throw "unreachable";
  }

  // ─── Gameplay Functions ──────────────────────────────────────────────

  /**
   * Have player(s) denoted by an ID join the game.
   *
   * ```typescript
   * const game = new Game();
   * const p1 = uuidv4();
   * const p2 = uuidv4();
   * game.join(p1, p2);
   * ```
   */
  join(...playerIds: PlayerId[]) {
    const playerCount = this._state.players.length;
    if (playerCount == MAX_PLAYERS) {
      throw new UnocabError(
        UECode.TooManyPlayers,
        { playerCount },
        "At most 10 players can join a game"
      );
    }

    playerIds.forEach((id) => {
      if (id == ENGINE_ID || !playerId.safeParse(id).success) {
        throw new UnocabError(
          UECode.InvalidId,
          { id },
          `${id} is an invalid id`
        );
      }
    });

    playerIds.forEach((playerId) => {
      const hand = Array(7)
        .fill(null)
        .map(() => this.deckTopCard());

      this._state.players.push(playerId);
      this._state.cache.hands[playerId] = hand;

      this.recordEvent({
        type: "game_info",
        info: {
          type: "player_joined",
          id: playerId,
        },
      });
    });
  }

  /**
   * Have player(s) denoted by an ID join the game.
   *
   * ```typescript
   * const game = new Game();
   * const p1 = uuidv4();
   * const p2 = uuidv4();
   * game.join(p1, p2);
   *
   * game.leave(p1, p2);
   * ```
   */
  leave(...playerIds: PlayerId[]) {
    playerIds.forEach((playerId) => {
      if (!this._state.players.find((id) => id == playerId)) {
        throw new UnocabError(
          UECode.PlayerNotInGame,
          { playerId },
          "This player is not in the game"
        );
      }

      this._state.players = this._state.players.filter((id) => id != playerId);

      this.recordEvent({
        type: "game_info",
        info: {
          type: "player_left",
          id: playerId,
        },
      });
    });
  }

  /**
   * Have a player denoted by an ID play a card. Throws
   * an {@link UnocabError} in case the player does not
   * have the given card, or if playing it is an invalid move.
   *
   * ```typescript
   * const game = new Game();
   * game.play(p1, { type: "one", color: "red" });
   * ```
   */
  play(by: PlayerId, card: Card) {
    return this.processNewEvent({
      type: "card_played",
      by,
      card,
    });
  }

  /**
   * Have a player denoted by an ID draw a card. Throws
   * an {@link UnocabError} in case it's invalid to draw.
   *
   * ```typescript
   * const game = new Game();
   * game.draw(p1);
   * ```
   */
  draw(by: PlayerId) {
    return this.processNewEvent({
      type: "draw",
      by,
    });
  }

  /**
   * Have a player denoted by an ID draw a card. Throws
   * an {@link UnocabError} in case it's invalid to pass.
   *
   * ```typescript
   * const game = new Game();
   * game.draw(p1);
   * game.pass(p1);
   * ```
   */
  pass(by: PlayerId) {
    return this.processNewEvent({
      type: "pass",
      by,
    });
  }

  /**
   * Have a player denoted by an ID call bluff. Throws
   * an {@link UnocabError} in case a +4 was not played
   * as the previous event, or if it is an invalid move.
   *
   * ```typescript
   * const game = new Game();
   * game.play(p1, { type: "plus-four" });
   * game.switchColor(p1, "red");
   * game.callBluff(p2);
   * ```
   */
  callBluff(by: PlayerId) {
    return this.processNewEvent({
      type: "bluff_called",
      by,
    });
  }

  /**
   * Have a player denoted by an ID switch color. Throws
   * an {@link UnocabError} in case a color switching card
   * was not played as the previous event, or if it is an invalid move.
   *
   * ```typescript
   * const game = new Game();
   * game.play(p1, { type: "plus-four" });
   * game.switchColor(p1, "red");
   * ```
   */
  chooseColor(by: PlayerId, color: CardColor) {
    return this.processNewEvent({
      type: "choose-color",
      by,
      color,
    });
  }

  /**
   * Fetches the hand of a player denoted by an ID.
   * Throws an {@link UnocabError} if the player is
   * not present in the game.
   */
  handOf(playerId: PlayerId): Card[] {
    const hand = this._state.cache.hands[playerId];
    if (!hand)
      throw new UnocabError(
        UECode.PlayerNotInGame,
        { playerId },
        "This player is not in the game"
      );
    return hand;
  }

  // ─── Util Functions ──────────────────────────────────────────────────

  /**
   * Serialises the game state into a JSON. This can then
   * be passed to the constructor when creating a new game
   * in order to recreate the game.
   *
   * ```typescript
   * const game = new Game({ shorthandMode: true });
   *
   * const json = game.serialise();
   *
   * const recreatedGame = new Game<true>({ serialisedState: json });
   * ```
   */
  serialise() {
    return JSON.stringify(this._state);
  }

  /**
   * Clones this game to create another game with the exact
   * same state and set of players.
   */
  clone() {
    return new Game<Shorthand>({ serialisedState: this.serialise() });
  }

  /**
   * Fetches events of the given type from the game.
   *
   * ```typescript
   * const game = new Game();
   * game.draw(p1);
   * game.pass(p1);
   * game.draw(p2);
   *
   * assertEquals(game.eventsOfType("draw"), [
   *   { type: "draw", by: p1 },
   *   { type: "draw", by: p2 }
   * ]);
   * ```
   */
  eventsOfType<T extends GameState["events"][number]["type"]>(type: T) {
    type FilteredType = Extract<GameState["events"][number], { type: T }>;
    return this._state.events.filter(
      (event) => event.type == type
    ) as FilteredType[];
  }

  /**
   * Get the player ID of the active player who is expected to play.
   *
   * ```typescript
   * const game = new Game();
   *
   * assertEquals(game.activePlayer(), p1);
   *
   * game.draw(p1);
   * game.pass(p1);
   *
   * assertEquals(game.activePlayer(), p2);
   * ```
   */
  activePlayer(): PlayerId {
    const validPlayers = Object.entries(this._state.cache.hands)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const index = Math.abs(this._state.index % validPlayers.length);
    return validPlayers[index];
  }

  /**
   * Checks whether this game has ended. If it has, returns an
   * object containing the player ID of the losing player.
   */
  hasEnded() {
    if (this._state.cache.ended) {
      const loser = Object.entries(this._state.cache.hands).find(
        ([, v]) => v.length
      )![0];

      return { loser };
    }

    return false;
  }

  /**
   * @param bluffSiteCheck - if set to true, the last 3 events will be ignored.
   *
   * Gets the expected card type and color that, if playing a card is
   * possible in the current state, would be valid. Please note that this
   * does not mean actually playing that card is okay. It just denotes the
   * current "pile status", so to speak. To check if playing a card is valid
   * in the current situation, use {@link Game.checkEvent}. Also, in case any
   * of `expectedType` or `expectedColor` is undefined, it becomes a non
   * condition. This means any type/color is allowed.
   */
  expectedCard(bluffSiteCheck = false): {
    expectedType?: Card["type"];
    expectedColor: Card["color"];
  } {
    const expectedType = (() => {
      const lastPileCard = this._state.cache.pile.at(-1);
      if (
        lastPileCard &&
        !includes(colorSwitchingScs.options, lastPileCard.type)
      ) {
        return lastPileCard.type;
      }
    })();

    const expectedColor = (() => {
      const lcc = this._state.cache.last3CardPlayOrColorChanges.at(
        bluffSiteCheck ? -3 : -1
      );

      if (lcc) {
        return typeof lcc == "string" ? lcc : lcc.color;
      }

      return undefined;
    })();

    return {
      expectedType,
      expectedColor,
    };
  }

  /**
   * Resets the game to a previous index of the events array.
   * This can be used to replay a game from the start, or to
   * undo a previous move. Cannot be used in shorthand mode.
   * Returns the events that will be "removed".
   *
   * ```typescript
   *  const game = new Game();
   *
   *  game.play(p1, { type: "seven", color: "blue" });
   *
   *  // jump to the second last index, where the above
   *  // move does not exist, effectively undo-ing it.
   *  game.jumpToEventIndex(-2);
   *
   *  game.play(p1, { type: "six", color: "blue" });
   * ```
   */
  jumpToEventIndex(index: number) {
    if (this._state.shorthandMode)
      throw new Error("Cannot jump to index in shorthand mode");

    const length = this._state.events.length;
    if (index < -length || index >= length)
      throw new Error("Invalid event index");

    if (index < 0) {
      index = this._state.events.length + index;
    }

    const remainingEvents = this._state.events.splice(index + 1);

    const cg = new Game({ initialSeed: this._state.initialSeed });
    for (const event of this.state.events) {
      if (event.type == "game_info") {
        const info = event.info;
        if (info.type == "game_ended") break;
        if (info.type == "player_joined") cg.join(info.id);
        if (info.type == "player_left") cg.leave(info.id);
        continue;
      }

      if (event.by == ENGINE_ID) continue;
      cg.processNewEvent(event);
    }

    this._state = cg.state as typeof this._state;
    return remainingEvents;
  }

  /**
   * Get a set of {@link GameEvent} that are valid in the current state of
   * the game. For example, after a draw, only a pass is a valid move, so
   * this function will return that. The returned events can also be directly
   * passed to {@link Game.processNewEvent}.
   *
   * ```typescript
   * const game = new Game();
   * game.draw(p1);
   * assertEquals(game.validEvents(), [
   *  { type: "pass", by: p1 }
   * ]);
   * ```
   */
  validEvents(playerId: PlayerId) {
    const allEvents: GameEvent[] = [
      { type: "draw", by: playerId },
      { type: "bluff_called", by: playerId },
      { type: "pass", by: playerId },

      // here red itself has no purpose -- if red can be
      // chosen, any color can be.
      { type: "choose-color", by: playerId, color: "red" },

      ...this.handOf(playerId).map<GameEvent>((card) => ({
        type: "card_played",
        by: playerId,
        card,
      })),
    ];

    return allEvents.filter((e) => !this.checkEvent(e));
  }
}
