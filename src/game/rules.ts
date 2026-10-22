import {
  RANK_VALUE,
  TEAM_OF,
  cardStrength,
  compareStrength,
  isTrump,
  uniqueIds,
} from "./cards";
import type {
  Card,
  PlayerId,
  Rank,
  Suit,
  ThrowCheck,
  TrickPlay,
} from "./types";

export interface Validation {
  ok: boolean;
  reason: string;
}

export function bidSuitOptions(
  hand: Card[],
  level: Rank,
  allowJoker: boolean,
): (Suit | null)[] {
  const suits: (Suit | null)[] = [...new Set(
    hand
      .filter((card) => card.rank === level && card.suit !== null)
      .map((card) => card.suit!),
  )];
  if (allowJoker && hand.some((card) => card.rank === "BJ" || card.rank === "SJ")) {
    suits.push(null);
  }
  return suits;
}

export function checkThrow(
  cards: Card[],
  hands: Record<PlayerId, Card[]>,
  leader: PlayerId,
  level: Rank,
  trumpSuit: Suit | null,
): ThrowCheck {
  if (cards.length < 2) {
    return { valid: false, cards, reason: "甩牌至少需要两张" };
  }
  if (!uniqueIds(cards)) {
    return { valid: false, cards, reason: "同一张牌不能重复选择" };
  }
  if (cards.some((card) => card.suit === null)) {
    return { valid: false, cards, reason: "大小王不能参与甩牌" };
  }
  if (new Set(cards.map((card) => card.suit)).size !== 1) {
    return { valid: false, cards, reason: "甩牌必须来自同一花色" };
  }
  if (cards.some((card) => isTrump(card, level, trumpSuit))) {
    return { valid: false, cards, reason: "主牌不能甩牌" };
  }

  const suit = cards[0].suit;
  const smallest = Math.min(...cards.map((card) => RANK_VALUE[card.rank as Rank]));
  for (const [player, hand] of Object.entries(hands) as [PlayerId, Card[]][]) {
    if (player === leader) continue;
    const canBeat = hand.some(
      (card) =>
        card.suit === suit &&
        !isTrump(card, level, trumpSuit) &&
        RANK_VALUE[card.rank as Rank] > smallest,
    );
    if (canBeat) {
      const failedCard = [...cards].sort(
        (a, b) => RANK_VALUE[a.rank as Rank] - RANK_VALUE[b.rank as Rank],
      )[0];
      return {
        valid: false,
        cards: [failedCard],
        reason: `甩牌失败，只保留最小的${failedCardRankName(failedCard)}`,
      };
    }
  }
  return { valid: true, cards, reason: "甩牌成功" };
}

function failedCardRankName(card: Card): string {
  return card.rank;
}

export function validateLeadSelection(
  cards: Card[],
  hand: Card[],
  level: Rank,
  trumpSuit: Suit | null,
): Validation {
  if (cards.length === 0) return { ok: false, reason: "请至少选择一张牌" };
  if (!uniqueIds(cards)) return { ok: false, reason: "存在重复选择的牌" };
  if (cards.some((card) => !hand.some((held) => held.id === card.id))) {
    return { ok: false, reason: "所选牌不在手牌中" };
  }
  if (cards.length === 1) return { ok: true, reason: "" };
  if (new Set(cards.map((card) => card.suit)).size !== 1) {
    return { ok: false, reason: "多张首牌必须来自同一花色" };
  }
  if (cards.some((card) => isTrump(card, level, trumpSuit))) {
    return { ok: false, reason: "主牌不能甩，只能单张出主牌" };
  }
  return { ok: true, reason: "" };
}

