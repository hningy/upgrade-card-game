import { TEAM_OF } from "./cards";
import type { PlayerId, Team } from "./types";

export interface SettlementDecision {
  upgradeTeam: Team | null;
  upgradeAmount: number;
  nextMainTeam: Team;
  nextShootout: boolean;
  summary: string;
  reason: string;
}

function teamName(team: Team): string {
  return team === "blue" ? "蓝方" : "红方";
}

export function decideSettlement(
  mainTeam: Team,
  opponentPoints: number,
  lastWinner: PlayerId,
): SettlementDecision {
  const opponentTeam: Team = mainTeam === "blue" ? "red" : "blue";
  if (opponentPoints === 0) {
    if (TEAM_OF[lastWinner] === mainTeam) {
      return {
        upgradeTeam: mainTeam,
        upgradeAmount: 2,
        nextMainTeam: mainTeam,
        nextShootout: false,
        summary: `旁家 0 分且主家赢最后一墩，${teamName(mainTeam)}升两级`,
        reason: "旁家本局 0 分，并且末墩亮牌由主家赢下，因此主家升两级。",
      };
    }
    return {
      upgradeTeam: null,
      upgradeAmount: 0,
      nextMainTeam: mainTeam,
      nextShootout: true,
      summary: "旁家 0 分且赢最后一墩，双方不升级，下一局抢报",
      reason: "旁家本局 0 分，但末墩亮牌由旁家赢下，因此双方不升级，下一局进入抢报。",
    };
  }
  if (opponentPoints === 40) {
    return {
      upgradeTeam: null,
      upgradeAmount: 0,
      nextMainTeam: mainTeam,
      nextShootout: true,
      summary: "旁家 40 分，双方不升级，下一局抢报",
      reason: "旁家正好得到 40 分，触发 40 分特殊规则，因此双方不升级，下一局进入抢报。",
    };
  }
  if (opponentPoints < 45) {
    return {
      upgradeTeam: mainTeam,
      upgradeAmount: 1,
      nextMainTeam: mainTeam,
      nextShootout: false,
      summary: `旁家 ${opponentPoints} 分，${teamName(mainTeam)}升一级`,
      reason: `旁家得到 ${opponentPoints} 分，没有达到 45 分，因此由主家升一级；末墩亮牌归属不改变该积分结果。`,
    };
  }
  if (opponentPoints < 65) {
    return {
      upgradeTeam: opponentTeam,
      upgradeAmount: 1,
      nextMainTeam: opponentTeam,
      nextShootout: false,
      summary: `旁家 ${opponentPoints} 分，${teamName(opponentTeam)}升一级并成为主家`,
      reason: `旁家达到 45 分，按积分优先结算，因此${teamName(opponentTeam)}升一级并成为主家；末墩亮牌归属不改变本局升级结果。`,
    };
  }
  return {
    upgradeTeam: opponentTeam,
    upgradeAmount: 2,
    nextMainTeam: opponentTeam,
    nextShootout: false,
    summary: `旁家 ${opponentPoints} 分，${teamName(opponentTeam)}升两级并成为主家`,
    reason: `旁家达到 65 分，按积分优先结算，因此${teamName(opponentTeam)}升两级并成为主家；末墩亮牌归属不改变本局升级结果。`,
  };
}
