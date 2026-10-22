import {
  HUMAN_PLAYER,
  OTHER_TEAM,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  TEAM_OF,
} from "../../game/cards";
import {
  DIFFICULTY_LABELS,
  SEAT_POSITION,
  teamText,
} from "../../game/presentation";
import type {
  AIDifficulty,
  PlayerId,
  RoundState,
} from "../../game/types";
import { CardBack, PlayingCard } from "../cards/PlayingCard";

export function Seat({
  player,
  name,
  difficulty,
  round,
  current,
  leading,
  winner,
}: {
  player: PlayerId;
  name: string;
  difficulty: AIDifficulty;
  round: RoundState;
  current: boolean;
  leading: boolean;
  winner: boolean;
}) {
  const team = TEAM_OF[player];
  const play = round.trickPlays.find((item) => item.player === player);
  const isBottom = round.bottomPlayer === player;
  const isDealer = round.dealer === player;
  const calledHere = round.bid?.caller === player;

  return (
    <section
      className={`seat seat-${SEAT_POSITION[player]} team-${team} ${
        current ? "is-current" : ""
      } ${leading ? "is-leading" : ""} ${winner ? "is-winner" : ""}`}
    >
      <div className="seat-heading">
        <span className="team-dot" />
        <div>
          <strong>{name}</strong>
          <small className="seat-team-name">
            {team === "blue" ? "蓝方" : "红方"} · {player === HUMAN_PLAYER
              ? "你"
              : `AI · ${DIFFICULTY_LABELS[difficulty]}`}
          </small>
        </div>
        <span className="hand-count">{round.hands[player].length}</span>
      </div>
      <div className="seat-flags">
        {isDealer && <span>发牌</span>}
        {isBottom && <span>打底</span>}
        {current && (
          <span className="turn-flag">
            {player === HUMAN_PLAYER ? "轮到你出牌" : "正在出牌"}
          </span>
        )}
        {calledHere && <span className="called-flag">叫主</span>}
        {leading && <span className="leading-flag">当前最大</span>}
        {winner && <span className="winner-flag">赢墩</span>}
      </div>
      <div className="seat-play-area">
        {!play && <CardBack compact count={round.hands[player].length} />}
        {play && (
          <div className="played-group">
            {play.cards.map((card) => (
              <PlayingCard key={card.id} card={card} compact trump={false} disabled />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function CalledCardDock({
  round,
  names,
}: {
  round: RoundState;
  names: Record<PlayerId, string>;
}) {
  if (!round.bid) return null;
  const { caller, calledCard } = round.bid;
  const showFace = round.trumpKnown || caller === HUMAN_PLAYER;
  const callerTeam = TEAM_OF[caller];

  return (
    <aside className={`call-dock team-${callerTeam}`}>
      {showFace ? (
        <PlayingCard card={calledCard} compact disabled trump />
      ) : (
        <CardBack compact />
      )}
      <div className="call-dock-copy">
        <span className="call-dock-owner">
          <i aria-hidden="true" />
          {names[caller]} 叫主
        </span>
        <b>
          {!round.trumpKnown
            ? "等待打底后公开"
            : round.trumpSuit === null
              ? "★ 无主"
              : `${SUIT_SYMBOLS[round.trumpSuit]} ${SUIT_NAMES[round.trumpSuit]}主`}
        </b>
      </div>
    </aside>
  );
}

export function CaptureZone({ round }: { round: RoundState }) {
  const scoringTeam = round.mainTeam ? OTHER_TEAM[round.mainTeam] : null;
  const opponent = scoringTeam ? teamText(scoringTeam) : "旁家";

  return (
    <section className={`capture-zone ${scoringTeam ? `team-${scoringTeam}` : "is-pending"}`}>
      <div className="capture-heading">
        <div>
          <span className="eyebrow">TRICK POINTS</span>
          <h3>
            <i className="capture-team-dot" />
            {opponent}吃分区
          </h3>
        </div>
        <strong>{round.opponentPoints}<small>分</small></strong>
      </div>
      <div className="capture-groups">
        {round.capturedTricks.length === 0 && (
          <p className="capture-empty">还没有吃到分牌</p>
        )}
        {round.capturedTricks.map((trick) => (
          <div
            className={`capture-group team-${TEAM_OF[trick.winner]}`}
            key={`capture-${trick.trickNumber}`}
          >
            <div className="capture-group-label">
              <span>第 {trick.trickNumber} 墩</span>
              <b>+{trick.points}</b>
            </div>
            <div className="capture-cards">
              {trick.cards.map((card) => (
                <PlayingCard
                  key={`capture-${trick.trickNumber}-${card.id}`}
                  card={card}
                  compact
                  disabled
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
