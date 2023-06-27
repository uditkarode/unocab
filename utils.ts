import {
  Card,
  PlayerId,
  cardColor,
  colorSwitchingScs,
  nonColorSwitchingScs,
  regularCards,
} from "./types.ts";

// 36 chars by default to match uuid length
export const ENGINE_ID = "ENGINE" satisfies PlayerId;

// we need at least 5 events, since 3 events are taken
// up for +4, choose color, and call bluff, and the 4th
// last event is hence needed to check for bluff. The fifth
// last card is kept just in case it's needed for checkEvent.
export const MAX_SHORTHAND_EVENTS = 5;

// the minimum and maximum number of players in a game
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

const [zero, ...nonZeroRegularTypes] = regularCards.options;
const twoCardTypes = [...nonZeroRegularTypes, ...nonColorSwitchingScs.options];
export const DECK = [
  // one zero of each color
  ...cardColor.options.map<Card>((color) => ({
    type: zero satisfies "zero",
    color,
  })),

  // two of one-nine, plus-two, reverse, and skip of each color
  ...cardColor.options.flatMap<Card>((color) =>
    twoCardTypes.flatMap((type) => Array(2).fill({ type, color }))
  ),

  // four of each of the color switching special cards
  ...colorSwitchingScs.options.flatMap<Card>((type) => Array(4).fill({ type })),
] satisfies Card[];

// stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
export function cyrb128(str: string) {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;

  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}

export function includes<T>(arr: T[], v: unknown): v is T {
  return arr.includes(v as T);
}

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
// deno-lint-ignore ban-types
export type XOR<T, U> = T | U extends object
  ? (Without<T, U> & U) | (Without<U, T> & T)
  : T | U;
