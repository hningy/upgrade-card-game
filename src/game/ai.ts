import {
  PLAYERS,
  RANK_VALUE,
  TEAM_OF,
  cardPoints,
  cardScore,
  cardStrength,
  compareCards,
  createDeck,
  isTrump,
} from "./cards";
import {
  checkThrow,
  determineTrickWinner,
} from "./rules";
import type {
  AIDifficulty,
  Card,
  PlayerId,
  Rank,
  RoundState,
  Suit,
  TrickPlay,
} from "./types";

function cheapest(cards: Card[], level: Rank, trumpSuit: Suit | null): Card {
  return [...cards].sort((a, b) =>
    cardScore(a) - cardScore(b) ||
    Number(isTrump(a, level, trumpSuit)) - Number(isTrump(b, level, trumpSuit)) ||
    compareCards(a, b, level, trumpSuit),
  )[0];
}

function takeCheapest(
  cards: Card[],
  count: number,
  level: Rank,
  trumpSuit: Suit | null,
): Card[] {
  return [...cards]
    .sort((a, b) =>
      cardScore(a) - cardScore(b) ||
      Number(isTrump(a, level, trumpSuit)) - Number(isTrump(b, level, trumpSuit)) ||
      compareCards(a, b, level, trumpSuit),
    )
    .slice(0, count);
}

function takeHighest(
  cards: Card[],
  count: number,
  level: Rank,
  trumpSuit: Suit | null,
): Card[] {
  return [...cards]
    .sort((a, b) => compareCards(b, a, level, trumpSuit))
    .slice(0, count);
}

function randomItem<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

