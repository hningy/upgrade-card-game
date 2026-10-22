import { SUIT_SYMBOLS } from "../../game/cards";
import type { Card } from "../../game/types";

const CENTER_ART: Partial<Record<Card["rank"], string>> = {
  A: "/card-art/ace-ornament.png?v=2",
  BJ: "/card-art/joker-big.png?v=1",
  SJ: "/card-art/joker-small.png?v=1",
  J: "/card-art/jack-court.png?v=1",
  Q: "/card-art/queen-court.png?v=1",
  K: "/card-art/king-court.png?v=1",
};

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  suggested?: boolean;
  disabled?: boolean;
  trump?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

function RoyalArt({ rank }: { rank: "J" | "Q" | "K" }) {
  const crown =
    rank === "K"
      ? "M12 30 L15 16 L24 24 L32 11 L40 24 L49 16 L52 30 L46 34 L18 34 Z"
      : rank === "Q"
        ? "M14 29 Q18 16 25 22 Q31 11 39 22 Q46 16 50 29 L44 33 L20 33 Z"
        : "M15 31 Q19 24 22 17 Q29 25 31 12 L37 24 Q45 17 49 31 L43 35 L21 35 Z";
  return (
    <svg className="royal-art" viewBox="0 0 64 86" aria-hidden="true">
      <rect x="6" y="6" width="52" height="74" rx="5" className="royal-border" />
      <path d="M15 35 H49 V73 H15 Z" className="royal-robe" />
      <path d="M20 35 Q32 45 44 35 L41 55 Q32 60 23 55 Z" className="royal-shoulder" />
      <circle cx="32" cy="44" r="8" className="royal-face" />
      <path d="M25 42 Q32 36 39 42 Q36 49 32 51 Q28 49 25 42 Z" className="royal-hair" />
      <path d={crown} className="royal-crown" />
      <circle cx="32" cy="29" r="2.2" className="royal-jewel" />
      <path d="M19 63 Q32 56 45 63 L43 72 Q32 76 21 72 Z" className="royal-robe-light" />
      <text x="32" y="70" textAnchor="middle" className="royal-letter">{rank}</text>
      <path d="M12 67 H18 M46 67 H52" className="royal-detail" />
      <path d="M15 72 H20 M44 72 H49" className="royal-detail" />
    </svg>
  );
}

function JokerArt({ big }: { big: boolean }) {
  return (
    <svg className={`joker-art ${big ? "is-big" : "is-small"}`} viewBox="0 0 64 86" aria-hidden="true">
      <path d="M18 30 Q11 12 24 16 Q28 24 31 18 Q35 7 39 19 Q49 9 47 29 Z" className="joker-hat" />
      <circle cx="18" cy="18" r="3.5" className="joker-bell" />
      <circle cx="47" cy="17" r="3.5" className="joker-bell" />
      <circle cx="32" cy="45" r="14" className="joker-face" />
      <path d="M22 42 Q27 37 30 42" className="joker-brow" />
      <path d="M34 42 Q38 37 43 42" className="joker-brow" />
      <path d="M24 51 Q32 59 40 51" className="joker-smile" />
      <path d="M27 26 L32 21 L37 26 L32 31 Z" className="joker-diamond" />
      <path d="M17 62 Q32 54 47 62 L49 76 H15 Z" className="joker-collar" />
      <text x="32" y="73" textAnchor="middle" className="joker-label">
        {big ? "JOKER" : "JOKER"}
      </text>
    </svg>
  );
}

function PipArt({ count, symbol }: { count: number; symbol: string }) {
  return (
    <span className="pip-art" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <i key={index}>{symbol}</i>
      ))}
    </span>
  );
}

export function PlayingCard({
  card,
  selected = false,
  suggested = false,
  disabled = false,
  trump = false,
  compact = false,
  onClick,
}: PlayingCardProps) {
  const joker = card.rank === "BJ" || card.rank === "SJ";
  const red = joker ? card.rank === "BJ" : card.suit === "H" || card.suit === "D";
  const symbol = joker ? "王" : SUIT_SYMBOLS[card.suit!];
  const rank = joker ? (card.rank === "BJ" ? "大" : "小") : card.rank;
  const accessibleName = joker
    ? card.rank === "BJ" ? "大王" : "小王"
    : `${symbol}${rank}`;
  const isRoyal = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  const customArt = CENTER_ART[card.rank];
  const pipCount = !joker && card.rank !== "A" && !isRoyal
    ? Number(card.rank)
    : 0;

  return (
    <button
      type="button"
      className={[
        "playing-card",
        red ? "is-red" : "is-black",
        selected ? "is-selected" : "",
        suggested ? "is-suggested" : "",
        disabled ? "is-disabled" : "",
        trump ? "is-trump" : "",
        compact ? "is-compact" : "",
        card.rank === "BJ" ? "is-big-joker" : "",
        card.rank === "SJ" ? "is-small-joker" : "",
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={accessibleName}
      aria-pressed={selected}
    >
      {trump && <span className="trump-mark">主</span>}
      <span className="card-corner card-corner-top">
        {joker
          ? <b className="joker-corner-word">JOKER</b>
          : <><b>{rank}</b><span>{symbol}</span></>}
      </span>
      <span className="card-center">
        {customArt
          ? <img className="uploaded-card-art" src={customArt} alt="" draggable={false} />
          : joker
          ? <JokerArt big={card.rank === "BJ"} />
          : isRoyal
            ? <RoyalArt rank={card.rank as "J" | "Q" | "K"} />
            : card.rank === "A"
              ? (
                <span className="ace-art">
                  <span>{symbol}</span>
                  <i>ACE</i>
                </span>
              )
              : <PipArt count={pipCount} symbol={symbol} />}
      </span>
      <span className="card-corner card-corner-bottom">
        {joker
          ? <b className="joker-corner-word">JOKER</b>
          : <><b>{rank}</b><span>{symbol}</span></>}
      </span>
    </button>
  );
}

export function CardBack({ count, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <div className={`card-back ${compact ? "is-compact" : ""}`}>
      <span className="card-back-pattern" />
      {count !== undefined && <b>{count}</b>}
    </div>
  );
}
