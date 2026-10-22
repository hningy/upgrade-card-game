import { useEffect, useState } from "react";
import { PlayingCard } from "../cards/PlayingCard";
import { TEAM_OF, cardPoints, cardScore } from "../../game/cards";
import { settlementReason, teamText } from "../../game/presentation";
import type { PlayerId, RoundState } from "../../game/types";
export function CoinFlipOverlay({ round }: { round: RoundState }) {
  const event = round.coinFlip!;
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), 950);
    return () => window.clearTimeout(timer);
  }, [event.title, event.resultText]);

  return (
    <div className="popover-scrim coin-scrim">
      <section className="coin-modal" aria-live="polite">
        <span className="eyebrow">COIN TOSS</span>
        <h2>{event.title}</h2>
        <div className={`coin-stage ${settled ? "is-settled" : ""}`}>
          <div className="coin-shadow" />
          <div className="coin-disc">
            <span>升</span>
          </div>
        </div>
        <p className={settled ? "coin-result is-visible" : "coin-result"}>
          {settled ? event.resultText : "硬币旋转中…"}
        </p>
      </section>
    </div>
  );
}

export function RulesPopover({ onClose }: { onClose: () => void }) {
  return (
    <div className="popover-scrim" onClick={onClose}>
      <aside className="rules-popover" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">HOW TO PLAY</span>
            <h2>升级 · 快速规则</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭规则">
            ×
          </button>
        </div>
        <div className="rules-copy">
          <p><b>目标</b>：四人两队，主家打自己的级别，旁家吃 K、10、5 的分。</p>
          <p><b>叫主</b>：发牌时持本局级牌可叫其花色；拿王可叫无主。叫主者姓名立即公开，令花色在打底后揭晓。</p>
          <p><b>打底</b>：主家决定谁打底。拿走底牌后弃六张，弃牌总分不得超过 25。</p>
          <p><b>跟牌</b>：有首牌花色必须跟；没有时可垫杂牌或用主牌载牌。</p>
          <p><b>甩牌</b>：同花色多张且其他任何人都压不过才能成功；失败只保留最小一张。</p>
          <p><b>计分</b>：K、10 各 10 分，5 计 5 分。旁家 45 分升一级，65 分升两级。</p>
          <p><b>0 分</b>：主家赢最后一墩升两级；旁家赢最后一墩，下局进入抢报。</p>
          <p><b>末墩亮牌</b>：全场最后一轮四家各出的牌正常比大小，牌权最大者就是亮牌赢家；旁家 0 分时由它决定升级或抢报。</p>
          <p><b>起义</b>：旁家一人手中没有分牌即可发起，需另一名旁家同意。</p>
        </div>
      </aside>
    </div>
  );
}

