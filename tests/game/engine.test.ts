import { describe, expect, it } from "vitest";
import {
  HUMAN_PLAYER,
  DEFAULT_PLAYER_NAMES,
  RANKS,
  cardStrength,
  createDeck,
  isJoker,
} from "../../src/game/cards";
import { chooseAIDiscard, chooseAIPlay } from "../../src/game/ai";
import { GameSession } from "../../src/game/engine";
import {
  checkThrow,
  determineCurrentTrickWinner,
  determineTrickWinner,
  opponentScoresTrick,
  validateFollowSelection,
} from "../../src/game/rules";
import { decideSettlement } from "../../src/game/settlement";
import type { Card, PlayerId, RoundState, TrickPlay } from "../../src/game/types";

function card(id: string): Card {
  const found = createDeck().find((item) => item.id === id);
  if (!found) throw new Error(`未知牌: ${id}`);
  return found;
}

function emptyHands(): Record<PlayerId, Card[]> {
  return { blue1: [], red2: [], blue2: [], red1: [] };
}

describe("升级牌组和牌力", () => {
  it("使用 54 张唯一牌", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(54);
    expect(new Set(deck.map((item) => item.id)).size).toBe(54);
  });

  it("令花色级牌位于王和其他级牌之间", () => {
    const order = ["JOKER_BIG", "JOKER_SMALL", "H7", "S7", "HA", "HK", "SA"];
    const values = order.map((id) => cardStrength(card(id), "7", "H"));
    for (let index = 0; index < values.length - 1; index += 1) {
      expect(values[index][0]).toBeGreaterThanOrEqual(values[index + 1][0]);
      if (values[index][0] === values[index + 1][0]) {
        expect(values[index][1]).toBeGreaterThan(values[index + 1][1]);
      }
    }
  });

  it("无主时四种花色级牌仍然大于杂牌", () => {
    const levelCards = ["H7", "D7", "C7", "S7"].map((id) => cardStrength(card(id), "7", null));
    const ace = cardStrength(card("SA"), "7", null);
    expect(levelCards.every((value) => value[0] > ace[0])).toBe(true);
    expect(new Set(levelCards.map((value) => `${value[0]}:${value[1]}`)).size).toBe(1);
  });
});

describe("甩牌和跟牌", () => {
  it("队友持有更大同花色牌时甩牌失败，只保留最小牌", () => {
    const hands = emptyHands();
    hands.blue1 = [card("SA"), card("SQ")];
    hands.blue2 = [card("SK")];
    hands.red1 = [card("H3")];
    hands.red2 = [card("H4")];
    const result = checkThrow([card("SA"), card("SQ")], hands, "blue1", "7", "H");
    expect(result.valid).toBe(false);
    expect(result.cards.map((item) => item.id)).toEqual(["SQ"]);
  });

  it("其他人都压不过时允许甩牌", () => {
    const hands = emptyHands();
    hands.blue1 = [card("SA"), card("SQ")];
    hands.blue2 = [card("S10")];
    hands.red1 = [card("H3")];
    hands.red2 = [card("H4")];
    expect(checkThrow([card("SA"), card("SQ")], hands, "blue1", "7", "H").valid).toBe(true);
  });

  it("跟甩牌不足时必须出光同花色，再补其他牌", () => {
    const hand = [card("S5"), card("H3"), card("H4")];
    const wrong = validateFollowSelection(
      [card("H3"), card("H4")],
      hand,
      [card("SA"), card("SK")],
      "7",
      "H",
    );
    const right = validateFollowSelection(
      [card("S5"), card("H3")],
      hand,
      [card("SA"), card("SK")],
      "7",
      "H",
    );
    expect(wrong.ok).toBe(false);
    expect(right.ok).toBe(true);
  });

  it("只有整组主牌才能压甩牌", () => {
    const plays: TrickPlay[] = [
      { player: "blue1", cards: [card("SA"), card("SK")] },
      { player: "red2", cards: [card("H2"), card("H3")] },
      { player: "blue2", cards: [card("D4"), card("H4")] },
      { player: "red1", cards: [card("C3")] },
    ];
    expect(determineTrickWinner(plays, "7", "H")).toBe("red2");
  });

  it("第四家出牌前也能判断当前最大的一家", () => {
    const plays: TrickPlay[] = [
      { player: "blue1", cards: [card("S9")] },
      { player: "red2", cards: [card("S10")] },
      { player: "blue2", cards: [card("S8")] },
    ];
    expect(determineCurrentTrickWinner(plays, "7", "H")).toBe("red2");
  });

  it("最后一墩只亮牌，旁家不吃分", () => {
    expect(opponentScoresTrick(false, "red1", "blue")).toBe(true);
    expect(opponentScoresTrick(true, "red1", "blue")).toBe(false);
    expect(opponentScoresTrick(false, "blue2", "blue")).toBe(false);
  });
});

