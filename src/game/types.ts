export type Suit = "H" | "D" | "C" | "S";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";
export type CardRank = Rank | "BJ" | "SJ";
export type Team = "blue" | "red";
export type AIDifficulty = "easy" | "normal" | "hard";
export type PlayerId = "blue1" | "red2" | "blue2" | "red1";
export type Phase =
  | "coin"
  | "dealing"
  | "revolt"
  | "chooseBottom"
  | "burying"
  | "reveal"
  | "playing"
  | "trickReview"
  | "finalReveal"
  | "roundEnd"
  | "redeal";

export interface Card {
  id: string;
  suit: Suit | null;
  rank: CardRank;
}

export interface Bid {
  caller: PlayerId;
  calledCard: Card;
  trumpSuit: Suit | null;
  level: Rank;
  jokerCall: boolean;
}

export interface TrickPlay {
  player: PlayerId;
  cards: Card[];
}

export interface TrickRecord {
  number: number;
  lead: TrickPlay;
  plays: TrickPlay[];
  winner: PlayerId;
  points: number;
  pointsCounted: boolean;
  failedThrow: boolean;
}

export interface CapturedTrick {
  trickNumber: number;
  winner: PlayerId;
  cards: Card[];
  points: number;
}

export interface RevoltPrompt {
  mode: "initiate" | "respond";
  initiator: PlayerId;
  partner: PlayerId;
  humanMustDecide: boolean;
  reason: string;
}

export interface CoinFlip {
  reason: "dealer" | "bottom";
  resultPlayer: PlayerId;
  title: string;
  resultText: string;
}

export interface RoundResult {
  opponentPoints: number;
  lastWinner: PlayerId;
  mainTeam: Team;
  opponentTeam: Team;
  upgradeTeam: Team | null;
  upgradeAmount: number;
  nextMainTeam: Team;
  nextShootout: boolean;
  levelsBefore: Record<Team, Rank>;
  levelsAfter: Record<Team, Rank>;
  summary: string;
  reason: string;
}

export interface RoundState {
  phase: Phase;
  coinFlip: CoinFlip | null;
  dealer: PlayerId;
  dealCount: number;
  hands: Record<PlayerId, Card[]>;
  bottom: Card[];
  bottomDisplay: Card[];
  bid: Bid | null;
  mainTeam: Team | null;
  level: Rank | null;
  trumpSuit: Suit | null;
  trumpKnown: boolean;
  trumpFromBottom: Card | null;
  bottomPlayer: PlayerId | null;
  discard: Card[];
  playedCards: Card[];
  revoltPrompt: RevoltPrompt | null;
  currentPlayer: PlayerId;
  trickLead: TrickPlay | null;
  trickPlays: TrickPlay[];
  trickFailedThrow: boolean;
  lastTrick: TrickRecord | null;
  capturedTricks: CapturedTrick[];
  trickNumber: number;
  opponentPoints: number;
  lastWinner: PlayerId | null;
  roundResult: RoundResult | null;
  message: string;
  events: string[];
}

export interface MatchState {
  sessionSeed: number;
  levels: Record<Team, Rank>;
  roundsWon: Record<Team, number>;
  mainTeam: Team | null;
  shootout: boolean;
  roundNumber: number;
  round: RoundState | null;
}

export interface ThrowCheck {
  valid: boolean;
  cards: Card[];
  reason: string;
}