export function RoundEndModal({
  round,
  names,
  onNext,
}: {
  round: RoundState;
  names: Record<PlayerId, string>;
  onNext: () => void;
}) {
  const result = round.roundResult!;
  const explanation = settlementReason(result);
  const lastTrick = round.lastTrick;
  const lastWinnerTeam = TEAM_OF[result.lastWinner];
  const upgradeTeam = result.upgradeTeam;
  const upgradeTeamText = upgradeTeam ? teamText(upgradeTeam) : null;
  const discardPoints = cardPoints(round.discard);
  const discardScoreCards = round.discard.filter((card) => cardScore(card) > 0);
  return (
    <div className="popover-scrim modal-scrim">
      <section className="round-modal">
        <span className="eyebrow">ROUND RESULT</span>
        <h2>{result.summary}</h2>
        <div className={`result-winner-band team-${lastWinnerTeam}`}>
          <span>末墩亮牌赢家</span>
          <strong>{teamText(lastWinnerTeam)} · {names[result.lastWinner]}赢</strong>
        </div>
        <div className="result-score">
          <span>旁家得分</span>
          <strong>{result.opponentPoints}</strong>
        </div>
        {upgradeTeam && result.upgradeAmount > 0 ? (
          <div className={`result-outcome team-${upgradeTeam}`}>
            <span>本局结果</span>
            <strong>
              {upgradeTeamText}升{result.upgradeAmount}级
            </strong>
            <div>
              <b>{result.levelsBefore[upgradeTeam]}</b>
              <i>→</i>
              <b>{result.levelsAfter[upgradeTeam]}</b>
            </div>
          </div>
        ) : (
          <div className="result-outcome is-neutral">
            <span>本局结果</span>
            <strong>双方不升级</strong>
            <div>下一局抢报</div>
          </div>
        )}
        <div className="result-reason">
          <span>结算原因</span>
          <p>{explanation}</p>
        </div>
        <div className="result-grid">
          <div>
            <span>蓝方级别</span>
            <b>{result.levelsBefore.blue} → {result.levelsAfter.blue}</b>
          </div>
          <div>
            <span>红方级别</span>
            <b>{result.levelsBefore.red} → {result.levelsAfter.red}</b>
          </div>
          <div>
            <span>末墩亮牌赢家</span>
            <b className={`team-text-${lastWinnerTeam}`}>
              {teamText(lastWinnerTeam)} · {names[result.lastWinner]}
            </b>
          </div>
          <div>
            <span>下一局</span>
            <b>{result.nextShootout ? "抢报" : `${teamText(result.nextMainTeam)}主家`}</b>
          </div>
        </div>
        <div className="settlement-details">
          {lastTrick && (
            <section className="settlement-section">
              <div className="settlement-section-heading">
                <div>
                  <span className="eyebrow">FINAL TRICK</span>
                  <h3>末墩亮牌 · 全场最后四手</h3>
                </div>
                <b className={`team-text-${TEAM_OF[lastTrick.winner]}`}>
                  {teamText(TEAM_OF[lastTrick.winner])} · {names[lastTrick.winner]}赢
                </b>
              </div>
              <p className="settlement-note">
                这是全场最后一墩，四家按正常牌权比较大小，牌最大者就是亮牌赢家。
              </p>
              <div className="settlement-trick-grid">
                {lastTrick.plays.map((play, index) => (
                  <div
                    className={`settlement-trick-play team-${TEAM_OF[play.player]} ${
                      play.player === lastTrick.winner ? "is-winner" : ""
                    } ${index === lastTrick.plays.length - 1 ? "is-last-play" : ""}`}
                    key={`settlement-${play.player}-${index}`}
                  >
                    <span>
                      {names[play.player]}
                      {index === lastTrick.plays.length - 1 && " · 最后一手"}
                    </span>
                    <div>
                      {play.cards.map((card) => (
                        <PlayingCard key={`settlement-${card.id}`} card={card} compact disabled />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {lastTrick.failedThrow && (
                <p className="settlement-note">本墩首手尝试甩牌失败，已改为只出最小一张。</p>
              )}
            </section>
          )}

          <section className="settlement-section">
            <div className="settlement-section-heading">
              <div>
                <span className="eyebrow">POINT BREAKDOWN</span>
                <h3>旁家得分构成</h3>
              </div>
              <b>{result.opponentPoints} 分</b>
            </div>
            {round.capturedTricks.length === 0 ? (
              <p className="capture-empty">旁家没有吃到任何分牌。</p>
            ) : (
              <div className="settlement-point-list">
                {round.capturedTricks.map((trick) => (
                  <div className="settlement-point-row" key={`ledger-${trick.trickNumber}`}>
                    <span>第 {trick.trickNumber} 墩</span>
                    <div>
                      {trick.cards.map((card) => (
                        <PlayingCard
                          key={`ledger-${trick.trickNumber}-${card.id}`}
                          card={card}
                          compact
                          disabled
                        />
                      ))}
                    </div>
                    <b>+{trick.points}</b>
                  </div>
                ))}
              </div>
            )}
            {discardScoreCards.length > 0 && (
              <div className="settlement-discard-row">
                <span>底牌弃分，不计入旁家得分</span>
                <div>
                  {discardScoreCards.map((card) => (
                    <PlayingCard key={`discard-${card.id}`} card={card} compact disabled />
                  ))}
                </div>
                <b>{discardPoints} 分</b>
              </div>
            )}
          </section>
        </div>
        <button type="button" className="primary-button wide" onClick={onNext}>
          开始下一局
        </button>
      </section>
    </div>
  );
}

export function FinalRevealOverlay({
  round,
  names,
  secondsLeft,
  managed,
  onFinish,
}: {
  round: RoundState;
  names: Record<PlayerId, string>;
  secondsLeft: number;
  managed: boolean;
  onFinish: () => void;
}) {
  const trick = round.lastTrick;
  if (!trick) return null;
  const lastPlay = trick.plays[trick.plays.length - 1];
  const winnerTeam = TEAM_OF[trick.winner];
  return (
    <div className="popover-scrim final-reveal-scrim">
      <section className="final-reveal-modal">
        <span className="eyebrow">FINAL REVEAL</span>
        <h2>末墩亮牌</h2>
        <p className="final-reveal-subtitle">
          全场最后四手比大小 · 最后一手：{names[lastPlay.player]} · {lastPlay.cards.length > 1
            ? `甩牌 ${lastPlay.cards.length} 张`
            : "单张"}
        </p>
        <div className="final-trick-stage">
          {trick.plays.map((play, index) => (
            <div
              className={`final-tableau-play team-${TEAM_OF[play.player]} ${
                play.player === trick.winner ? "is-winner" : ""
              }`}
              key={`final-${play.player}-${index}`}
            >
              <span>{names[play.player]}</span>
              <div>
                {play.cards.map((card) => (
                  <PlayingCard key={`final-${card.id}`} card={card} compact disabled />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="final-reveal-winner">
          <span>末墩亮牌赢家</span>
          <strong className={`team-text-${winnerTeam}`}>
            {teamText(winnerTeam)} · {names[trick.winner]}赢
          </strong>
          <small>
            {trick.points > 0
              ? `本墩 ${trick.points} 分只亮牌，不计入旁家得分`
              : "本墩无分"}
          </small>
        </div>
        <button type="button" className="primary-button wide" onClick={onFinish}>
          {managed ? "托管中 · 自动进入结算" : `查看详细结算 · ${secondsLeft}s`}
        </button>
      </section>
    </div>
  );
}
