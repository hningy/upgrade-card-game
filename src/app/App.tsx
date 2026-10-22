import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGameAudio } from "../audio/useGameAudio";
import { CardBack, PlayingCard } from "../components/cards/PlayingCard";
import {
  CalledCardDock,
  CaptureZone,
  Seat,
} from "../components/game/TableParts";
import {
  CoinFlipOverlay,
  FinalRevealOverlay,
  RoundEndModal,
  RulesPopover,
} from "../components/dialogs/GameDialogs";
import {
  HUMAN_PLAYER,
  DEFAULT_AI_DIFFICULTIES,
  DEFAULT_PLAYER_NAMES,
  PLAYERS,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  TEAM_OF,
  cardPoints,
  isTrump,
  sortHand,
} from "../game/cards";
import { GameSession } from "../game/engine";
import {
  DIFFICULTY_LABELS,
  PHASE_LABEL,
  rankText,
  teamText,
} from "../game/presentation";
import { determineCurrentTrickWinner } from "../game/rules";
import type {
  AIDifficulty,
  Card,
  PlayerId,
  Suit,
} from "../game/types";

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg className="volume-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      {muted ? (
        <path d="m17 9 5 5m0-5-5 5" />
      ) : (
        <>
          <path d="M16 9.5q2 2.5 0 5" />
          <path d="M19 7q4 5 0 10" />
        </>
      )}
    </svg>
  );
}

