# Unocab

Unocab is an UNO game engine.

# Installation

### Deno
```typescript
import { Game } from "https://deno.land/x/unocab@v0.8.0/mod.ts";
```

### Node
`npm install unocab`

# Usage

```typescript
// On creation of a Game, an UNO deck of 108 cards is
// shuffled and assigned to `game.state.cache.deck`.
const game = new Game({
  // Whether to stack +2s. If this is enabled, and
  // say three +2s are played one after the other,
  // the person to draw next will pick up 6 cards.
  // This option is enabled by default.
  stackPlusTwos: true,

  // The initial seed determines all the random events
  // of the game. Hence if you create two games with
  // the same initial seed and the same number of players
  // join the game at the same time, the shuffled deck and
  // the hands of the players will be the same.
  initialSeed: "unocab rocks!",

  // Explained in the next README section.
  shorthandMode: false,
});

// At the start of the game, the engine also plays the
// first card of the deck which is not a +4 or color
// switcher. After this point, players continue the
// game based on the type and color of this card.

// Whenever new players join, a hand of 7 cards is
// assigned to each of them. A hand is formed by
// drawing the top card of the deck 7 times. This
// is random, since the deck has been shuffled.
const [p1, p2] = ["player1", "player2"];
game.join(p1, p2);

// let's assume the first card was a Red 4, and p1 has
// a Red 6 and a +4.
game.play(p1, { type: "six", color: "red" });

game.draw(p2);
game.pass(p2);

game.play(p1, { type: "plus-four" });
game.switchColor(p1, "blue");

game.callBluff(p2);

// ... more moves

const end = game.hasEnded();
if (end) console.log(end.loser + " lost the game!");
```

# Full vs Shorthand mode

During creation of a `Game`, you can optionally pass in `shorthandMode: true`. In shorthand
mode, the engine only keeps as much information about the game as is needed for it to
function. Otherwise, **and by default**, **all** information about the game is kept in the events
array (`game.state.events`). This allows you to have a history of all the happenings in that
particular game, and also allows you to jump to an arbitrary point in the game. For example,
to undo a move, you could use `game.jumpToEventIndex(-2)`. This
function is not usable in shorthand mode, and the events array will only keep 5 events at most.

**TLDR**: Use shorthand mode if you don't want to use `jumpToEventIndex` or keep the entire game history.

# Serialising and Deserialising

A game can be serialised into JSON using `game.serialise()`, and cloned using `game.clone()`.
A game can be deserialised using `new Game({ serialisedState: gameJson })`.

However, when deserialising a game, arguments like `shorthandMode` or `stackPlusTwos` are not
allowed, since they were already set when the game was being initiated.

# Error Reporting

If a player tries to perform an invalid move, such as drawing twice in a row or playing a card
that is not allowed, an `UnocabError` will be thrown. The message provides an adequate description
of what the problem was, but you can also access information pertaining to the error using the `code` and `data` fields in an `UnocabError`. Please have a look at `errors.ts` for the variations of error codes and the data they provide.

# Types

Unocab provides Zod types for most of the objects it uses in case you're building something like a REST API and want to verify the structure. Please glance over the `types.ts` file to figure out what Zod types are provided.

# GameEvent

A game event is an object with a `type` that denotes what kind of event it is (e.g. `draw` or `card_played`), and additional info about that particular event, such as the `card` property in a `card_played` event.

It looks like `{ type: "card_played", by: "player-one", card: { type: "six", color: "red" } }`.

> NOTE: In full mode (aka not shorthand mode), the events array will also contain events with type `game_info`. These events are not a result of player's actions, but are added by the engine to denote certain happenings. For example, when a player calls bluff, a `game_info` event will be added afterwards to signify whether the bluff call succeeded or failed. This can be helpful for something like implementation of animations when re-playing the game.

For more information about what events exist, please glance over the `types.ts` file.

# Fetching valid events

To obtain a list of "options" for the active player in a game, use `game.validEvents(playerId)`.
This will return an array of `GameEvent`s which the player is allowed to act on. These events can
directly be used like `game.processNewEvent(event)`, which acts as an alternative to functions like
`game.draw` or `game.pass`, which internally use `processNewEvent` as well.

# Demo implementations

Please refer to `impls/cli-uno.ts` for a cli-based game with an AI.
There's also `impls/autoplay.ts`, which is an AI vs AI game.

(AI here naturally means if conditions, ofcourse!)
