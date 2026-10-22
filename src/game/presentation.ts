import type {
  AIDifficulty,
  PlayerId,
  Rank,
  RoundResult,
  RoundState,
  Team,
} from "./types";
import { TEAM_OF } from "./cards";

export const SEAT_POSITION: Record<PlayerId, string> = {
  blue2: "north",
  red1: "west",
  red2: "east",
  blue1: "south",
};

export const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  easy: "简单",
  normal: "一般",
  hard: "高级",
};

export const PHASE_LABEL: Record<RoundState["phase"], string> = {
  coin: "抛硬币",
  dealing: "发牌与叫主",
  revolt: "起义协商",
  chooseBottom: "选择打底",
  burying: "打底",
  reveal: "亮主",
  playing: "出牌",
  trickReview: "本墩结算",
  finalReveal: "末墩亮牌",
  roundEnd: "本局结算",
  redeal: "重新发牌",
};

export function rankText(rank: Rank | null): string {
  return rank ?? "—";
}

export function teamText(team: Team | null): string {
  if (team === "blue") return "蓝方";
  if (team === "red") return "红方";
  return "待定";
}

export function settlementReason(result: RoundResult): string {
  if (result.reason) return result.reason;
  if (result.opponentPoints === 0) {
    return TEAM_OF[result.lastWinner] === result.mainTeam
      ? "旁家本局 0 分，且末墩亮牌由主家赢下，因此主家升两级。"
      : "旁家本局 0 分，但末墩亮牌由旁家赢下，因此双方不升级，下一局进入抢报。";
  }
  if (result.opponentPoints === 40) {
    return "旁家正好得到 40 分，触发 40 分特殊规则，因此双方不升级，下一局进入抢报。";
  }
  if (result.opponentPoints < 45) {
    return `旁家得到 ${result.opponentPoints} 分，未达到 45 分，因此由主家升一级；末墩亮牌归属不改变该积分结果。`;
  }
  if (result.opponentPoints < 65) {
    return `旁家达到 45 分门槛，按积分优先结算，因此${teamText(result.opponentTeam)}升一级并成为主家；末墩亮牌归属不改变本局升级结果。`;
  }
  return `旁家达到 65 分门槛，按积分优先结算，因此${teamText(result.opponentTeam)}升两级并成为主家；末墩亮牌归属不改变本局升级结果。`;
}