export function validateFollowSelection(
  cards: Card[],
  hand: Card[],
  lead: Card[],
  level: Rank,
  trumpSuit: Suit | null,
): Validation {
  if (!uniqueIds(cards)) return { ok: false, reason: "存在重复选择的牌" };
  if (cards.some((card) => !hand.some((held) => held.id === card.id))) {
    return { ok: false, reason: "所选牌不在手牌中" };
  }
  if (cards.length !== lead.length) {
    return { ok: false, reason: `必须跟出 ${lead.length} 张牌` };
  }

  if (lead.length === 1) {
    const leadCard = lead[0];
    if (isTrump(leadCard, level, trumpSuit)) {
      const mustTrump = hand.some((card) => isTrump(card, level, trumpSuit));
      if (mustTrump && !isTrump(cards[0], level, trumpSuit)) {
        return { ok: false, reason: "手中有主牌，必须跟主牌" };
      }
    } else {
      const leadSuit = leadCard.suit;
      const canFollow = hand.some(
        (card) =>
          !isTrump(card, level, trumpSuit) && card.suit === leadSuit,
      );
      if (canFollow) {
        const card = cards[0];
        if (isTrump(card, level, trumpSuit) || card.suit !== leadSuit) {
          return { ok: false, reason: "手中有首牌花色，必须跟该花色" };
        }
      }
    }
    return { ok: true, reason: "" };
  }

  const leadSuit = lead[0].suit;
  const sameSuit = hand.filter(
    (card) =>
      !isTrump(card, level, trumpSuit) && card.suit === leadSuit,
  );
  if (sameSuit.length >= cards.length) {
    if (cards.some((card) => isTrump(card, level, trumpSuit) || card.suit !== leadSuit)) {
      return { ok: false, reason: "首牌花色足够，必须全部跟该花色" };
    }
  } else if (sameSuit.length > 0) {
    const selectedIds = new Set(cards.map((card) => card.id));
    if (sameSuit.some((card) => !selectedIds.has(card.id))) {
      return { ok: false, reason: "必须出掉手中剩余的首牌花色" };
    }
  }
  return { ok: true, reason: "" };
}

export function determineCurrentTrickWinner(
  plays: TrickPlay[],
  level: Rank,
  trumpSuit: Suit | null,
): PlayerId {
  if (plays.length === 0) throw new Error("还没有玩家出牌");
  const lead = plays[0];
  const leadTrumps = lead.cards.map((card) => isTrump(card, level, trumpSuit));

  if (lead.cards.length === 1) {
    const leadingTrump = leadTrumps[0];
    let winner = lead.player;
    let best = [-1, -1] as [number, number];
    for (const play of plays) {
      const card = play.cards[0];
      const eligible = leadingTrump
        ? isTrump(card, level, trumpSuit)
        : !isTrump(card, level, trumpSuit) && card.suit === lead.cards[0].suit;
      if (!eligible) continue;
      const strength = cardStrength(card, level, trumpSuit);
      if (compareStrength(strength, best) > 0) {
        winner = play.player;
        best = [strength[0], strength[1]];
      }
    }
    return winner;
  }

  let winner = lead.player;
  let best = [-1, -1] as [number, number];
  for (const play of plays.slice(1)) {
    if (!play.cards.every((card) => isTrump(card, level, trumpSuit))) continue;
    const groupBest = play.cards
      .map((card) => cardStrength(card, level, trumpSuit))
      .reduce((max, value) => (compareStrength(value, max) > 0 ? value : max));
    if (compareStrength(groupBest, best) > 0) {
      winner = play.player;
      best = [groupBest[0], groupBest[1]];
    }
  }
  return winner;
}

export function determineTrickWinner(
  plays: TrickPlay[],
  level: Rank,
  trumpSuit: Suit | null,
): PlayerId {
  if (plays.length !== 4) throw new Error("一墩必须有四组出牌");
  return determineCurrentTrickWinner(plays, level, trumpSuit);
}

export function teamIsOpponent(
  player: PlayerId,
  mainTeam: "blue" | "red",
): boolean {
  return TEAM_OF[player] !== mainTeam;
}

export function opponentScoresTrick(
  isFinalTrick: boolean,
  winner: PlayerId,
  mainTeam: "blue" | "red",
): boolean {
  return !isFinalTrick && TEAM_OF[winner] !== mainTeam;
}