function assertCardConservation(round: RoundState): void {
  const currentTrick = round.trickPlays.flatMap((play) => play.cards);
  const allCards = [
    ...Object.values(round.hands).flat(),
    ...round.discard,
    ...round.playedCards,
    ...currentTrick,
  ];
  expect(new Set(allCards.map((item) => item.id)).size).toBe(54);
  expect(allCards).toHaveLength(54);
}

function driveRound(session: GameSession): RoundState {
  let guard = 0;
  while (session.state.round!.phase !== "roundEnd") {
    guard += 1;
    if (guard > 5000) throw new Error("牌局没有正常结束");
    const round = session.state.round!;
    switch (round.phase) {
      case "coin":
        session.resolveCoin();
        break;
      case "dealing": {
        const options = session.getHumanCallOptions();
        if (options.length > 0) session.humanCall(options[0]);
        else session.dealNext();
        break;
      }
      case "redeal":
        session.redealRound();
        break;
      case "revolt":
        session.respondToRevolt(false);
        break;
      case "chooseBottom":
        session.chooseBottom(true);
        break;
      case "burying":
        expect(round.bottomDisplay.length).toBe(round.bid ? 6 : 5);
        if (round.bottomPlayer === HUMAN_PLAYER) {
          session.buryHuman(
            chooseAIDiscard(
              round.hands[HUMAN_PLAYER],
              round.level!,
              null,
              "normal",
              Math.random,
            ),
          );
        } else {
          session.autoBury();
        }
        break;
      case "reveal":
        session.beginPlay();
        break;
      case "playing": {
        const sizes = new Set(Object.values(round.hands).map((hand) => hand.length));
        if (round.trickPlays.length === 0) expect(sizes.size).toBe(1);
        assertCardConservation(round);
        if (round.currentPlayer === HUMAN_PLAYER) {
          session.playHuman(chooseAIPlay(round, HUMAN_PLAYER, Math.random, "normal"));
        } else {
          session.autoPlay();
        }
        break;
      }
      case "trickReview":
        expect(round.trickPlays).toHaveLength(4);
        expect(round.lastTrick?.plays).toHaveLength(4);
        assertCardConservation(round);
        session.continueAfterTrick();
        break;
      case "finalReveal":
        expect(round.lastTrick).not.toBeNull();
        assertCardConservation(round);
        session.finishFinalReveal();
        break;
      default:
        throw new Error(`意外阶段: ${round.phase}`);
    }
  }
  assertCardConservation(session.state.round!);
  return session.state.round!;
}

function driveManagedRound(session: GameSession): RoundState {
  let guard = 0;
  while (session.state.round!.phase !== "roundEnd") {
    guard += 1;
    if (guard > 5000) throw new Error("托管牌局没有正常结束");
    const round = session.state.round!;
    switch (round.phase) {
      case "coin":
        session.resolveCoin();
        break;
      case "dealing":
        if (session.getHumanCallOptions().length > 0) session.autoHumanBid();
        else session.dealNext();
        break;
      case "redeal":
        session.redealRound();
        break;
      case "revolt":
        session.respondToRevolt(false);
        break;
      case "chooseBottom":
        session.chooseBottom(false);
        break;
      case "burying":
        if (round.bottomPlayer === HUMAN_PLAYER) session.autoBuryHuman();
        else session.autoBury();
        break;
      case "reveal":
        session.beginPlay();
        break;
      case "playing":
        if (round.currentPlayer === HUMAN_PLAYER) session.autoPlayHuman();
        else session.autoPlay();
        break;
      case "trickReview":
        session.continueAfterTrick();
        break;
      case "finalReveal":
        session.finishFinalReveal();
        break;
      default:
        throw new Error(`意外阶段: ${round.phase}`);
    }
  }
  assertCardConservation(session.state.round!);
  return session.state.round!;
}

