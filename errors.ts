import { Card, GameEvent, PlayerId } from "./types.ts";

/// Unocab Error Code
/// Acts as an identifier for a `UnocabError`
export const enum UECode {
  GameEnded,
  MustPickColor,
  MustNotPlayLastCardColorChanging,
  MustDrawOrPlusTwo,
  MustDrawOrCallBluff,
  MustPlayExpectedCard,
  MustNotDrawTwice,
  MustNotPassWithoutDraw,
  CannotCallBluff,
  CannotSwitchColors,
  TooFewPlayers,
  TooManyPlayers,
  InvalidId,
  NotPlayersTurn,
  PlayerNotInGame,
  PlayerDoesntHaveCard,
  DeckPileExhausted,
}

/// Unocab Error Data
/// Provides additional information about an UnocabError with a specific `UECode`
export interface UEData
  extends Record<UECode, Record<string, unknown> | undefined> {
  [UECode.CannotCallBluff]: undefined;
  [UECode.MustNotDrawTwice]: undefined;
  [UECode.DeckPileExhausted]: undefined;
  [UECode.CannotSwitchColors]: undefined;

  [UECode.TooFewPlayers]: { playerCount: number };
  [UECode.TooManyPlayers]: { playerCount: number };

  [UECode.MustPickColor]: { performedEvent: GameEvent };
  [UECode.MustDrawOrPlusTwo]: { performedEvent: GameEvent };
  [UECode.MustDrawOrCallBluff]: { performedEvent: GameEvent };
  [UECode.MustNotPlayLastCardColorChanging]: { performedEvent: GameEvent };

  [UECode.InvalidId]: { id: PlayerId };
  [UECode.GameEnded]: { loser: PlayerId };
  [UECode.NotPlayersTurn]: { playerId: PlayerId };
  [UECode.PlayerNotInGame]: { playerId: PlayerId };

  [UECode.PlayerDoesntHaveCard]: { playerId: PlayerId; card: Card };

  [UECode.MustPlayExpectedCard]: {
    expected: {
      expectedType: Card["type"] | undefined;
      expectedColor: Card["color"];
    };
    found: Card;
  };
}

export class UnocabError<T extends UECode> extends Error {
  constructor(public code: T, public data: UEData[T], message: string) {
    super(message);
  }
}
