import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

/*
 * This file exports both Zod types and TS types for everything
 * Zod types start with a lowercase character, while TS types
 * start with an uppercase character.
 */

// ─── Card Utils ──────────────────────────────────────────────────────────────
export const regularCards = z.enum([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
]);
export type RegularCard = z.infer<typeof regularCards>;

// color-switching special cards
export const colorSwitchingScs = z.enum(["plus-four", "color-chooser"]);
export type ColorSwitchingScs = z.infer<typeof colorSwitchingScs>;

// non color-switching special cards
export const nonColorSwitchingScs = z.enum(["plus-two", "reverse", "skip"]);
export type NonColorSwitchingScs = z.infer<typeof nonColorSwitchingScs>;

export const specialCards = z.enum([
  ...nonColorSwitchingScs.options,
  ...colorSwitchingScs.options,
]);
export type SpecialCard = z.infer<typeof specialCards>;

// all cards = regular cards + special cards
export const allCards = z.enum([
  ...regularCards.options,
  ...specialCards.options,
]);
export type AllCards = z.infer<typeof allCards>;

export const cardColor = z.enum(["red", "blue", "green", "yellow"]);
export type CardColor = z.infer<typeof cardColor>;

export const card = z.union([
  z.object({
    type: z.union([regularCards, nonColorSwitchingScs]),
    color: cardColor,
  }),
  z.object({
    type: colorSwitchingScs,
    color: z.undefined(),
  }),
]);
export type Card = z.infer<typeof card>;

export const playerId = z.string();
export type PlayerId = z.infer<typeof playerId>;

// ─── Game Events ─────────────────────────────────────────────────────────────
export const cardPlayedEvent = z.object({
  type: z.literal("card_played"),
  by: playerId,
  card,
});
export type CardPlayedEvent = z.infer<typeof cardPlayedEvent>;

export const bluffCalledEvent = z.object({
  type: z.literal("bluff_called"),
  by: playerId,
});
export type BluffCalledEvent = z.infer<typeof bluffCalledEvent>;

export const drawEvent = z.object({
  type: z.literal("draw"),
  by: playerId,
});
export type DrawEvent = z.infer<typeof drawEvent>;

export const passEvent = z.object({
  type: z.literal("pass"),
  by: playerId,
});
export type PassEvent = z.infer<typeof passEvent>;

export const chooseColorEvent = z.object({
  type: z.literal("choose-color"),
  by: playerId,
  color: cardColor,
});
export type ChooseColorEvent = z.infer<typeof chooseColorEvent>;

// the collective game event object
export const gameEvent = z.union([
  cardPlayedEvent,
  bluffCalledEvent,
  chooseColorEvent,
  drawEvent,
  passEvent,
]);
export type GameEvent = z.infer<typeof gameEvent>;

// the game info event is added the engine
export const infoEvent = z.object({
  type: z.literal("game_info"),
  info: z.union([
    z.object({
      type: z.literal("bluff_called"),
      by: playerId,
    }),
    z.object({
      type: z.literal("bluff_call_succeeded"),
      by: playerId,
      of: playerId,
    }),
    z.object({
      type: z.literal("bluff_call_failed"),
      by: playerId,
      of: playerId,
    }),
    z.object({
      type: z.literal("seed_changed"),
      newSeed: z.number(),
    }),
    z.object({
      type: z.literal("player_won"),
      id: playerId,
    }),
    z.object({
      type: z.literal("game_ended"),
      loser: playerId,
    }),
    z.object({
      type: z.literal("player_joined"),
      id: playerId,
    }),
    z.object({
      type: z.literal("player_left"),
      id: playerId,
    }),
    z.object({
      type: z.literal("pile_to_deck"),
    }),
  ]),
});
export type InfoEvent = z.infer<typeof infoEvent>;

// ─── Game Utils ──────────────────────────────────────────────────────────────
const commonGameState = {
  // the index gets modulo'd with the player count to get the active player index
  index: z.number(),
  initialSeed: z.number(),
  players: playerId.array(),

  // game options
  stackPlusTwos: z.boolean(),

  // this is a cache, since all of the info here can be obtained from the
  // events array; but since it's expensive to do that all the time, we
  // can keep it here. note that re-obtaining this info in shorthand mode
  // is not possible, since past events are not kept, so it acts as state.
  cache: z.object({
    hands: z.record(playerId, card.array()),
    deck: card.array(),
    seed: z.number(),
    stackedPlusTwos: z.number(),
    turnStep: z.union([z.literal(1), z.literal(-1)]),
    ended: z.boolean(),
    pile: card.array(),
    last3CardPlayOrColorChanges: z.union([card, cardColor]).array(),
  }),
};

export const fullGameState = z.object({
  shorthandMode: z.literal(false),
  ...commonGameState,
  events: z.union([gameEvent, infoEvent]).array(),
});
export type FullGameState = z.infer<typeof fullGameState>;

export const shorthandGameState = z.object({
  shorthandMode: z.literal(true),
  ...commonGameState,
  events: gameEvent.array(),
});
export type ShorthandGameState = z.infer<typeof shorthandGameState>;

export const gameState = z.union([fullGameState, shorthandGameState]);
export type GameState = z.infer<typeof gameState>;

// returned from `processNewEvent` or any of the user-friendly
// functions like `draw`, `pass`, `play`, `callBluff`, or `switchColor`.
export type ProcessEventResult =
  | {
      type: "card_played";
      card: Card;
      formatted: string;
    }
  | {
      type: "player_win_game_end";
      won: string;
      lost: string;
      formatted: string;
    }
  | {
      type: "player_win";
      won: string;
      formatted: string;
    }
  | {
      type: "drawing_cards";
      cards: Card[];
      count: number;
      formatted: string;
    }
  | {
      type: "turn_passed";
      formatted: string;
    }
  | {
      type: "bluff_call_succeeded";
      by: string;
      of: string;
      formatted: string;
    }
  | {
      type: "bluff_call_failed";
      by: string;
      of: string;
      formatted: string;
    }
  | {
      type: "color_changed";
      to: string;
      formatted: string;
    };