describe("完整对局状态机", () => {
  it("每局开始先进入抛硬币阶段", () => {
    const session = new GameSession(77);
    expect(session.state.round!.phase).toBe("coin");
    expect(session.state.round!.coinFlip?.reason).toBe("dealer");
    session.resolveCoin();
    expect(session.state.round!.phase).toBe("dealing");
  });

  it("40 分抢报以及 45/65 分升级边界正确", () => {
    const cases = [
      { points: 0, winner: "blue1", team: "blue", amount: 2, shootout: false },
      { points: 0, winner: "red1", team: null, amount: 0, shootout: true },
      { points: 35, winner: "red1", team: "blue", amount: 1, shootout: false },
      { points: 40, winner: "blue1", team: null, amount: 0, shootout: true },
      { points: 45, winner: "blue1", team: "red", amount: 1, shootout: false },
      { points: 65, winner: "blue1", team: "red", amount: 2, shootout: false },
    ] as const;
    for (const item of cases) {
      const result = decideSettlement("blue", item.points, item.winner);
      expect(result.upgradeTeam).toBe(item.team);
      expect(result.upgradeAmount).toBe(item.amount);
      expect(result.nextShootout).toBe(item.shootout);
    }
    expect(decideSettlement("blue", 45, "blue1").reason).toContain("积分优先");
    expect(decideSettlement("blue", 40, "blue1").reason).toContain("40 分");
  });

  it("可以连续完成 20 局并保持手牌、牌张和等级状态有效", () => {
    const session = new GameSession(20261022);
    for (let roundIndex = 0; roundIndex < 20; roundIndex += 1) {
      const finished = driveRound(session);
      expect(finished.roundResult).not.toBeNull();
      expect(Object.values(session.state.levels).every((level) => RANKS.includes(level))).toBe(true);
      expect(finished.roundResult!.opponentPoints).toBeGreaterThanOrEqual(0);
      expect(finished.roundResult!.opponentPoints).toBeLessThanOrEqual(100);
      if (roundIndex < 19) session.nextRound();
    }
  });

  it("AI 在任意阶段都只提交合法跟牌", () => {
    const session = new GameSession(314159);
    let guard = 0;
    while (session.state.round!.phase !== "playing" && guard < 500) {
      guard += 1;
      const round = session.state.round!;
      if (round.phase === "coin") session.resolveCoin();
      else if (round.phase === "dealing") session.dealNext();
      else if (round.phase === "redeal") session.redealRound();
      else if (round.phase === "revolt") session.respondToRevolt(false);
      else if (round.phase === "chooseBottom") session.chooseBottom(false);
      else if (round.phase === "burying") {
        if (round.bottomPlayer === HUMAN_PLAYER) {
          session.buryHuman(
            chooseAIDiscard(
              round.hands[HUMAN_PLAYER],
              round.level!,
              null,
              "normal",
              Math.random,
            ),
          );
        } else session.autoBury();
      } else if (round.phase === "reveal") session.beginPlay();
    }
    expect(session.state.round!.phase).toBe("playing");
    const round = session.state.round!;
    expect(DEFAULT_PLAYER_NAMES[HUMAN_PLAYER]).toBe("青岚");
    expect(round.trumpKnown).toBe(true);
  });

  it("玩家叫主后只向玩家投影自己选择的令花色", () => {
    let calledWith: string | null | undefined;
    let session: GameSession | undefined;
    for (let seed = 1; seed < 1000 && calledWith === undefined; seed += 1) {
      session = new GameSession(seed);
      for (let guard = 0; guard < 48; guard += 1) {
        const round = session.state.round!;
        if (round.phase === "coin") {
          session.resolveCoin();
          continue;
        }
        if (round.phase !== "dealing" || round.bid) break;
        const options = session.getHumanCallOptions();
        if (options.length > 0) {
          calledWith = options[0];
          expect(session.humanCall(options[0])).toBe(true);
          break;
        }
        session.dealNext();
      }
    }
    if (calledWith === undefined || !session) {
      throw new Error("没有找到玩家可以先叫主的测试牌局");
    }
    expect(session.getKnownTrumpForHuman()).toBe(calledWith);
    expect(session.state.round!.trumpKnown).toBe(false);
  });

  it("AI 叫主时公开姓名，但不提前公开令花色", () => {
    let session: GameSession | undefined;
    let bidder: string | undefined;
    for (let seed = 1; seed < 1000 && !bidder; seed += 1) {
      const probe = new GameSession(seed);
      for (let guard = 0; guard < 48; guard += 1) {
        const round = probe.state.round!;
        if (round.phase === "coin") {
          probe.resolveCoin();
          continue;
        }
        if (round.phase !== "dealing") break;
        if (round.bid && round.bid.caller !== HUMAN_PLAYER) {
          session = probe;
          bidder = round.bid.caller;
          break;
        }
        if (round.bid) break;
        probe.dealNext();
      }
    }
    if (!session || !bidder) throw new Error("没有找到 AI 先叫主的测试牌局");
    const round = session.state.round!;
    expect(round.message).toContain(session.playerNames[bidder as PlayerId]);
    expect(round.message).toContain("叫主");
    expect(round.events.at(-1)).toContain("叫主");
    expect(round.trumpKnown).toBe(false);
    expect(session.getKnownTrumpForHuman()).toBeUndefined();
    if (round.bid!.trumpSuit === null) {
      expect(isJoker(round.bid!.calledCard)).toBe(true);
    } else {
      expect(round.bid!.calledCard.suit).toBe(round.bid!.trumpSuit);
      expect(round.bid!.calledCard.rank).toBe(round.bid!.level);
    }
  });

  it("200 个独立随机牌局都能从发牌走到结算", () => {
    for (let gameIndex = 0; gameIndex < 200; gameIndex += 1) {
      const session = new GameSession(900_000 + gameIndex);
      const finished = driveRound(session);
      expect(finished.phase).toBe("roundEnd");
      expect(finished.roundResult).not.toBeNull();
      assertCardConservation(finished);
    }
  });

  it("AI 托管方法可以独立完成连续牌局", () => {
    const session = new GameSession(8080);
    for (let roundIndex = 0; roundIndex < 30; roundIndex += 1) {
      const finished = driveManagedRound(session);
      expect(finished.roundResult).not.toBeNull();
      expect(finished.events.some((event) => event.includes("自动出完剩余牌"))).toBe(true);
      if (roundIndex < 29) session.nextRound();
    }
  });

  it("可以自定义玩家名称并同步到牌局消息", () => {
    const session = new GameSession(6060);
    session.setPlayerNames({
      blue1: "阿青",
      blue2: "小舟",
      red1: "赤风",
      red2: "晚霞",
    });
    expect(session.playerNames).toEqual({
      blue1: "阿青",
      blue2: "小舟",
      red1: "赤风",
      red2: "晚霞",
    });
    session.restart(6061);
    session.resolveCoin();
    expect(session.state.round!.events.join(" ")).toMatch(/阿青|小舟|赤风|晚霞/);
  });

  it("高级 AI 的蒙特卡洛决策能完成连续牌局", () => {
    const session = new GameSession(424242);
    session.setAIDifficulties({
      blue1: "hard",
      blue2: "hard",
      red1: "hard",
      red2: "hard",
    });
    for (let roundIndex = 0; roundIndex < 10; roundIndex += 1) {
      expect(driveManagedRound(session).roundResult).not.toBeNull();
      if (roundIndex < 9) session.nextRound();
    }
  });

  it("出牌建议会返回当前玩家可提交的合法牌组", () => {
    const session = new GameSession(515151);
    let guard = 0;
    while (
      !(
        session.state.round!.phase === "playing" &&
        session.state.round!.currentPlayer === HUMAN_PLAYER
      )
    ) {
      guard += 1;
      if (guard > 2000) throw new Error("没有进入玩家出牌回合");
      const round = session.state.round!;
      if (round.phase === "coin") session.resolveCoin();
      else if (round.phase === "dealing") {
        if (session.getHumanCallOptions().length > 0) session.autoHumanBid();
        else session.dealNext();
      } else if (round.phase === "redeal") session.redealRound();
      else if (round.phase === "revolt") session.respondToRevolt(false);
      else if (round.phase === "chooseBottom") session.chooseBottom(false);
      else if (round.phase === "burying") {
        if (round.bottomPlayer === HUMAN_PLAYER) session.autoBuryHuman();
        else session.autoBury();
      } else if (round.phase === "reveal") session.beginPlay();
      else if (round.phase === "playing") session.autoPlay();
      else if (round.phase === "trickReview") session.continueAfterTrick();
      else if (round.phase === "finalReveal") session.finishFinalReveal();
    }
    const suggestion = session.suggestHumanPlay();
    expect(suggestion).not.toBeNull();
    expect(session.inspectHumanSelection(suggestion!).ok).toBe(true);
  });
});