function App() {
  const sessionRef = useRef<GameSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new GameSession();
  const session = sessionRef.current;
  const version = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const game = session.state;
  const round = game.round!;
  const playerNames = session.playerNames;
  const audio = useGameAudio(round.phase);
  const previousDealCount = useRef(round.dealCount);
  const previousTrickPlayCount = useRef(round.trickPlays.length);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [bidSecondsLeft, setBidSecondsLeft] = useState(5);
  const [reviewSecondsLeft, setReviewSecondsLeft] = useState(5);
  const [finalSecondsLeft, setFinalSecondsLeft] = useState(5);
  const [managed, setManaged] = useState(false);
  const [suggestionNotice, setSuggestionNotice] = useState("");
  const [suggestedIds, setSuggestedIds] = useState<string[]>([]);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(15);

  useEffect(() => {
    if (round.phase === "dealing" && round.dealCount > previousDealCount.current) {
      audio.playDealSound();
    }
    if (
      round.phase === "playing" &&
      round.trickPlays.length > previousTrickPlayCount.current
    ) {
      audio.playCardSound();
    }
    previousDealCount.current = round.dealCount;
    previousTrickPlayCount.current = round.trickPlays.length;
  }, [
    audio.playCardSound,
    audio.playDealSound,
    round.dealCount,
    round.phase,
    round.trickPlays.length,
  ]);
  const [showNames, setShowNames] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<PlayerId, string>>({
    ...DEFAULT_PLAYER_NAMES,
  });
  const [draftDifficulties, setDraftDifficulties] =
    useState<Record<PlayerId, AIDifficulty>>({ ...DEFAULT_AI_DIFFICULTIES });

  const selectionKey = `${round.phase}:${round.currentPlayer}:${round.trickNumber}:${round.bottomPlayer ?? ""}`;
  useEffect(() => {
    setSelectedIds([]);
    setSuggestedIds([]);
    setSuggestionNotice("");
  }, [selectionKey]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("upgrade-player-names");
      if (saved) {
        session.setPlayerNames(
          JSON.parse(saved) as Partial<Record<PlayerId, string>>,
        );
      }
      const savedDifficulties = window.localStorage.getItem(
        "upgrade-ai-difficulties",
      );
      if (savedDifficulties) {
        session.setAIDifficulties(
          JSON.parse(savedDifficulties) as Partial<Record<PlayerId, AIDifficulty>>,
        );
      }
    } catch {
      // Ignore invalid saved settings and keep the new default names.
    }
  }, [session]);

  const callOptions = session.getHumanCallOptions();
  const callSignature = callOptions
    .map((option) => option ?? "joker")
    .sort()
    .join("|");
  const waitingForHumanBid =
    round.phase === "dealing" &&
    !round.bid &&
    callOptions.length > 0;

  useEffect(() => {
    if (!waitingForHumanBid) {
      setBidSecondsLeft(5);
      return;
    }
    setBidSecondsLeft(5);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setBidSecondsLeft(Math.max(0, Math.ceil((5000 - elapsed) / 1000)));
    }, 100);
    const timeout = window.setTimeout(() => {
      if (session.state.round?.phase === "dealing" && !session.state.round.bid) {
        session.dealNext();
      }
    }, 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [session, waitingForHumanBid, round.dealCount, callSignature]);

  useEffect(() => {
    if (round.phase !== "trickReview") {
      setReviewSecondsLeft(5);
      return;
    }
    setReviewSecondsLeft(5);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setReviewSecondsLeft(Math.max(0, Math.ceil((5000 - elapsed) / 1000)));
    }, 100);
    const timeout = window.setTimeout(() => session.continueAfterTrick(), 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [session, round.phase, round.trickNumber]);

  useEffect(() => {
    if (round.phase !== "finalReveal") {
      setFinalSecondsLeft(5);
      return;
    }
    setFinalSecondsLeft(5);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setFinalSecondsLeft(Math.max(0, Math.ceil((5000 - elapsed) / 1000)));
    }, 100);
    const timeout = window.setTimeout(() => session.finishFinalReveal(), 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [session, round.phase]);

  useEffect(() => {
    if (!managed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (round.phase === "dealing" && waitingForHumanBid) {
      timer = setTimeout(() => session.autoHumanBid(), 320);
    } else if (round.phase === "revolt") {
      timer = setTimeout(() => session.respondToRevolt(false), 420);
    } else if (round.phase === "chooseBottom") {
      timer = setTimeout(() => session.chooseBottom(Math.random() < 0.5), 480);
    } else if (round.phase === "burying" && round.bottomPlayer === HUMAN_PLAYER) {
      timer = setTimeout(() => session.autoBuryHuman(), 480);
    } else if (round.phase === "playing" && round.currentPlayer === HUMAN_PLAYER) {
      timer = setTimeout(() => session.autoPlayHuman(), 520);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    managed,
    session,
    version,
    waitingForHumanBid,
    round.phase,
    round.currentPlayer,
    round.bottomPlayer,
    round.dealCount,
  ]);

  useEffect(() => {
    if (
      !managed ||
      (round.phase !== "trickReview" && round.phase !== "finalReveal")
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (round.phase === "trickReview") session.continueAfterTrick();
      else session.finishFinalReveal();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [managed, session, round.phase, round.trickNumber]);

  const isFinalSingleRound =
    round.phase === "playing" &&
    Object.values(round.hands).every((hand) => hand.length === 1);

  const humanTurnActive =
    round.phase === "playing" &&
    round.currentPlayer === HUMAN_PLAYER &&
    !managed;
  const selectionToken = selectedIds.join(",");

  useEffect(() => {
    if (!humanTurnActive) {
      setTurnSecondsLeft(15);
      return;
    }
    setTurnSecondsLeft(15);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setTurnSecondsLeft(Math.max(0, Math.ceil((15000 - elapsed) / 1000)));
    }, 100);
    const timeout = window.setTimeout(() => {
      const current = session.state.round;
      if (
        current?.phase === "playing" &&
        current.currentPlayer === HUMAN_PLAYER
      ) {
        session.autoPlayHuman();
      }
    }, 15000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [
    session,
    humanTurnActive,
    round.trickNumber,
    selectionToken,
  ]);

  useEffect(() => {
    if (!isFinalSingleRound || managed || round.currentPlayer !== HUMAN_PLAYER) {
      return;
    }
    const timer = window.setTimeout(() => session.autoPlayHuman(), 480);
    return () => window.clearTimeout(timer);
  }, [
    session,
    isFinalSingleRound,
    managed,
    round.currentPlayer,
    round.trickNumber,
  ]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (round.phase === "dealing" && !waitingForHumanBid) {
      timer = setTimeout(() => session.dealNext(), 130);
    } else if (round.phase === "coin") {
      timer = setTimeout(() => session.resolveCoin(), 3000);
    } else if (round.phase === "redeal") {
      timer = setTimeout(() => session.redealRound(), 1100);
    } else if (round.phase === "burying" && round.bottomPlayer !== HUMAN_PLAYER) {
      timer = setTimeout(() => session.autoBury(), 800);
    } else if (round.phase === "reveal") {
      timer = setTimeout(() => session.beginPlay(), 1200);
    } else if (round.phase === "playing" && round.currentPlayer !== HUMAN_PLAYER) {
      timer = setTimeout(() => session.autoPlay(), 720);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    session,
    version,
    round.phase,
    round.dealCount,
    round.currentPlayer,
    round.bottomPlayer,
    waitingForHumanBid,
  ]);

  const humanTrump = session.getKnownTrumpForHuman();
  const humanTrumpKnown = humanTrump !== undefined;
  const trumpForStrength: Suit | null = humanTrump ?? null;
  const currentTrickWinner =
    round.phase === "playing" && round.trickLead && round.trickPlays.length > 0
      ? determineCurrentTrickWinner(
        round.trickPlays,
        round.level!,
        round.trumpSuit,
      )
      : null;
  const sortedHumanHand = sortHand(
    round.hands[HUMAN_PLAYER],
    round.level,
    trumpForStrength,
    Boolean(round.level),
  );
  const selectedCards = sortedHumanHand.filter((card) => selectedIds.includes(card.id));
  const canChooseCards =
    !managed &&
    (round.phase === "burying" && round.bottomPlayer === HUMAN_PLAYER ||
      round.phase === "playing" && round.currentPlayer === HUMAN_PLAYER);
  const discardPoints = cardPoints(selectedCards);
  const selectionCheck = session.inspectHumanSelection(selectedCards);
  const humanBid =
    round.bid?.caller === HUMAN_PLAYER && !round.trumpKnown
      ? round.bid
      : null;

  function toggleCard(card: Card) {
    if (!canChooseCards) return;
    setSuggestedIds([]);
    setSuggestionNotice("");
    setSelectedIds((current) =>
      current.includes(card.id)
        ? current.filter((id) => id !== card.id)
        : [...current, card.id],
    );
  }

  function submitPlay() {
    session.playHuman(selectedCards);
  }

  function useSuggestion() {
    const suggestion = session.suggestHumanPlay();
    if (suggestion) {
      setSelectedIds(suggestion.map((card) => card.id));
      setSuggestedIds(suggestion.map((card) => card.id));
      setSuggestionNotice(`建议已选中 ${suggestion.length} 张`);
    }
  }

  function useBurySuggestion() {
    const suggestion = session.suggestHumanBury();
    if (suggestion) {
      setSelectedIds(suggestion.map((card) => card.id));
      setSuggestedIds(suggestion.map((card) => card.id));
      setSuggestionNotice(`打底建议已选中 6 张，共 ${cardPoints(suggestion)} 分`);
    }
  }

  function submitBury() {
    if (session.buryHuman(selectedCards)) setSelectedIds([]);
  }

  function openNameEditor() {
    setDraftNames({ ...session.playerNames });
    setDraftDifficulties({ ...session.aiDifficulties });
    setShowNames(true);
  }

  function savePlayerNames() {
    session.setPlayerNames(draftNames);
    session.setAIDifficulties(draftDifficulties);
    window.localStorage.setItem("upgrade-player-names", JSON.stringify(draftNames));
    window.localStorage.setItem(
      "upgrade-ai-difficulties",
      JSON.stringify(draftDifficulties),
    );
    setShowNames(false);
  }

  const opponentPointsLabel = round.mainTeam
    ? `${teamText(round.mainTeam === "blue" ? "red" : "blue")}得分`
    : "旁家得分";
  const knownTrumpLabel = humanTrumpKnown
    ? humanTrump === null
      ? "无主"
      : `${SUIT_NAMES[humanTrump]}主`
    : "暗主";
  const message = round.message;
  const centerMessage = waitingForHumanBid
    ? `轮到你考虑叫主：${callOptions
      .map((option) => option === null ? "王 · 无主" : `${SUIT_NAMES[option]}主`)
      .join(" / ")}。${bidSecondsLeft} 秒内不叫将自动继续`
    : message;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span>♠</span><span>♥</span>
          </div>
          <div>
            <span className="eyebrow">FOUR PLAYER CARD GAME</span>
            <h1>升级</h1>
          </div>
        </div>
        <div className="level-strip">
          <div className="level-chip blue">
            <span>蓝方 · {playerNames.blue1} / {playerNames.blue2}</span>
            <b>{rankText(game.levels.blue)}</b>
          </div>
          <div className="level-chip red">
            <span>红方 · {playerNames.red1} / {playerNames.red2}</span>
            <b>{rankText(game.levels.red)}</b>
          </div>
        </div>
        <div className="toolbar">
          <div className="sound-control">
            <button
              type="button"
              className={`sound-toggle ${audio.muted ? "is-muted" : ""}`}
              aria-label={audio.muted ? "取消静音" : "静音"}
              title={audio.muted ? "取消静音" : "背景音乐静音"}
              onClick={audio.toggleMuted}
            >
              <VolumeIcon muted={audio.muted} />
              <span>{audio.muted ? "已静音" : "音乐"}</span>
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(audio.volume * 100)}
              aria-label="背景音乐音量"
              onChange={(event) => audio.setVolume(Number(event.target.value) / 100)}
            />
            <span>{audio.muted ? "关" : `${Math.round(audio.volume * 100)}%`}</span>
            {audio.blocked && !audio.muted && (
              <button
                type="button"
                className="sound-unlock"
                onClick={audio.unlockAudio}
              >
                启动音乐
              </button>
            )}
          </div>
          <button
            type="button"
            className={`managed-button ${managed ? "is-active" : ""}`}
            aria-pressed={managed}
            onClick={() => setManaged((active) => !active)}
          >
            <span className="managed-icon" aria-hidden="true">◉</span>
            {managed ? "取消托管" : "AI 托管"}
          </button>
          <button type="button" className="ghost-button" onClick={() => setShowRules(true)}>规则</button>
          <button type="button" className="ghost-button" onClick={openNameEditor}>玩家与 AI</button>
          <button type="button" className="ghost-button" onClick={() => session.restart()}>重新开局</button>
        </div>
      </header>

      <section className="match-strip">
        <span className="round-pill">第 {game.roundNumber} 局</span>
        <span className="phase-pill">{PHASE_LABEL[round.phase]}</span>
        <div className={`status-tile level-status ${round.mainTeam ?? "pending"}`}>
          <small>本局打</small>
          <b>{rankText(round.level)}</b>
        </div>
        <div className={`status-tile main-status ${round.mainTeam ?? "pending"}`}>
          <small>主家</small>
          <b>{round.mainTeam ? teamText(round.mainTeam) : "抢报中"}</b>
        </div>
        <div className={`status-tile trump-status ${
          humanTrump === "H" || humanTrump === "D" ? "red-suit" : ""
        }`}>
          <i aria-hidden="true" className="trump-symbol">
            {!humanTrumpKnown ? "▣" : humanTrump === null ? "★" : SUIT_SYMBOLS[humanTrump]}
          </i>
          <div>
            <small>令花色</small>
            <b>{knownTrumpLabel}</b>
          </div>
        </div>
        <span className="match-strip-spacer" />
        <span className="point-summary">
          {opponentPointsLabel} <b className="points-inline">{round.opponentPoints}</b>
        </span>
      </section>

      <section className="game-stage">
        <div className="table-glow" />
        <div className="table">
          <div className="table-ring" />
          {(["blue2", "red1", "red2", "blue1"] as PlayerId[]).map((player) => (
            <Seat
              key={player}
              player={player}
              name={playerNames[player]}
              difficulty={session.aiDifficulties[player]}
              round={round}
              current={round.phase === "playing" && round.currentPlayer === player}
              leading={round.phase === "playing" && currentTrickWinner === player}
              winner={round.phase === "trickReview" && round.lastTrick?.winner === player}
            />
          ))}
          <CalledCardDock round={round} names={playerNames} />

          <div className="table-center">
            <div className="center-kicker">{PHASE_LABEL[round.phase]}</div>
            <p>{centerMessage}</p>
            {round.phase === "playing" && (
              <div className="turn-and-lead">
                <span>轮到 <b>{playerNames[round.currentPlayer]}</b></span>
                <i />
                <span>
                  当前最大{" "}
                  <b className="is-gold">
                    {currentTrickWinner ? playerNames[currentTrickWinner] : "等待首牌"}
                  </b>
                </span>
              </div>
            )}
            {humanTurnActive && (
              <div className="turn-countdown">
                <span>轮到你出牌</span>
                <b>{turnSecondsLeft}s</b>
                <small>超时后由一般 AI 自动出牌</small>
              </div>
            )}
            {round.phase === "trickReview" && round.lastTrick && (
              <div className="trick-review-result">
                <span className={`team-text-${TEAM_OF[round.lastTrick.winner]}`}>
                  {teamText(TEAM_OF[round.lastTrick.winner])} ·{" "}
                  {playerNames[round.lastTrick.winner]}赢下第 {round.lastTrick.number} 墩
                </span>
                <b>
                  {round.lastTrick.pointsCounted
                    ? `+${round.lastTrick.points} 分`
                    : Object.values(round.hands).every((hand) => hand.length === 0)
                      ? "亮牌 · 不计分"
                      : round.lastTrick.points > 0
                        ? "主家不计分"
                        : "无分"}
                </b>
                <small>
                  {managed ? "托管中 · 自动继续" : `${reviewSecondsLeft} 秒后继续`}
                </small>
              </div>
            )}
            <div className="center-metrics">
              <div>
                <span>发牌</span>
                <b>{round.dealCount}/48</b>
              </div>
              <div>
                <span>第几墩</span>
                <b>{round.phase === "playing" ? round.trickNumber : "—"}</b>
              </div>
              <div className="score-metric">
                <span>{opponentPointsLabel}</span>
                <b>{round.opponentPoints}</b>
              </div>
            </div>
            {round.lastTrick && (
              <div className="last-trick">
                <span className={`team-text-${TEAM_OF[round.lastTrick.winner]}`}>
                  上墩：{teamText(TEAM_OF[round.lastTrick.winner])} ·{" "}
                  {playerNames[round.lastTrick.winner]}赢
                </span>
                {round.lastTrick.points > 0
                  ? ` · ${round.lastTrick.points} 分不计`
                  : " · 无分"}
              </div>
            )}
          </div>
        </div>

        <aside className="right-rail">
          <CaptureZone round={round} />
          <div className="event-feed">
            <div className="feed-heading">
              <span>牌局记录</span>
              <span>LIVE</span>
            </div>
            <div className="feed-list">
              {round.events.slice(-8).reverse().map((event, index) => (
                <p key={`${event}-${index}`}>{event}</p>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="hand-zone">
        <div className="hand-toolbar">
          <div>
            <span className="eyebrow">YOUR HAND</span>
            <h2>你的手牌 <small>{round.hands[HUMAN_PLAYER].length} 张</small></h2>
          </div>
          <div className="hand-actions">
            {managed && round.phase !== "roundEnd" && (
              <span className="managed-status">
                托管中 · AI 正在替你决策
              </span>
            )}
            {humanTurnActive && (
              <div className="turn-countdown compact">
                <b>{turnSecondsLeft}s</b>
                <span>超时自动出牌</span>
              </div>
            )}
            {round.phase === "dealing" && (
              <>
                {humanBid && (
                  <div className="bid-private">
                    你已叫主：{humanBid.jokerCall ? "无主" : `${SUIT_NAMES[humanBid.trumpSuit!]}主`} · 花色暂不公开
                  </div>
                )}
                {waitingForHumanBid && callOptions.map((option) => (
                  <button
                    type="button"
                    className="call-button"
                    key={option ?? "joker"}
                    onClick={() => session.humanCall(option)}
                  >
                    叫 {option === null ? "王 · 无主" : `${SUIT_NAMES[option]}主`}
                  </button>
                ))}
                {waitingForHumanBid && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => session.dealNext()}
                  >
                    不叫 · 继续发牌
                  </button>
                )}
                {waitingForHumanBid && (
                  <span className="bid-countdown">{bidSecondsLeft}s 后自动过</span>
                )}
                {!round.bid && callOptions.length === 0 && (
                  <span className="waiting-copy">叫主窗口开放 · 等待级牌或王…</span>
                )}
                {round.bid && round.bid.caller !== HUMAN_PLAYER && (
                  <span className="waiting-copy">
                    {playerNames[round.bid.caller]}已叫主 · 令花色打底后公开
                  </span>
                )}
                {!humanBid && callOptions.length > 0 && !waitingForHumanBid && (
                  <span className="waiting-copy">发牌继续…</span>
                )}
              </>
            )}

            {round.phase === "burying" && round.bottomPlayer === HUMAN_PLAYER && (
              <>
                <div className={`bury-meter ${discardPoints > 25 ? "is-over" : ""}`}>
                  <span>弃牌 {selectedIds.length}/6</span>
                  <b>{discardPoints}/25 分</b>
                </div>
                <button
                  type="button"
                  className="suggestion-button"
                  disabled={managed}
                  onClick={useBurySuggestion}
                >
                  打底建议
                </button>
                {suggestionNotice && (
                  <span className="suggestion-notice">{suggestionNotice}</span>
                )}
                <button
                  type="button"
                  className="primary-button"
                  disabled={managed || selectedIds.length !== 6 || discardPoints > 25}
                  onClick={submitBury}
                >
                  确认打底
                </button>
              </>
            )}

            {round.phase === "playing" && (
              <>
                <div className={`selection-status ${selectionCheck.ok ? "is-ok" : ""}`}>
                  {selectedIds.length === 0
                    ? round.trickLead
                      ? `请选择 ${round.trickLead.cards.length} 张牌跟牌`
                      : "选择单张，或同花色多张尝试甩牌"
                    : suggestionNotice || selectionCheck.reason || `已选 ${selectedIds.length} 张`}
                </div>
                <button
                  type="button"
                  className="suggestion-button"
                  disabled={managed || !session.isHumanTurn()}
                  onClick={useSuggestion}
                >
                  出牌建议
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={managed || !session.isHumanTurn() || !selectionCheck.ok}
                  onClick={submitPlay}
                >
                  {selectedIds.length > 1 ? "甩牌" : "出牌"}
                </button>
              </>
            )}

            {round.phase === "playing" && !session.isHumanTurn() && (
              <span className="waiting-copy">等待 {playerNames[round.currentPlayer]} 出牌…</span>
            )}

            {round.phase === "trickReview" && (
              <>
                <div className="review-status">
                  <b>{playerNames[round.lastTrick!.winner]}赢墩</b>
                  <span>
                    {managed ? "托管中 · 即将自动继续" : `${reviewSecondsLeft} 秒后继续`}
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => session.continueAfterTrick()}
                >
                  跳过等待
                </button>
              </>
            )}
          </div>
        </div>

        {round.phase === "burying" && (
          <section className="bottom-preview">
            <div className="bottom-preview-label">
              <span className="eyebrow">BOTTOM CARDS</span>
              <b>
                {round.bottomPlayer === HUMAN_PLAYER
                  ? "你拿到的底牌"
                  : `${playerNames[round.bottomPlayer!]}正在查看底牌`}
              </b>
              <small>
                {round.bottomPlayer === HUMAN_PLAYER
                  ? round.bid
                    ? "六张底牌已经并入下方手牌，请从中选择六张弃牌"
                    : "暗抽牌打完底后才翻面，其余五张已并入下方手牌"
                  : "仅打底者可见底牌正面"}
              </small>
            </div>
            <div className="bottom-preview-cards">
              {round.bottomPlayer === HUMAN_PLAYER
                ? round.bottomDisplay.map((card) => (
                  <PlayingCard key={`bottom-${card.id}`} card={card} compact disabled />
                ))
                : round.bottomDisplay.map((card) => (
                  <CardBack key={`bottom-back-${card.id}`} compact />
                ))}
              {!round.bid && (
                <div className="hidden-bottom-card">
                  <CardBack compact />
                  <span>待翻</span>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="hand-scroll">
          <div className="human-hand">
            {sortedHumanHand.map((card) => {
              const knownTrump = Boolean(
                round.level && isTrump(card, round.level, trumpForStrength),
              );
              return (
                <PlayingCard
                  key={card.id}
                  card={card}
                  selected={selectedIds.includes(card.id)}
                  suggested={suggestedIds.includes(card.id)}
                  disabled={!canChooseCards}
                  trump={knownTrump}
                  onClick={canChooseCards ? () => toggleCard(card) : undefined}
                />
              );
            })}
            {sortedHumanHand.length === 0 && (
              <div className="empty-hand">正在发牌…</div>
            )}
          </div>
        </div>
      </section>

      {round.phase === "revolt" && round.revoltPrompt && (
        <div className="popover-scrim modal-scrim">
          <section className="decision-modal">
            <span className="eyebrow">REBEL</span>
            <h2>是否起义？</h2>
            <p>{round.revoltPrompt.reason}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => session.respondToRevolt(true)}
              >
                {round.revoltPrompt.mode === "initiate" ? "发起起义" : "同意起义"}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => session.respondToRevolt(false)}
              >
                继续本局
              </button>
            </div>
          </section>
        </div>
      )}

      {round.phase === "chooseBottom" && (
        <div className="popover-scrim modal-scrim bottom-choice-scrim">
          <section className="decision-modal">
            <span className="eyebrow">BOTTOM CARDS</span>
            <h2>主家协商打底</h2>
            <p>你和队友分别选择“打”或“不打”。只有一人想打时由该玩家打底；两人选择相同则抛硬币决定。</p>
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={() => session.chooseBottom(true)}>
                我来打底
              </button>
              <button type="button" className="ghost-button" onClick={() => session.chooseBottom(false)}>
                让队友打底
              </button>
            </div>
          </section>
        </div>
      )}

      {round.phase === "roundEnd" && round.roundResult && (
        <RoundEndModal
          round={round}
          names={playerNames}
          onNext={() => session.nextRound()}
        />
      )}

      {round.phase === "finalReveal" && (
        <FinalRevealOverlay
          round={round}
          names={playerNames}
          secondsLeft={finalSecondsLeft}
          managed={managed}
          onFinish={() => session.finishFinalReveal()}
        />
      )}

      {round.phase === "coin" && round.coinFlip && <CoinFlipOverlay round={round} />}

      {showRules && <RulesPopover onClose={() => setShowRules(false)} />}

      {showNames && (
        <div className="popover-scrim modal-scrim">
          <section className="name-modal">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">PLAYERS & AI</span>
                <h2>玩家名称与 AI 难度</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowNames(false)}
                aria-label="关闭名称设置"
              >
                ×
              </button>
            </div>
            <p className="name-modal-copy">
              名称最多 10 个字符。三个 AI 可以分别选择简单、一般或高级。
            </p>
            <div className="name-fields">
              {PLAYERS.map((player) => (
                <label className={`name-field team-${TEAM_OF[player]}`} key={player}>
                  <span>
                    {TEAM_OF[player] === "blue" ? "蓝方" : "红方"}
                    {player === HUMAN_PLAYER ? " · 你" : " · AI"}
                  </span>
                  <input
                    value={draftNames[player]}
                    maxLength={10}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDraftNames((current) => ({ ...current, [player]: name }));
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="difficulty-settings">
              <div className="settlement-section-heading">
                <div>
                  <span className="eyebrow">AI DIFFICULTY</span>
                  <h3>三个 AI 独立设置</h3>
                </div>
              </div>
              {PLAYERS.filter((player) => player !== HUMAN_PLAYER).map((player) => (
                <div className={`difficulty-row team-${TEAM_OF[player]}`} key={`ai-${player}`}>
                  <div>
                    <b>{draftNames[player] || DEFAULT_PLAYER_NAMES[player]}</b>
                    <span>{TEAM_OF[player] === "blue" ? "蓝方队友" : "红方对手"}</span>
                  </div>
                  <div className="difficulty-options">
                    {(["easy", "normal", "hard"] as AIDifficulty[]).map((difficulty) => (
                      <button
                        type="button"
                        key={difficulty}
                        className={draftDifficulties[player] === difficulty ? "is-active" : ""}
                        onClick={() =>
                          setDraftDifficulties((current) => ({
                            ...current,
                            [player]: difficulty,
                          }))
                        }
                      >
                        {DIFFICULTY_LABELS[difficulty]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions name-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setDraftNames({ ...DEFAULT_PLAYER_NAMES });
                  setDraftDifficulties({ ...DEFAULT_AI_DIFFICULTIES });
                }}
              >
                恢复默认
              </button>
              <button type="button" className="primary-button" onClick={savePlayerNames}>
                保存设置
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
