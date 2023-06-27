import * as colors from "https://deno.land/std@0.191.0/fmt/colors.ts";
import process from "node:process";
import {
  Card,
  CardColor,
  CardPlayedEvent,
  GameEvent,
  cardColor,
  colorSwitchingScs,
} from "../types.ts";
import { Game } from "../game.ts";
import { randomInt } from "node:crypto";
import { UnocabError } from "../errors.ts";
import { ENGINE_ID } from "../utils.ts";

export function includes<T>(arr: T[], v: unknown): v is T {
  return arr.includes(v as T);
}

export function randomFrom<T>(arr: T[] | readonly T[]): T {
  return arr[randomInt(0, arr.length)];
}

class CliUnoError extends Error {}

async function main() {
  console.clear();

  const game = new Game();
  const playerId = crypto.randomUUID();
  const aiId = crypto.randomUUID();
  game.join(playerId, aiId);

  const firstCard = lastCardPlay(game).card;
  const firstCardColor = firstCard.color ?? "white";

  linedLog(`First card: ${colors[firstCardColor](firstCard.type)}`);
  let turn = 1;

  while (true) {
    try {
      const gameEnded = game.hasEnded();
      if (gameEnded) {
        console.log("Game ended!");
        console.log(`You ${gameEnded.loser == playerId ? "lost" : "won"}!`);
        Deno.exit(0);
      }

      console.log(
        `${colors.bold("turn")}: ${turn} | ${colors.bold("your card count")}: ${
          game.handOf(playerId).length
        } | ${colors.bold("ai card count")}: ${game.handOf(aiId).length}\n`
      );

      const apId = game.activePlayer();
      if (apId == playerId) {
        await sleep(100);
        playerTurn(game, apId, game.handOf(apId));
      } else {
        await sleep(randomFrom([250, 300, 180, 220]));
        aiTurn(game, apId, game.handOf(apId));
      }

      turn++;
    } catch (e) {
      if (e instanceof UnocabError || e instanceof CliUnoError) {
        console.log(`\n${colors.red("ERR")} ${e.message}`);
      } else throw e;
    }
  }
}

function playerTurn(game: Game, playerId: string, deck: Card[]) {
  deck.forEach((card, index) => {
    const cardColor = card.color ?? "white";
    console.log(`[${index}] ${colors[cardColor](`${card.type}`)}`);
  });

  const answer = prompt(
    `\n${colors.gray(
      "(an index / a color / 'draw' / 'pass' / 'call-bluff' / 'expected')"
    )}\n${colors.bold("choice")}:`
  );

  console.clear();

  // ─── User Wants To Check The Expected Card ───────────────────────────
  if (!answer || answer == "expected") {
    console.log("Last 5 events:");
    const lastFiveEvents = game.state.events
      .filter((e) => e.type !== "game_info")
      .slice(-5) as GameEvent[];
    for (const event of lastFiveEvents.filter(Boolean)) {
      const eventPlayer = event.by == ENGINE_ID ? undefined : event.by;
      const hand = eventPlayer ? game.handOf(eventPlayer) : [];

      console.log(
        formatEvent(
          event,
          eventPlayer,
          hand,
          ` ${
            eventPlayer
              ? `${eventPlayer == playerId ? "Player:" : "AI:"}`
              : "Engine:"
          }`,
          true
        )
      );
    }

    console.log("\nExpecting one of:");
    for (const event of game.validEvents(playerId)) {
      console.log(formatEvent(event, playerId, deck));
    }

    throw new CliUnoError("Please play one of the valid options\n");
  }

  // ─── User Is Playing A Card ──────────────────────────────────────────
  const index = parseInt(answer);
  if (!isNaN(index)) {
    if (index == -1) process.exit(1);
    else if (index < 0 || index >= deck.length) {
      throw new CliUnoError(
        `Card index must be equal to or between 0 and ${deck.length - 1}`
      );
    }

    return game.play(playerId, deck[index]);
  }

  // ─── User Is Choosing A Color ────────────────────────────────────────
  if (includes(cardColor.options, answer)) {
    return game.chooseColor(playerId, answer);
  }

  // ─── User Is Drawing / Passing / Calling Bluff ───────────────────────
  if (answer == "draw")
    return console.log(colors.cyan("!!"), game.draw(playerId).formatted, "\n");
  if (answer == "pass")
    return console.log(colors.cyan("!!"), game.pass(playerId).formatted, "\n");

  if (answer == "call-bluff")
    return console.log(colors.cyan("!!"), game.callBluff(playerId), "\n");

  throw new CliUnoError("Invalid input!");
}

