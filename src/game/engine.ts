import {
  HUMAN_PLAYER,
  DEFAULT_AI_DIFFICULTIES,
  OTHER_TEAM,
  PARTNER_OF,
  PLAYERS,
  DEFAULT_PLAYER_NAMES,
  RANKS,
  RANK_VALUE,
  SUIT_NAMES,
  TEAM_OF,
  TEAM_PLAYERS,
  cardName,
  cardPoints,
  cardScore,
  createDeck,
  isJoker,
  uniqueIds,
} from "./cards";
import {
  aiCallChance,
  aiRevoltAgreement,
  aiWantsBottom,
  chooseAIBid,
  chooseAIDiscard,
  chooseAIPlay,
} from "./ai";
import {
  bidSuitOptions,
  checkThrow,
  determineTrickWinner,
  opponentScoresTrick,
  validateFollowSelection,
  validateLeadSelection,
} from "./rules";
import { decideSettlement } from "./settlement";
import type {
  AIDifficulty,
  Card,
  MatchState,
  PlayerId,
  Rank,
  RevoltPrompt,
  Suit,
  Team,
  TrickPlay,
  TrickRecord,
} from "./types";

type Random = () => number;

function seededRandom(seed: number): Random {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function emptyHands(): Record<PlayerId, Card[]> {
  return { blue1: [], red2: [], blue2: [], red1: [] };
}

function hasScoreCards(cards: Card[]): boolean {
  return cards.some((card) => cardScore(card) > 0);
}

function nextPlayer(player: PlayerId): PlayerId {
  const index = PLAYERS.indexOf(player);
  return PLAYERS[(index + 1) % PLAYERS.length];
}

function teamName(team: Team): string {
  return team === "blue" ? "蓝方" : "红方";
}

function suitLabel(suit: Suit | null): string {
  return suit === null ? "无主" : `${SUIT_NAMES[suit]}主`;
}

function makeMatchState(seed: number): MatchState {
  return {
    sessionSeed: seed,
    levels: { blue: "2", red: "2" },
    roundsWon: { blue: 0, red: 0 },
    mainTeam: null,
    shootout: true,
    roundNumber: 0,
    round: null,
  };
}

export class GameSession {
  state: MatchState;
  playerNames: Record<PlayerId, string> = { ...DEFAULT_PLAYER_NAMES };
  aiDifficulties: Record<PlayerId, AIDifficulty> = { ...DEFAULT_AI_DIFFICULTIES };
  private rng: Random;
  private deck: Card[] = [];
  private roundShootout = true;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(seed = Date.now()) {
    this.rng = seededRandom(seed);
    this.state = makeMatchState(seed);
    this.beginRound(true);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): number => this.version;

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private log(text: string): void {
    const round = this.state.round;
    if (!round) return;
    round.events = [...round.events, text].slice(-80);
  }

  private message(text: string): void {
    if (this.state.round) this.state.round.message = text;
  }

  restart(seed = Date.now()): void {
    this.rng = seededRandom(seed);
    this.state = makeMatchState(seed);
    this.beginRound(true);
  }

  setPlayerNames(names: Partial<Record<PlayerId, string>>): void {
    this.playerNames = Object.fromEntries(
      PLAYERS.map((player) => [
        player,
        names[player]?.trim().slice(0, 10) || DEFAULT_PLAYER_NAMES[player],
      ]),
    ) as Record<PlayerId, string>;
    this.notify();
  }

  setAIDifficulties(
    difficulties: Partial<Record<PlayerId, AIDifficulty>>,
  ): void {
    this.aiDifficulties = Object.fromEntries(
      PLAYERS.map((player) => [
        player,
        difficulties[player] === "easy" ||
        difficulties[player] === "hard" ||
        difficulties[player] === "normal"
          ? difficulties[player]!
          : DEFAULT_AI_DIFFICULTIES[player],
      ]),
    ) as Record<PlayerId, AIDifficulty>;
    this.notify();
  }

  private beginRound(incrementRound: boolean): void {
    this.roundShootout = this.state.shootout;
    if (incrementRound) this.state.roundNumber += 1;
    const mainTeam = this.roundShootout ? null : this.state.mainTeam;
    const level = mainTeam ? this.state.levels[mainTeam] : null;
    const dealer = PLAYERS[Math.floor(this.rng() * PLAYERS.length)];
    this.deck = shuffle(createDeck(), this.rng);

    this.state.round = {
      phase: "coin",
      coinFlip: {
        reason: "dealer",
        resultPlayer: dealer,
        title: "抛硬币决定首位收牌者",
        resultText: `${this.playerNames[dealer]}先收第一张牌`,
      },
      dealer,
      dealCount: 0,
      hands: emptyHands(),
      bottom: [],
      bottomDisplay: [],
      bid: null,
      mainTeam,
      level,
      trumpSuit: null,
      trumpKnown: false,
      trumpFromBottom: null,
      bottomPlayer: null,
      discard: [],
      playedCards: [],
      revoltPrompt: null,
      currentPlayer: dealer,
      trickLead: null,
      trickPlays: [],
      trickFailedThrow: false,
      lastTrick: null,
      capturedTricks: [],
      trickNumber: 1,
      opponentPoints: 0,
      lastWinner: null,
      roundResult: null,
      message: "正在抛硬币，决定本局首位收牌者",
      events: [`第 ${this.state.roundNumber} 局开始，先抛硬币决定收牌顺序`],
    };
    this.notify();
  }

  resolveCoin(): void {
    const round = this.state.round;
    if (!round || round.phase !== "coin" || !round.coinFlip) return;
    const reason = round.coinFlip.reason;
    round.coinFlip = null;
    if (reason === "bottom") {
      this.prepareBury();
      return;
    }
    round.phase = "dealing";
    round.message = this.roundShootout
      ? "抢报局：只能在发牌过程中报自己阵营的级牌"
      : `本局${teamName(round.mainTeam!)}主家，打 ${round.level}，一人一张发牌`;
    this.log(`${this.playerNames[round.dealer]}首先收牌`);
    this.notify();
  }

  dealNext(): void {
    const round = this.state.round;
    if (!round || round.phase !== "dealing" || round.dealCount >= 48) return;
    const start = PLAYERS.indexOf(round.dealer);
    const player = PLAYERS[(start + round.dealCount) % 4];
    const card = this.deck[round.dealCount];
    round.hands[player].push(card);
    round.dealCount += 1;

    // Human bidding is manual; only the receiving AI gets an automatic window.
    if (!round.bid && player !== HUMAN_PLAYER) {
      this.maybeAIBid(player);
    }

    if (round.dealCount === 48) {
      round.bottom = this.deck.slice(48);
      this.finishDeal();
    }
    this.notify();
  }

  private aiCallLevel(player: PlayerId): Rank {
    return this.roundShootout
      ? this.state.levels[TEAM_OF[player]]
      : this.state.round!.level!;
  }

  private maybeAIBid(player: PlayerId): void {
    const round = this.state.round!;
    if (round.bid) return;
    const level = this.aiCallLevel(player);
    const candidates = bidSuitOptions(
      round.hands[player],
      level,
      !this.roundShootout,
    );
    if (candidates.length === 0) return;
    const difficulty = this.aiDifficulties[player];
    const callChance = aiCallChance(difficulty, round.dealCount >= 34);
    if (this.rng() > callChance) return;
    const choice = chooseAIBid(
      round.hands[player],
      candidates,
      level,
      difficulty,
      this.rng,
    );
    this.setBid(player, choice);
  }

  private setBid(player: PlayerId, trumpSuit: Suit | null): void {
    const round = this.state.round!;
    if (round.bid) return;
    const level = this.aiCallLevel(player);
    const calledCard = round.hands[player].find((card) =>
      trumpSuit === null ? isJoker(card) : card.rank === level && card.suit === trumpSuit,
    );
    if (!calledCard) throw new Error("叫主时未找到对应的级牌或王");
    round.bid = {
      caller: player,
      calledCard,
      trumpSuit,
      level,
      jokerCall: trumpSuit === null,
    };
    round.message = `${this.playerNames[player]}叫主，令花色将在打底后公开`;
    this.log(`${this.playerNames[player]}叫主`);
  }

  getHumanCallOptions(): (Suit | null)[] {
    const round = this.state.round;
    if (!round || round.phase !== "dealing" || round.bid) return [];
    const level = this.roundShootout
      ? this.state.levels.blue
      : round.level!;
    return bidSuitOptions(
      round.hands[HUMAN_PLAYER],
      level,
      !this.roundShootout,
    );
  }

  humanCall(trumpSuit: Suit | null): boolean {
    const round = this.state.round;
    if (!round || round.phase !== "dealing" || round.bid) return false;
    const options = this.getHumanCallOptions();
    if (!options.some((option) => option === trumpSuit)) return false;
    this.setBid(HUMAN_PLAYER, trumpSuit);
    this.message(`你已叫${suitLabel(trumpSuit)}，其他玩家只看到你叫主，打底后才公开花色`);
    this.notify();
    return true;
  }

  autoHumanBid(): boolean {
    const round = this.state.round;
    if (!round || round.phase !== "dealing" || round.bid) return false;
    const options = this.getHumanCallOptions();
    if (options.length === 0) return false;
    const choice = chooseAIBid(
      round.hands[HUMAN_PLAYER],
      options,
      round.level!,
      "normal",
      this.rng,
    );
    this.setBid(HUMAN_PLAYER, choice);
    this.message(
      `托管替你叫${suitLabel(choice)}，其他玩家只看到你叫主，打底后才公开花色`,
    );
    this.notify();
    return true;
  }

  private finishDeal(): void {
    const round = this.state.round!;
    if (this.roundShootout && !round.bid) {
      round.phase = "redeal";
      round.message = "无人抢报，本局作废，准备重新发牌";
      this.log("抢报阶段无人报主");
      return;
    }

    const mainTeam = this.roundShootout
      ? TEAM_OF[round.bid!.caller]
      : this.state.mainTeam!;
    round.mainTeam = mainTeam;
    round.level = this.state.levels[mainTeam];

    const opponents = TEAM_PLAYERS[OTHER_TEAM[mainTeam]];
    const zeroScore = opponents.filter(
      (player) => !hasScoreCards(round.hands[player]),
    );
    if (zeroScore.length === 0) {
      this.proceedToBottom();
      return;
    }

    const humanIsOpponent = TEAM_OF[HUMAN_PLAYER] === OTHER_TEAM[mainTeam];
    if (!humanIsOpponent) {
      const proposer = zeroScore[0];
      const difficulty = this.aiDifficulties[proposer];
      if (aiRevoltAgreement(difficulty, this.rng)) {
        round.phase = "redeal";
        round.message = `${this.playerNames[proposer]}发起起义，旁家同意，重新发牌`;
        this.log(round.message);
      } else {
        this.proceedToBottom();
      }
      return;
    }

    const partner = PARTNER_OF[HUMAN_PLAYER];
    let prompt: RevoltPrompt | null = null;
    if (!hasScoreCards(round.hands[HUMAN_PLAYER])) {
      prompt = {
        mode: "initiate",
        initiator: HUMAN_PLAYER,
        partner,
        humanMustDecide: true,
        reason: "你的手牌没有 K、10、5，可以发起起义；队友同意后重新发牌。",
      };
    } else if (!hasScoreCards(round.hands[partner])) {
      prompt = {
        mode: "respond",
        initiator: partner,
        partner,
        humanMustDecide: true,
        reason: `${this.playerNames[partner]}的手牌没有分牌，想发起起义。是否同意？`,
      };
    }

    if (prompt) {
      round.phase = "revolt";
      round.revoltPrompt = prompt;
      round.message = prompt.reason;
    } else {
      this.proceedToBottom();
    }
  }

  respondToRevolt(accept: boolean): void {
    const round = this.state.round;
    const prompt = round?.revoltPrompt;
    if (!round || round.phase !== "revolt" || !prompt) return;
    round.revoltPrompt = null;
    if (!accept) {
      this.proceedToBottom();
      return;
    }
    if (
      prompt.mode === "initiate" &&
      !aiRevoltAgreement(this.aiDifficulties[prompt.partner], this.rng)
    ) {
      round.message = `你发起起义，但${this.playerNames[prompt.partner]}没有同意，继续本局`;
      this.log(round.message);
      this.proceedToBottom();
      return;
    }
    round.phase = "redeal";
    round.message = "旁家达成一致，起义成功，重新发牌";
    this.log(round.message);
    this.notify();
  }

  private proceedToBottom(): void {
    const round = this.state.round!;
    if (round.mainTeam === TEAM_OF[HUMAN_PLAYER]) {
      round.phase = "chooseBottom";
      round.message = "主家协商打底：你要打底吗？";
    } else {
      this.autoChooseBottom();
      return;
    }
    this.notify();
  }

  chooseBottom(wants: boolean): void {
    const round = this.state.round;
    if (!round || round.phase !== "chooseBottom" || round.mainTeam !== TEAM_OF[HUMAN_PLAYER]) {
      return;
    }
    const partner = PARTNER_OF[HUMAN_PLAYER];
    const partnerWants = aiWantsBottom(
      round.hands[partner],
      round.level!,
      round.bid?.caller === partner ? round.bid.trumpSuit : null,
      this.aiDifficulties[partner],
      this.rng,
    );
    let bottomPlayer: PlayerId;
    let coin = false;
    if (wants !== partnerWants) {
      bottomPlayer = wants ? HUMAN_PLAYER : partner;
    } else {
      bottomPlayer = this.rng() < 0.5 ? HUMAN_PLAYER : partner;
      coin = true;
    }
    round.bottomPlayer = bottomPlayer;
    if (coin) {
      round.phase = "coin";
      round.coinFlip = {
        reason: "bottom",
        resultPlayer: bottomPlayer,
        title: "两人选择相同，抛硬币决定打底者",
        resultText: `${this.playerNames[bottomPlayer]}负责打底`,
      };
      round.message = "两人都选择了相同的打底意愿，正在抛硬币";
      this.log("主家两人选择相同，开始抛硬币");
      this.notify();
      return;
    }
    this.log(`${this.playerNames[bottomPlayer]}负责打底`);
    this.prepareBury();
  }

  private autoChooseBottom(): void {
    const round = this.state.round!;
    const players = TEAM_PLAYERS[round.mainTeam!];
    const choices = players.map((player) =>
      aiWantsBottom(
        round.hands[player],
        round.level!,
        round.bid?.caller === player ? round.bid.trumpSuit : null,
        this.aiDifficulties[player],
        this.rng,
      ),
    );
    let bottomPlayer: PlayerId;
    let coin = false;
    if (choices[0] !== choices[1]) {
      bottomPlayer = choices[0] ? players[0] : players[1];
    } else {
      bottomPlayer = players[this.rng() < 0.5 ? 0 : 1];
      coin = true;
    }
    round.bottomPlayer = bottomPlayer;
    if (coin) {
      round.phase = "coin";
      round.coinFlip = {
        reason: "bottom",
        resultPlayer: bottomPlayer,
        title: "两人选择相同，抛硬币决定打底者",
        resultText: `${this.playerNames[bottomPlayer]}负责打底`,
      };
      round.message = "主家两人选择相同，正在抛硬币决定打底者";
      this.log("主家两人选择相同，开始抛硬币");
      this.notify();
      return;
    }
    this.log(`${this.playerNames[bottomPlayer]}负责打底`);
    this.prepareBury();
  }

  private prepareBury(): void {
    const round = this.state.round!;
    const bottomPlayer = round.bottomPlayer!;
    let special: Card | null = null;
    if (!round.bid) {
      const index = Math.floor(this.rng() * round.bottom.length);
      special = round.bottom[index];
      round.bottom = round.bottom.filter((_, cardIndex) => cardIndex !== index);
    }
    round.bottomDisplay = [...round.bottom];
    round.hands[bottomPlayer].push(...round.bottom);
    round.bottom = [];
    round.trumpFromBottom = special;
    round.phase = "burying";
    round.message =
      bottomPlayer === HUMAN_PLAYER
        ? `你负责打底，请选择 6 张弃牌，总分不能超过 25`
        : `${this.playerNames[bottomPlayer]}正在打底`;
    if (!round.bid) {
      this.log("无人叫主，系统暗抽一张底牌，剩余五张交给打底者");
    }
    this.notify();
  }

  autoBury(): void {
    const round = this.state.round;
    if (!round || round.phase !== "burying" || round.bottomPlayer === HUMAN_PLAYER) return;
    const bottomPlayer = round.bottomPlayer!;
    const knownSuit =
      round.bid?.caller === bottomPlayer ? round.bid.trumpSuit : null;
    const discard = chooseAIDiscard(
      round.hands[bottomPlayer],
      round.level!,
      knownSuit,
      this.aiDifficulties[bottomPlayer],
      this.rng,
    );
    this.completeBury(discard);
  }

  autoBuryHuman(): boolean {
    const round = this.state.round;
    if (!round || round.phase !== "burying" || round.bottomPlayer !== HUMAN_PLAYER) {
      return false;
    }
    const knownSuit =
      round.bid?.caller === HUMAN_PLAYER ? round.bid.trumpSuit : null;
    const discard = chooseAIDiscard(
      round.hands[HUMAN_PLAYER],
      round.level!,
      knownSuit,
      "normal",
      this.rng,
    );
    this.completeBury(discard);
    return true;
  }

  buryHuman(cards: Card[]): boolean {
    const round = this.state.round;
    if (!round || round.phase !== "burying" || round.bottomPlayer !== HUMAN_PLAYER) {
      return false;
    }
    if (cards.length !== 6) {
      this.message("必须恰好选择 6 张弃牌");
      this.notify();
      return false;
    }
    if (!uniqueIds(cards)) {
      this.message("弃牌中存在重复牌");
      this.notify();
      return false;
    }
    if (cards.some((card) => !round.hands[HUMAN_PLAYER].some((held) => held.id === card.id))) {
      this.message("弃牌不在你的手牌中");
      this.notify();
      return false;
    }
    if (cardPoints(cards) > 25) {
      this.message(`弃牌共 ${cardPoints(cards)} 分，不能超过 25 分`);
      this.notify();
      return false;
    }
    this.completeBury(cards);
    return true;
  }

  private completeBury(discard: Card[]): void {
    const round = this.state.round!;
    const bottomPlayer = round.bottomPlayer!;
    const discardIds = new Set(discard.map((card) => card.id));
    round.hands[bottomPlayer] = round.hands[bottomPlayer].filter(
      (card) => !discardIds.has(card.id),
    );
    if (round.trumpFromBottom) {
      round.hands[bottomPlayer].push(round.trumpFromBottom);
    }
    if (round.hands[bottomPlayer].length !== 12) {
      throw new Error("打底后手牌未恢复到 12 张");
    }
    round.discard = discard;
    round.trumpSuit = round.bid ? round.bid.trumpSuit : round.trumpFromBottom?.suit ?? null;
    round.trumpKnown = true;
    round.phase = "reveal";
    round.currentPlayer = bottomPlayer;
    round.message = round.bid
      ? `打底完成，本局${suitLabel(round.trumpSuit)}，由${this.playerNames[bottomPlayer]}首先出牌`
      : `底牌暗抽牌为${cardName(round.trumpFromBottom!)}，本局${suitLabel(round.trumpSuit)}，由${this.playerNames[bottomPlayer]}首先出牌`;
    this.log(round.message);
    this.log(`弃牌：${discard.map(cardName).join("、")}（${cardPoints(discard)} 分）`);
    this.notify();
  }

  beginPlay(): void {
    const round = this.state.round;
    if (!round || round.phase !== "reveal") return;
    round.phase = "playing";
    round.trickNumber = 1;
    round.trickLead = null;
    round.trickPlays = [];
    round.trickFailedThrow = false;
    round.message = `${this.playerNames[round.currentPlayer]}首先出牌`;
    this.notify();
  }

  getKnownTrumpForHuman(): Suit | null | undefined {
    const round = this.state.round;
    if (!round) return undefined;
    if (round.trumpKnown) return round.trumpSuit;
    if (round.bid?.caller === HUMAN_PLAYER) return round.bid.trumpSuit;
    return undefined;
  }

  inspectHumanSelection(cards: Card[]): { ok: boolean; reason: string } {
    const round = this.state.round;
    if (!round || round.phase !== "playing") {
      return { ok: false, reason: "当前不能出牌" };
    }
    if (cards.length === 0) return { ok: false, reason: "请选择要出的牌" };
    if (!round.trickLead) {
      return validateLeadSelection(
        cards,
        round.hands[HUMAN_PLAYER],
        round.level!,
        round.trumpSuit,
      );
    }
    return validateFollowSelection(
      cards,
      round.hands[HUMAN_PLAYER],
      round.trickLead.cards,
      round.level!,
      round.trumpSuit,
    );
  }

  playHuman(cards: Card[]): boolean {
    const round = this.state.round;
    if (!round || round.phase !== "playing" || round.currentPlayer !== HUMAN_PLAYER) {
      return false;
    }
    return this.applyPlay(HUMAN_PLAYER, cards);
  }

  autoPlay(): void {
    const round = this.state.round;
    if (!round || round.phase !== "playing" || round.currentPlayer === HUMAN_PLAYER) {
      return;
    }
    const cards = chooseAIPlay(
      round,
      round.currentPlayer,
      this.rng,
      this.aiDifficulties[round.currentPlayer],
    );
    this.applyPlay(round.currentPlayer, cards);
  }

  autoPlayHuman(): boolean {
    const round = this.state.round;
    if (
      !round ||
      round.phase !== "playing" ||
      round.currentPlayer !== HUMAN_PLAYER
    ) {
      return false;
    }
    return this.applyPlay(
      HUMAN_PLAYER,
      chooseAIPlay(round, HUMAN_PLAYER, this.rng, "normal"),
    );
  }

  suggestHumanPlay(): Card[] | null {
    const round = this.state.round;
    if (
      !round ||
      round.phase !== "playing" ||
      round.currentPlayer !== HUMAN_PLAYER
    ) {
      return null;
    }
    return chooseAIPlay(round, HUMAN_PLAYER, this.rng, "hard");
  }

  suggestHumanBury(): Card[] | null {
    const round = this.state.round;
    if (
      !round ||
      round.phase !== "burying" ||
      round.bottomPlayer !== HUMAN_PLAYER
    ) {
      return null;
    }
    const knownSuit =
      round.bid?.caller === HUMAN_PLAYER ? round.bid.trumpSuit : null;
    return chooseAIDiscard(
      round.hands[HUMAN_PLAYER],
      round.level!,
      knownSuit,
      "hard",
      this.rng,
    );
  }

  private applyPlay(player: PlayerId, selected: Card[]): boolean {
    const round = this.state.round!;
    if (player !== round.currentPlayer) return false;
    const hand = round.hands[player];
    if (!uniqueIds(selected) || selected.length === 0) {
      this.message("所选出牌无效");
      this.notify();
      return false;
    }
    if (selected.some((card) => !hand.some((held) => held.id === card.id))) {
      this.message("所出牌不在手牌中");
      this.notify();
      return false;
    }

    let actual = selected;
    if (!round.trickLead) {
      const leadValidation = validateLeadSelection(
        selected,
        hand,
        round.level!,
        round.trumpSuit,
      );
      if (!leadValidation.ok) {
        this.message(leadValidation.reason);
        this.notify();
        return false;
      }
      if (selected.length > 1) {
        const throwResult = checkThrow(
          selected,
          round.hands,
          player,
          round.level!,
          round.trumpSuit,
        );
        actual = throwResult.cards;
        round.trickFailedThrow = !throwResult.valid;
        this.log(throwResult.reason);
      }
    } else {
      const followValidation = validateFollowSelection(
        selected,
        hand,
        round.trickLead.cards,
        round.level!,
        round.trumpSuit,
      );
      if (!followValidation.ok) {
        this.message(followValidation.reason);
        this.notify();
        return false;
      }
    }

    const actualIds = new Set(actual.map((card) => card.id));
    round.hands[player] = hand.filter((card) => !actualIds.has(card.id));
    const play: TrickPlay = { player, cards: actual };
    if (!round.trickLead) {
      round.trickLead = play;
    }
    round.trickPlays.push(play);
    this.log(`${this.playerNames[player]}出${actual.map(cardName).join("、")}`);

    if (round.trickPlays.length < 4 && round.hands[player].length === 0) {
      round.currentPlayer = nextPlayer(player);
      this.completeFinalTrick();
    } else if (round.trickPlays.length === 4) {
      this.resolveTrick();
    } else {
      round.currentPlayer = nextPlayer(player);
      round.message = `轮到${this.playerNames[round.currentPlayer]}出牌`;
    }
    this.notify();
    return true;
  }

  private completeFinalTrick(): void {
    const round = this.state.round!;
    const required = round.trickLead!.cards.length;
    while (round.trickPlays.length < 4) {
      const player = round.currentPlayer;
      const cards = [...round.hands[player]];
      if (cards.length !== required) {
        throw new Error("最后一手自动补齐时牌数不一致");
      }
      const validation = validateFollowSelection(
        cards,
        round.hands[player],
        round.trickLead!.cards,
        round.level!,
        round.trumpSuit,
      );
      if (!validation.ok) {
        throw new Error(`最后一手自动补齐失败：${validation.reason}`);
      }
      round.hands[player] = [];
      round.trickPlays.push({ player, cards });
      this.log(`${this.playerNames[player]}自动出完剩余牌`);
      round.currentPlayer = nextPlayer(player);
    }
    this.resolveTrick();
  }

  private resolveTrick(): void {
    const round = this.state.round!;
    const winner = determineTrickWinner(
      round.trickPlays,
      round.level!,
      round.trumpSuit,
    );
    const allCards = round.trickPlays.flatMap((play) => play.cards);
    const points = cardPoints(allCards);
    const isFinalTrick = Object.values(round.hands).every(
      (hand) => hand.length === 0,
    );
    const opponentCaptured = opponentScoresTrick(
      isFinalTrick,
      winner,
      round.mainTeam!,
    );
    if (opponentCaptured) {
      round.opponentPoints += points;
      if (points > 0) {
        round.capturedTricks.push({
          trickNumber: round.trickNumber,
          winner,
          cards: allCards.filter((card) => cardScore(card) > 0),
          points,
        });
      }
    }
    const record: TrickRecord = {
      number: round.trickNumber,
      lead: round.trickLead!,
      plays: [...round.trickPlays],
      winner,
      points,
      pointsCounted: opponentCaptured,
      failedThrow: round.trickFailedThrow,
    };
    round.lastTrick = record;
    round.lastWinner = winner;
    if (isFinalTrick) {
      this.log(
        `末墩亮牌：${this.playerNames[winner]}赢；本墩${points > 0 ? `${points} 分不计` : "无分"}`,
      );
    } else {
      this.log(
        `第 ${round.trickNumber} 墩：${this.playerNames[winner]}赢${
          points
            ? opponentCaptured
              ? `，旁家吃 ${points} 分`
              : "，主家不计分"
            : "，本墩无分"
        }`,
      );
    }

    if (new Set(Object.values(round.hands).map((hand) => hand.length)).size !== 1) {
      throw new Error("每墩结束后四名玩家手牌数量不相等");
    }
    round.phase = "trickReview";
    round.currentPlayer = winner;
    round.message = isFinalTrick
      ? `末墩亮牌：${this.playerNames[winner]}赢${points > 0 ? `；本墩 ${points} 分不计` : ""}`
      : `${this.playerNames[winner]}赢下本墩${points > 0 ? `，本墩 ${points} 分` : "，本墩无分"}`;
  }

  continueAfterTrick(): void {
    const round = this.state.round;
    if (!round || round.phase !== "trickReview") return;
    round.playedCards.push(...round.trickPlays.flatMap((play) => play.cards));
    if (Object.values(round.hands).every((hand) => hand.length === 0)) {
      round.trickLead = null;
      round.trickPlays = [];
      round.phase = "finalReveal";
      round.message = `全场最后一墩结束，亮牌赢家是${this.playerNames[round.lastWinner!]}，准备结算`;
      this.log("末墩亮牌：全场最后四手比较大小，展示最终牌面");
      this.notify();
      return;
    }
    const winner = round.lastWinner!;
    round.trickNumber += 1;
    round.currentPlayer = winner;
    round.trickLead = null;
    round.trickPlays = [];
    round.trickFailedThrow = false;
    round.phase = "playing";
    round.message = `${this.playerNames[winner]}赢下本墩，继续首先出牌`;
    this.notify();
  }

  finishFinalReveal(): void {
    const round = this.state.round;
    if (!round || round.phase !== "finalReveal") return;
    this.settleRound();
    this.notify();
  }

  private advanceLevel(team: Team, amount: number): void {
    let index = RANKS.indexOf(this.state.levels[team]);
    for (let step = 0; step < amount; step += 1) {
      index = (index + 1) % RANKS.length;
      if (RANKS[index] === "2") this.state.roundsWon[team] += 1;
    }
    this.state.levels[team] = RANKS[index];
  }

  private settleRound(): void {
    const round = this.state.round!;
    const levelsBefore = { ...this.state.levels };
    const mainTeam = round.mainTeam!;
    const opponentTeam = OTHER_TEAM[mainTeam];
    const points = round.opponentPoints;
    const lastWinner = round.lastWinner!;
    const decision = decideSettlement(mainTeam, points, lastWinner);
    const {
      upgradeTeam,
      upgradeAmount,
      nextMainTeam,
      nextShootout,
      summary,
    } = decision;

    if (upgradeTeam && upgradeAmount > 0) {
      this.advanceLevel(upgradeTeam, upgradeAmount);
    }
    const levelsAfter = { ...this.state.levels };
    this.state.mainTeam = nextMainTeam;
    this.state.shootout = nextShootout;
    round.phase = "roundEnd";
    round.message = summary;
    round.roundResult = {
      opponentPoints: points,
      lastWinner,
      mainTeam,
      opponentTeam,
      upgradeTeam,
      upgradeAmount,
      nextMainTeam,
      nextShootout,
      levelsBefore,
      levelsAfter,
      summary,
      reason: decision.reason,
    };
    round.trickLead = null;
    round.trickPlays = [];
    this.log(summary);
  }

  nextRound(): void {
    const round = this.state.round;
    if (!round || round.phase !== "roundEnd") return;
    this.beginRound(true);
  }

  redealRound(): void {
    const round = this.state.round;
    if (!round || round.phase !== "redeal") return;
    this.beginRound(false);
  }

  humanDiscardScore(cards: Card[]): number {
    return cardPoints(cards);
  }

  isHumanTurn(): boolean {
    return (
      this.state.round?.phase === "playing" &&
      this.state.round.currentPlayer === HUMAN_PLAYER
    );
  }

  humanIsBottomPlayer(): boolean {
    return this.state.round?.bottomPlayer === HUMAN_PLAYER;
  }

  humanTrumpForDisplay(): Suit | null | undefined {
    return this.getKnownTrumpForHuman();
  }

  describeCard(card: Card): string {
    return cardName(card);
  }

  levelValue(rank: Rank): number {
    return RANK_VALUE[rank];
  }

  handContainsJoker(cards: Card[]): boolean {
    return cards.some(isJoker);
  }
}
