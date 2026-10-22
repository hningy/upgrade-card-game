import type {
  AIDifficulty,
  Card,
  CardRank,
  PlayerId,
  Rank,
  Suit,
  Team,
} from "./types";

export const SUITS: Suit[] = ["H", "D", "C", "S"];
export const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
export const PLAYERS: PlayerId[] = ["blue1", "red2", "blue2", "red1"];
export const HUMAN_PLAYER: PlayerId = "blue1";

export const DEFAULT_PLAYER_NAMES: Record<PlayerId, string> = {
  blue1: "青岚",
  blue2: "云舟",
  red2: "丹霞",
  red1: "赤羽",
};

export const DEFAULT_AI_DIFFICULTIES: Record<PlayerId, AIDifficulty> = {
  blue1: "normal",
  blue2: "normal",
  red1: "normal",
  red2: "normal",
};

export const TEAM_OF: Record<PlayerId, Team> = {
  blue1: "blue",
  blue2: "blue",
  red1: "red",
  red2: "red",
};

export const PARTNER_OF: Record<PlayerId, PlayerId> = {
  blue1: "blue2",
  blue2: "blue1",
  red1: "red2",
  red2: "red1",
};

export const TEAM_PLAYERS: Record<Team, [PlayerId, PlayerId]> = {
  blue: ["blue1", "blue2"],
  red: ["red1", "red2"],
};

export const OTHER_TEAM: Record<Team, Team> = {
  blue: "red",
  red: "blue",
};

export const SUIT_NAMES: Record<Suit, string> = {
  H: "红桃",
  D: "方片",
  C: "梅花",
  S: "黑桃",
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  H: "♥",
  D: "♦",
  C: "♣",
  S: "♠",
};

export const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((rank, index) => [rank, index + 2]),
) as Record<Rank, number>;

export const SCORE_VALUE: Partial<Record<CardRank, number>> = {
  K: 10,
  "10": 10,
  "5": 5,
};

export function createDeck(): Card[] {
  const deck: Card[] = SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${suit}${rank}`,
      suit,
      rank,
    })),
  );
  deck.push({ id: "JOKER_BIG", suit: null, rank: "BJ" });
  deck.push({ id: "JOKER_SMALL", suit: null, rank: "SJ" });
  return deck;
}

export function isJoker(card: Card): boolean {
  return card.rank === "BJ" || card.rank === "SJ";
}

export function cardScore(card: Card): number {
  return SCORE_VALUE[card.rank] ?? 0;
}

export function handScore(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardScore(card), 0);
}

export function cardName(card: Card): string {
  if (card.rank === "BJ") return "大王";
  if (card.rank === "SJ") return "小王";
  return `${SUIT_NAMES[card.suit!]}${card.rank}`;
}

export function isTrump(card: Card, level: Rank | null, trumpSuit: Suit | null): boolean {
  if (isJoker(card)) return true;
  if (level && card.rank === level) return true;
  return trumpSuit !== null && card.suit === trumpSuit;
}

export type Strength = readonly [number, number];

export function cardStrength(
  card: Card,
  level: Rank | null,
  trumpSuit: Suit | null,
): Strength {
  if (card.rank === "BJ") return [6, 0];
  if (card.rank === "SJ") return [5, 0];
  if (level && card.rank === level) {
    return trumpSuit !== null && card.suit === trumpSuit ? [4, 0] : [3, 0];
  }
  if (trumpSuit !== null && card.suit === trumpSuit) {
    return [2, RANK_VALUE[card.rank as Rank]];
  }
  return [1, RANK_VALUE[card.rank as Rank]];
}

export function compareStrength(a: Strength, b: Strength): number {
  return a[0] - b[0] || a[1] - b[1];
}

export function compareCards(
  a: Card,
  b: Card,
  level: Rank | null,
  trumpSuit: Suit | null,
): number {
  return compareStrength(cardStrength(a, level, trumpSuit), cardStrength(b, level, trumpSuit));
}

export function sortHand(
  cards: Card[],
  level: Rank | null,
  trumpSuit: Suit | null,
  trumpVisible: boolean,
): Card[] {
  const suitOrder: Record<Suit, number> = { H: 0, D: 1, C: 2, S: 3 };
  return [...cards].sort((a, b) => {
    if (trumpVisible) {
      const trumpA = isTrump(a, level, trumpSuit);
      const trumpB = isTrump(b, level, trumpSuit);
      if (trumpA !== trumpB) return trumpA ? -1 : 1;
      if (trumpA) {
        return compareCards(b, a, level, trumpSuit);
      }
    }
    if (a.suit !== b.suit) {
      if (a.suit === null) return -1;
      if (b.suit === null) return 1;
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return compareCards(b, a, level, trumpSuit);
  });
}

export function cardPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardScore(card), 0);
}

export function uniqueIds(cards: Card[]): boolean {
  return new Set(cards.map((card) => card.id)).size === cards.length;
}