export function chooseAIBid(
  hand: Card[],
  candidates: (Suit | null)[],
  level: Rank,
  difficulty: AIDifficulty,
  rng: () => number,
): Suit | null {
  if (difficulty === "easy") return randomItem(candidates, rng);

  const score = (suit: Suit | null): number => {
    const trumps = suit === null
      ? hand.filter((card) => isTrump(card, level, null))
      : hand.filter((card) => isTrump(card, level, suit));
    const jokers = hand.filter((card) => card.rank === "BJ" || card.rank === "SJ").length;
    const levelCards = hand.filter((card) => card.rank === level).length;
    const highCards = hand.filter(
      (card) => card.suit === suit && RANK_VALUE[card.rank as Rank] >= 12,
    ).length;
    const suitLength = suit === null ? 0 : hand.filter((card) => card.suit === suit).length;

    if (difficulty === "normal") {
      return trumps.length * 1.2 + jokers * 1.8 + levelCards * 1.4 + highCards;
    }
    return trumps.length * 1.35 + jokers * 2.4 + levelCards * 1.6 +
      highCards * 1.3 + suitLength * 0.25;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

export function chooseAIDiscard(
  hand: Card[],
  level: Rank,
  knownTrumpSuit: Suit | null,
  difficulty: AIDifficulty,
  rng: () => number,
): Card[] {
  if (difficulty === "easy") {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const shuffled = [...hand].sort(() => rng() - 0.5);
      const chosen = shuffled.slice(0, 6);
      if (cardPoints(chosen) <= 25) return chosen;
    }
  }

  const sorted = [...hand].sort((a, b) => {
    const trumpA = knownTrumpSuit !== null && isTrump(a, level, knownTrumpSuit);
    const trumpB = knownTrumpSuit !== null && isTrump(b, level, knownTrumpSuit);
    const strengthA = cardStrength(a, level, knownTrumpSuit);
    const strengthB = cardStrength(b, level, knownTrumpSuit);
    const highA = strengthA[0] >= 4 || RANK_VALUE[a.rank as Rank] >= 13;
    const highB = strengthB[0] >= 4 || RANK_VALUE[b.rank as Rank] >= 13;
    const easyDifference = cardScore(a) - cardScore(b);
    if (easyDifference !== 0) return easyDifference;
    if (trumpA !== trumpB) return Number(trumpA) - Number(trumpB);
    if (difficulty === "hard" && highA !== highB) return Number(highA) - Number(highB);
    return compareCards(a, b, level, knownTrumpSuit) + (rng() - 0.5) * 0.05;
  });
  return sorted.slice(0, 6);
}

function tableHasPoints(round: RoundState): boolean {
  return [...(round.trickLead?.cards ?? []), ...round.trickPlays.flatMap((play) => play.cards)]
    .some((card) => cardScore(card) > 0);
}

function randomLegalFollowGroup(
  hand: Card[],
  lead: Card[],
  level: Rank,
  trumpSuit: Suit | null,
  rng: () => number,
): Card[] {
  const count = lead.length;
  if (count === 1) {
    const leadCard = lead[0];
    const candidates = isTrump(leadCard, level, trumpSuit)
      ? hand.filter((card) => isTrump(card, level, trumpSuit))
      : hand.filter(
        (card) =>
          !isTrump(card, level, trumpSuit) &&
          card.suit === leadCard.suit,
      );
    return [randomItem(candidates.length ? candidates : hand, rng)];
  }

  const leadSuit = lead[0].suit;
  const sameSuit = hand.filter(
    (card) => !isTrump(card, level, trumpSuit) && card.suit === leadSuit,
  );
  if (sameSuit.length >= count) return shufflePick(sameSuit, count, rng);
  if (sameSuit.length > 0) {
    const ids = new Set(sameSuit.map((card) => card.id));
    return [
      ...sameSuit,
      ...shufflePick(hand.filter((card) => !ids.has(card.id)), count - sameSuit.length, rng),
    ];
  }
  return shufflePick(hand, count, rng);
}

function shufflePick(cards: Card[], count: number, rng: () => number): Card[] {
  return [...cards].sort(() => rng() - 0.5).slice(0, count);
}

function easyPlay(
  round: RoundState,
  player: PlayerId,
  rng: () => number,
): Card[] {
  const hand = round.hands[player];
  if (!round.trickLead) return [randomItem(hand, rng)];
  return randomLegalFollowGroup(
    hand,
    round.trickLead.cards,
    round.level!,
    round.trumpSuit,
    rng,
  );
}

function normalPlay(
  round: RoundState,
  player: PlayerId,
  rng: () => number,
): Card[] {
  const level = round.level!;
  const trumpSuit = round.trumpSuit;
  const hand = round.hands[player];

  if (!round.trickLead) {
    const nontrumpSuits = new Map<Suit, Card[]>();
    for (const card of hand) {
      if (card.suit && !isTrump(card, level, trumpSuit)) {
        const cards = nontrumpSuits.get(card.suit) ?? [];
        cards.push(card);
        nontrumpSuits.set(card.suit, cards);
      }
    }
    if (rng() < 0.14) {
      const throwable = [...nontrumpSuits.values()].filter((cards) => cards.length >= 2);
      if (throwable.length > 0) {
        const cards = throwable[Math.floor(rng() * throwable.length)];
        return takeHighest(cards, Math.min(2, cards.length), level, trumpSuit);
      }
    }
    return [cheapest(hand, level, trumpSuit)];
  }

  const lead = round.trickLead.cards;
  const count = lead.length;
  if (count === 1) {
    const leadCard = lead[0];
    if (isTrump(leadCard, level, trumpSuit)) {
      const trumps = hand.filter((card) => isTrump(card, level, trumpSuit));
      return [cheapest(trumps.length ? trumps : hand, level, trumpSuit)];
    }
    const followers = hand.filter(
      (card) => !isTrump(card, level, trumpSuit) && card.suit === leadCard.suit,
    );
    if (followers.length > 0) {
      return [cheapest(followers, level, trumpSuit)];
    }
    const trumps = hand.filter((card) => isTrump(card, level, trumpSuit));
    if (tableHasPoints(round) && trumps.length > 0 && rng() < 0.62) {
      return [cheapest(trumps, level, trumpSuit)];
    }
    return [cheapest(hand, level, trumpSuit)];
  }

  const leadSuit = lead[0].suit;
  const sameSuit = hand.filter(
    (card) => !isTrump(card, level, trumpSuit) && card.suit === leadSuit,
  );
  if (sameSuit.length >= count) {
    return takeCheapest(sameSuit, count, level, trumpSuit);
  }
  if (sameSuit.length > 0) {
    const fillCount = count - sameSuit.length;
    const rest = hand.filter((card) => !sameSuit.some((held) => held.id === card.id));
    const nontrumpFillers = rest.filter((card) => !isTrump(card, level, trumpSuit));
    return [
      ...sameSuit,
      ...takeCheapest(
        nontrumpFillers.length >= fillCount ? nontrumpFillers : rest,
        fillCount,
        level,
        trumpSuit,
      ),
    ];
  }

  const trumps = hand.filter((card) => isTrump(card, level, trumpSuit));
  if (tableHasPoints(round) && trumps.length >= count && rng() < 0.7) {
    return takeCheapest(trumps, count, level, trumpSuit);
  }
  const nontrump = hand.filter((card) => !isTrump(card, level, trumpSuit));
  return takeCheapest(
    nontrump.length >= count ? nontrump : hand,
    count,
    level,
    trumpSuit,
  );
}

function hardLeadCandidates(round: RoundState, player: PlayerId): Card[][] {
  const level = round.level!;
  const trumpSuit = round.trumpSuit;
  const hand = round.hands[player];
  const candidates: Card[][] = [[cheapest(hand, level, trumpSuit)]];
  const bySuit = new Map<Suit, Card[]>();
  for (const card of hand) {
    if (card.suit && !isTrump(card, level, trumpSuit)) {
      const cards = bySuit.get(card.suit) ?? [];
      cards.push(card);
      bySuit.set(card.suit, cards);
    }
  }
  for (const cards of bySuit.values()) {
    if (cards.length >= 2) {
      candidates.push(takeHighest(cards, Math.min(3, cards.length), level, trumpSuit));
    }
  }
  return dedupeGroups(candidates);
}

function hardFollowCandidates(round: RoundState, player: PlayerId): Card[][] {
  const level = round.level!;
  const trumpSuit = round.trumpSuit;
  const hand = round.hands[player];
  const lead = round.trickLead!.cards;
  const count = lead.length;
  const candidates: Card[][] = [];
  const leadCard = lead[0];
  const required = count === 1
    ? isTrump(leadCard, level, trumpSuit)
      ? hand.filter((card) => isTrump(card, level, trumpSuit))
      : hand.filter(
        (card) =>
          !isTrump(card, level, trumpSuit) &&
          card.suit === leadCard.suit,
      )
    : hand.filter(
      (card) =>
        !isTrump(card, level, trumpSuit) &&
        card.suit === lead[0].suit,
    );

  if (count === 1) {
    if (required.length > 0) {
      candidates.push([cheapest(required, level, trumpSuit)]);
      candidates.push(takeHighest(required, 1, level, trumpSuit));
    } else {
      candidates.push([cheapest(hand, level, trumpSuit)]);
      const trumps = hand.filter((card) => isTrump(card, level, trumpSuit));
      if (trumps.length) candidates.push(takeHighest(trumps, 1, level, trumpSuit));
    }
  } else if (required.length >= count) {
    candidates.push(takeCheapest(required, count, level, trumpSuit));
    candidates.push(takeHighest(required, count, level, trumpSuit));
  } else if (required.length > 0) {
    const requiredIds = new Set(required.map((card) => card.id));
    const rest = hand.filter((card) => !requiredIds.has(card.id));
    const nontrump = rest.filter((card) => !isTrump(card, level, trumpSuit));
    candidates.push([
      ...required,
      ...takeCheapest(nontrump.length >= count - required.length ? nontrump : rest, count - required.length, level, trumpSuit),
    ]);
  } else {
    const trumps = hand.filter((card) => isTrump(card, level, trumpSuit));
    if (trumps.length >= count) {
      candidates.push(takeCheapest(trumps, count, level, trumpSuit));
      candidates.push(takeHighest(trumps, count, level, trumpSuit));
    }
    const nontrump = hand.filter((card) => !isTrump(card, level, trumpSuit));
    candidates.push(takeCheapest(nontrump.length >= count ? nontrump : hand, count, level, trumpSuit));
  }

  const randomLegal = randomLegalFollowGroup(
    hand,
    lead,
    level,
    trumpSuit,
    Math.random,
  );
  candidates.push(randomLegal);
  return dedupeGroups(candidates);
}

function dedupeGroups(groups: Card[][]): Card[][] {
  const seen = new Set<string>();
  return groups.filter((group) => {
    if (group.length === 0) return false;
    const key = group.map((card) => card.id).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hiddenPool(round: RoundState, actor: PlayerId): {
  pool: Card[];
  known: Map<PlayerId, Card[]>;
  required: Map<PlayerId, number>;
} {
  const visible = new Set<string>(
    Object.values(round.hands)
      .flat()
      .filter((card) => round.hands[actor].some((held) => held.id === card.id))
      .map((card) => card.id),
  );
  for (const hand of Object.values(round.hands)) {
    for (const card of hand) {
      if (round.hands[actor].some((held) => held.id === card.id)) visible.add(card.id);
    }
  }
  for (const card of round.playedCards) visible.add(card.id);
  for (const card of round.discard) visible.add(card.id);
  for (const play of round.trickPlays) {
    for (const card of play.cards) visible.add(card.id);
  }

  const known = new Map<PlayerId, Card[]>();
  const addKnown = (player: PlayerId, card: Card | null | undefined) => {
    if (!card || player === actor || visible.has(card.id)) return;
    const cards = known.get(player) ?? [];
    if (!cards.some((held) => held.id === card.id)) cards.push(card);
    known.set(player, cards);
    visible.add(card.id);
  };
  addKnown(round.bid?.caller ?? actor, round.bid?.calledCard);
  addKnown(round.bottomPlayer ?? actor, round.trumpFromBottom);

  const required = new Map<PlayerId, number>();
  for (const player of PLAYERS) {
    if (player === actor) continue;
    const fixed = known.get(player)?.length ?? 0;
    required.set(player, Math.max(0, round.hands[player].length - fixed));
  }
  const pool = createDeck().filter((card) => !visible.has(card.id));
  return { pool, known, required };
}

function determinizedHands(
  round: RoundState,
  actor: PlayerId,
  rng: () => number,
): Record<PlayerId, Card[]> {
  const { pool, known, required } = hiddenPool(round, actor);
  const shuffled = [...pool].sort(() => rng() - 0.5);
  const hands: Record<PlayerId, Card[]> = {
    blue1: [],
    blue2: [],
    red1: [],
    red2: [],
  };
  hands[actor] = [...round.hands[actor]];
  let cursor = 0;
  for (const player of PLAYERS) {
    if (player === actor) continue;
    const cards = [...(known.get(player) ?? [])];
    cards.push(...shuffled.slice(cursor, cursor + (required.get(player) ?? 0)));
    cursor += required.get(player) ?? 0;
    hands[player] = cards;
  }
  return hands;
}

function scoreHardCandidate(
  round: RoundState,
  actor: PlayerId,
  candidate: Card[],
  rng: () => number,
  samples: number,
): number {
  const level = round.level!;
  const trumpSuit = round.trumpSuit;
  const actorTeam = TEAM_OF[actor];
  let total = 0;

  for (let sample = 0; sample < samples; sample += 1) {
    const hands = determinizedHands(round, actor, rng);
    let actual = candidate;
    if (!round.trickLead && candidate.length > 1) {
      actual = checkThrow(candidate, hands, actor, level, trumpSuit).cards;
    }
    const actualIds = new Set(actual.map((card) => card.id));
    hands[actor] = hands[actor].filter((card) => !actualIds.has(card.id));

    const plays: TrickPlay[] = round.trickPlays.map((play) => ({
      player: play.player,
      cards: [...play.cards],
    }));
    plays.push({ player: actor, cards: actual });
    const lead = round.trickLead?.cards ?? actual;
    const start = PLAYERS.indexOf(actor);
    let offset = 1;
    while (plays.length < 4) {
      const nextPlayer = PLAYERS[(start + offset) % PLAYERS.length];
      const group = randomLegalFollowGroup(
        hands[nextPlayer],
        lead,
        level,
        trumpSuit,
        rng,
      );
      hands[nextPlayer] = hands[nextPlayer].filter(
        (card) => !group.some((played) => played.id === card.id),
      );
      plays.push({ player: nextPlayer, cards: group });
      offset += 1;
    }

    const winner = determineTrickWinner(plays, level, trumpSuit);
    const points = cardPoints(plays.flatMap((play) => play.cards));
    const won = TEAM_OF[winner] === actorTeam;
    total += (won ? 3 : -1.5) + (won ? points : -points) * 0.18;
  }
  return total / Math.max(1, samples);
}

function hardPlay(
  round: RoundState,
  player: PlayerId,
  rng: () => number,
): Card[] {
  const candidates = round.trickLead
    ? hardFollowCandidates(round, player)
    : hardLeadCandidates(round, player);
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const score = scoreHardCandidate(round, player, candidate, rng, 32);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function chooseAIPlay(
  round: RoundState,
  player: PlayerId,
  rng: () => number,
  difficulty: AIDifficulty = "normal",
): Card[] {
  if (difficulty === "easy") return easyPlay(round, player, rng);
  if (difficulty === "hard") return hardPlay(round, player, rng);
  return normalPlay(round, player, rng);
}

export function aiCallChance(
  difficulty: AIDifficulty,
  late: boolean,
): number {
  if (difficulty === "easy") return late ? 0.5 : 0.16;
  if (difficulty === "hard") return late ? 0.92 : 0.46;
  return late ? 0.72 : 0.3;
}

export function aiRevoltAgreement(
  difficulty: AIDifficulty,
  rng: () => number,
): boolean {
  const chance = difficulty === "easy" ? 0.28 : difficulty === "hard" ? 0.56 : 0.42;
  return rng() < chance;
}

export function aiWantsBottom(
  hand: Card[],
  level: Rank,
  trumpSuit: Suit | null,
  difficulty: AIDifficulty,
  rng: () => number,
): boolean {
  if (difficulty === "easy") return rng() < 0.5;
  const trumps = hand.filter((card) => isTrump(card, level, trumpSuit)).length;
  const chance = difficulty === "hard"
    ? Math.min(0.9, 0.32 + trumps * 0.065)
    : Math.min(0.78, 0.36 + trumps * 0.045);
  return rng() < chance;
}

export function revealToPlayer(round: RoundState, player: PlayerId): Suit | null | undefined {
  if (round.trumpKnown || round.bid?.caller === player) return round.trumpSuit;
  return undefined;
}

export function isOpponentOf(player: PlayerId, mainTeam: "blue" | "red"): boolean {
  return TEAM_OF[player] !== mainTeam;
}
