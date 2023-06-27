import * as colors from "https://deno.land/std@0.191.0/fmt/colors.ts";
import {
  Card,
  CardColor,
  CardPlayedEvent,
  colorSwitchingScs,
} from "../types.ts";
import { Game } from "../game.ts";
import { randomInt } from "node:crypto";
import { UnocabError } from "../errors.ts";
import { includes } from "../utils.ts";

export function randomFrom<T>(arr: T[] | readonly T[]): T {
  return arr[randomInt(0, arr.length)];
}

const aiOneId = crypto.randomUUID();
const aiTwoId = crypto.randomUUID();

const disableSleep =
  (await Deno.permissions.query({ name: "env" })).state == "granted"
    ? Deno.env.get("DS") == "1"
    : false;

async function main() {
  console.clear();

  const game = new Game({ shorthandMode: true });
  game.join(aiOneId, aiTwoId);

  const firstCard = lastCardPlay(game).card;
  const firstCardColor = firstCard.color ?? "white";

  linedLog(`First card: ${colors[firstCardColor](firstCard.type)}`);
  let turn = 1;

  while (true) {
    try {
      const gameEnded = game.hasEnded();
      if (gameEnded) {
        console.log("Game ended!");
        console.log(`${gameEnded.loser == aiOneId ? "AI 2" : "AI 1"} won!`);
        Deno.exit(0);
      }

      console.log(
        `${colors.bold("turn")}: ${turn} | ${colors.bold("AI 1 card count")}: ${
          game.handOf(aiOneId).length
        } | ${colors.bold("AI 2 card count")}: ${
          game.handOf(aiTwoId).length
        } | ${colors.bold("deck card count")}: ${
          game.state.cache.deck.length
        }\n`
      );

      const apId = game.activePlayer();
      const offset = 100; // 400;

      if (apId == aiOneId) {
        !disableSleep &&
          (await sleep(randomFrom([250, 300, 180, 220]) + offset));
        aiTurn(game, apId, game.handOf(apId));
      } else {
        !disableSleep &&
          (await sleep(randomFrom([250, 300, 180, 220]) + offset));
        aiTurn(game, apId, game.handOf(apId));
      }

      turn++;
    } catch (e) {
      if (e instanceof UnocabError) {
        console.log(`\n${colors.red("ERR")} ${e.message}`);
      } else throw e;
    }
  }
}

function aiTurn(
  game: Game<true>,
  playerId: string,
  deck: Card[],
  hasDrawn = false
): void {
  let cardToPlay: Card | undefined;

  const [lastEvent, secondLastEvent] = game.lastTwoNonInfoEvents();
  const expected = game.expectedCard();
  const isAiOne = playerId == aiOneId;
  const aiName = isAiOne ? "AI 1" : "AI 2";

  // if the last card is a +4, randomly choose between draw/call bluff
  if (
    secondLastEvent &&
    secondLastEvent.type == "card_played" &&
    secondLastEvent.card.type == "plus-four"
  ) {
    const action = randomFrom(["draw", "callBluff"] as const);
    const status = game[action](playerId);
    linedLog(
      `${aiName} turn: ${action == "draw" ? "is " : ""}${status.formatted}`,
      isAiOne
    );
    return;
  }

  // if the last card is a +2, play +2 if we have any, else draw
  if (lastEvent.type == "card_played" && lastEvent.card.type == "plus-two") {
    const plusTwoCard = deck.find((c) => c.type == "plus-two");
    if (plusTwoCard) {
      linedLog(
        `${aiName} played ${colors[plusTwoCard.color!](plusTwoCard.type)}`,
        isAiOne
      );
      game.play(playerId, plusTwoCard);
    } else {
      const status = game.draw(playerId);
      linedLog(`${aiName} is ${status.formatted}`, isAiOne);
    }

    return;
  }

  // try to find a card with the same type
  if (expected.expectedType) {
    cardToPlay = deck.find((card) => card.type == expected.expectedType);
  }

  // try to find a card of the same color
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
      // get the color we have the most cards of
      const cardsOfColor = deck.reduce((acc, curr) => {
        const color = curr.color;
        if (color) {
          acc[color] ||= 0;
          acc[color]++;
        }
        return acc;
      }, {} as Record<CardColor, number>);

      const switchColor = (Object.entries(cardsOfColor).sort(
        ([, a], [, b]) => b - a
      )[0]?.[0] ?? "red") as CardColor;

      const { expectedColor } = expected;
      if (!expectedColor || expectedColor != switchColor) {
        game.play(playerId, colorSwitchingCard);
        game.chooseColor(playerId, switchColor);
        linedLog(
          `${aiName} played ${colorSwitchingCard.type} and changed color to ${switchColor}`,
          isAiOne
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
        game.pass(playerId);
        linedLog(`${aiName} passed`, isAiOne);
      }
    } else {
      // if the AI has no playable cards, draw a card
      const status = game.draw(playerId);
      linedLog(`${aiName} is ${status.formatted}`, isAiOne);
      return aiTurn(game, playerId, game.handOf(playerId), true);
    }
  } else {
    linedLog(
      `${aiName} played ${colors[cardToPlay.color ?? "white"](
        cardToPlay.type
      )}`,
      isAiOne
    );
    game.play(playerId, cardToPlay);
  }
}

main();

// ─── Util Functions ──────────────────────────────────────────────────────────
function linedLog(v: string, isAiOne?: boolean) {
  const fn: keyof typeof colors =
    isAiOne == undefined ? "bgBlack" : isAiOne ? "bgRed" : "bgBrightBlack";

  console.log(
    colors[fn]("───────────────────────────────────────────────────────")
  );
  console.log(v);
  console.log(
    colors[fn]("───────────────────────────────────────────────────────")
  );
  console.log("");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function lastCardPlay(game: Game<true>) {
  return game.state.events
    .reverse()
    .find((e) => e.type == "card_played")! as CardPlayedEvent;
}