function aiTurn(
  game: Game,
  aiId: string,
  deck: Card[],
  hasDrawn = false
): void {
  let cardToPlay: Card | undefined;
  const [lastEvent, secondLastEvent] = game.lastTwoNonInfoEvents();
  const expected = game.expectedCard();

  // if the last card is a +4, randomly choose between draw/call bluff
  if (
    secondLastEvent &&
    secondLastEvent.type == "card_played" &&
    secondLastEvent.card.type == "plus-four"
  ) {
    const action = randomFrom(["draw", "callBluff"] as const);
    const status = game[action](aiId);
    linedLog(`AI turn: ${action == "draw" ? "is " : ""}${status.formatted}`);
    return;
  }

  // if the last card is a +2, play +2 if we have any, else draw
  if (lastEvent.type == "card_played" && lastEvent.card.type == "plus-two") {
    const plusTwoCard = deck.find((c) => c.type == "plus-two");
    if (plusTwoCard) {
      linedLog(`AI played ${colors[plusTwoCard.color!](plusTwoCard.type)}`);
      game.play(aiId, plusTwoCard);
    } else {
      const status = game.draw(aiId);
      linedLog(`AI is ${status.formatted}`);
    }

    return;
  }

  // try to find a card with the same type
  if (expected.expectedType) {
    cardToPlay = deck.find((card) => card.type == expected.expectedType);
  }

  // try to find a card of the same color if the last card is not a special card
  if (!cardToPlay && expected.expectedColor) {
    cardToPlay = deck.find((card) => card.color == expected.expectedColor);
  }

  // if we don't have a playable card, or if we randomly decide
  // to bluff, play a color switching card if we have one.
  if (deck.length > 1 && (!cardToPlay || randomFrom([true, false]))) {
    const colorSwitchingCard = deck.find((c) =>
      includes(colorSwitchingScs.options, c.type)
    );
    if (colorSwitchingCard) {
      const cardsOfColor = deck.reduce((acc, curr) => {
        const color = curr.color;
        if (color) {
          acc[color] ||= 0;
          acc[color]++;
        }
        return acc;
      }, {} as Record<CardColor, number>);

      const switchColor = Object.entries(cardsOfColor).sort(
        ([, a], [, b]) => b - a
      )[0][0] as CardColor;

      const { expectedColor } = expected;
      if (!expectedColor || expectedColor != switchColor) {
        game.play(aiId, colorSwitchingCard);
        game.chooseColor(aiId, switchColor);
        linedLog(
          `AI played ${colorSwitchingCard.type} and changed color to ${switchColor}`
        );
        return;
      }
    }
  }

  if (cardToPlay) {
    if (
      deck.length == 1 &&
      includes(colorSwitchingScs.options, cardToPlay.type)
    ) {
      cardToPlay = undefined;
    }
  }

  if (!cardToPlay) {
    if (hasDrawn) {
      // if we get no playable cards even after a draw, pass
      if (!cardToPlay && hasDrawn) {
        game.pass(aiId);
        linedLog("AI passed");
      }
    } else {
      // if the AI has no playable cards, draw a card
      const status = game.draw(aiId);
      linedLog(`AI is ${status.formatted}`);
      return aiTurn(game, aiId, game.handOf(aiId), true);
    }
  } else {
    linedLog(
      `AI played ${colors[cardToPlay.color ?? "white"](cardToPlay.type)}`
    );
    game.play(aiId, cardToPlay);
  }
}

main();

// ─── Util Functions ──────────────────────────────────────────────────────────
function linedLog(v: string) {
  console.log(
    colors.bgBlack("───────────────────────────────────────────────────────")
  );
  console.log(v);
  console.log(
    colors.bgBlack("───────────────────────────────────────────────────────")
  );
  console.log("");
}

function formatEvent(
  event: GameEvent,
  playerId: string | undefined,
  deck: Card[],
  customBulletSuffix = "",
  specific = false
) {
  const bullet = colors.bold(colors.cyan("*")) + customBulletSuffix;

  if (event.type == "draw") {
    return bullet + " a draw";
  } else if (event.type == "pass") {
    return bullet + " a pass";
  } else if (event.type == "bluff_called") {
    return bullet + " a bluff call";
  } else if (event.type == "choose-color") {
    return (
      bullet +
      " a color change" +
      (specific ? ` to ${colors[event.color](event.color)}` : "")
    );
  } else {
    const card = event.card;
    const cardColor = event.card.color ?? "white";
    const index =
      playerId &&
      deck.findIndex((c) => c.type == card.type && c.color == card.color);

    return `${bullet}${
      !specific && index && index >= 0 ? ` [${index}]` : ""
    } ${colors[cardColor](card.type)}`;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function lastCardPlay(game: Game) {
  return game.state.events
    .reverse()
    .find((e) => e.type == "card_played")! as CardPlayedEvent;
}
