import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js'
import { TournamentRegulation } from '../models/Tournament'
import { TournamentMatchModel } from '../models/TournamentMatch'
import { TournamentTeamModel } from '../models/TournamentTeam'
import { TournamentTeamMember, TournamentTeamMemberModel, positionLabel } from '../models/TournamentTeamMember'
import { TournamentTeamBattle, TournamentTeamBattleModel } from '../models/TournamentTeamBattle'
import { BracketService } from './BracketService'
import { generateMatchCode } from '../utils/matchCode'

function sortByPosition(members: TournamentTeamMember[]): TournamentTeamMember[] {
  return [...members].sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.id - b.id)
}

// バトル表示のポジションラベル
// - tiebreaker: 「最終戦」
// - sequential / 両者同ポジション: 単一ラベル
// - survival で両者ポジションが異なる: 併記
function battlePosLabel(
  battle: TournamentTeamBattle,
  m1: TournamentTeamMember | null,
  m2: TournamentTeamMember | null,
  format: TournamentRegulation['teamBattleFormat']
): string {
  if (Number(battle.is_tiebreaker) === 1) return '最終戦'
  const p1 = m1?.position ?? null
  const p2 = m2?.position ?? null
  if (p1 != null && p2 != null && p1 !== p2 && format === 'survival') {
    return `${positionLabel(p1)} vs ${positionLabel(p2)}`
  }
  const single = p1 ?? p2
  if (single != null) return positionLabel(single)
  return `第${battle.battle_order}戦`
}

// proxy participant の discord_id からチームIDを取得
export function teamIdFromProxy(discordId: string): number | null {
  const m = discordId.match(/^__team_(\d+)__$/)
  return m ? parseInt(m[1]) : null
}

export function isTeamProxy(discordId: string): boolean {
  return /^__team_\d+__$/.test(discordId)
}

export function proxyDiscordId(teamId: number): string {
  return `__team_${teamId}__`
}

// メンバーのロスター行を生成
function rosterLine(m: TournamentTeamMember, posLabel: string): string {
  const rank = m.rank ? ` [${m.rank}]` : ''
  const char = m.character ? ` (${m.character})` : ''
  return `${posLabel} <@${m.discord_id}>${rank}${char}`
}

export class TeamBattleService {
  // チームマッチの初期メッセージ（「対戦開始」ボタン付き）
  static async formatTeamMatchContent(
    matchId: number,
    regulation: TournamentRegulation
  ): Promise<{ content: string; components: ActionRowBuilder<ButtonBuilder>[] }> {
    const match = await TournamentMatchModel.getWithParticipants(matchId)
    if (!match) throw new Error(`Match ${matchId} not found`)

    const t1Id = match.p1_discord_id ? teamIdFromProxy(match.p1_discord_id) : null
    const t2Id = match.p2_discord_id ? teamIdFromProxy(match.p2_discord_id) : null

    const [team1, team2] = await Promise.all([
      t1Id ? TournamentTeamModel.getById(t1Id) : null,
      t2Id ? TournamentTeamModel.getById(t2Id) : null,
    ])
    const [t1Members, t2Members] = await Promise.all([
      t1Id ? TournamentTeamMemberModel.getByTeam(t1Id) : [],
      t2Id ? TournamentTeamMemberModel.getByTeam(t2Id) : [],
    ])

    const winsLabel = `${regulation.winsRequired}先 / ${regulation.roundsRequired ?? 2}R`
    const battleFmt = regulation.teamBattleFormat === 'survival' ? '勝ち抜き戦' : 'ポジション対応'
    const lines = [
      `⚔️ **団体戦** (${battleFmt}) — 個人戦 ${winsLabel}`,
      `**${team1?.name ?? '?'}** vs **${team2?.name ?? '?'}**`,
      '',
      `【${team1?.name ?? '?'}】`,
      ...sortByPosition(t1Members).map(m => rosterLine(m, positionLabel(m.position))),
      '',
      `【${team2?.name ?? '?'}】`,
      ...sortByPosition(t2Members).map(m => rosterLine(m, positionLabel(m.position))),
    ]

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tnm-battle-start:${matchId}`)
        .setLabel('対戦開始 ▶️')
        .setStyle(ButtonStyle.Primary)
    )

    return { content: lines.join('\n'), components: [row] }
  }

  // 個人試合メッセージのフォーマット
  static async formatBattleContent(
    battleId: number,
    regulation: TournamentRegulation
  ): Promise<{ content: string; components: ActionRowBuilder<ButtonBuilder>[] }> {
    const battle = await TournamentTeamBattleModel.getById(battleId)
    if (!battle) throw new Error(`Battle ${battleId} not found`)

    const [m1, m2] = await Promise.all([
      battle.team1_member_id ? TournamentTeamMemberModel.getById(battle.team1_member_id) : null,
      battle.team2_member_id ? TournamentTeamMemberModel.getById(battle.team2_member_id) : null,
    ])

    const t1m = await (m1 ? TournamentTeamModel.getById(m1.team_id) : null)
    const t2m = await (m2 ? TournamentTeamModel.getById(m2.team_id) : null)

    const posLabel = battlePosLabel(battle, m1, m2, regulation.teamBattleFormat)
    const winsLabel = `${regulation.winsRequired}先`

    const p1 = m1 ? `<@${m1.discord_id}>${m1.rank ? ` [${m1.rank}]` : ''}${m1.character ? ` (${m1.character})` : ''}` : '?'
    const p2 = m2 ? `<@${m2.discord_id}>${m2.rank ? ` [${m2.rank}]` : ''}${m2.character ? ` (${m2.character})` : ''}` : '?'

    const handicapLine = battle.handicap_rounds > 0 && battle.handicap_member_id
      ? `\n⚖️ ハンデ: ${battle.handicap_rounds}ラウンド落とし（${battle.handicap_member_id === m1?.id ? m1?.discord_name : m2?.discord_name}に適用）`
      : ''

    const lines = [
      `\`#${battle.match_code}\` **${posLabel}** (${regulation.teamBattleFormat === 'survival' ? '勝ち抜き' : 'ポジション対応'}) 【${winsLabel}】`,
      `${t1m?.name ?? '?'}: ${p1}  vs  ${t2m?.name ?? '?'}: ${p2}${handicapLine}`,
    ]

    const row = new ActionRowBuilder<ButtonBuilder>()
    if (m1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-battle-win:${battleId}:${m1.id}`)
          .setLabel(`${m1.discord_name} の勝利 ✅`)
          .setStyle(ButtonStyle.Success)
      )
    }
    if (m2) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-battle-win:${battleId}:${m2.id}`)
          .setLabel(`${m2.discord_name} の勝利 ✅`)
          .setStyle(ButtonStyle.Success)
      )
    }

    return { content: lines.join('\n'), components: row.components.length > 0 ? [row] : [] }
  }

  // sequential: 全試合を一括生成（短いチームはリサイクル）
  static async generateSequentialBattles(
    matchId: number,
    team1Id: number,
    team2Id: number,
    regulation: TournamentRegulation
  ): Promise<number[]> {
    const [t1, t2] = await Promise.all([
      TournamentTeamMemberModel.getByTeam(team1Id),
      TournamentTeamMemberModel.getByTeam(team2Id),
    ])
    const s1 = sortByPosition(t1)
    const s2 = sortByPosition(t2)
    const total = Math.max(s1.length, s2.length)
    const battleIds: number[] = []

    for (let i = 0; i < total; i++) {
      const m1 = s1[i % s1.length]
      const m2 = s2[i % s2.length]
      const handicap = BracketService.calcHandicap(
        { rank: m1.rank } as any,
        { rank: m2.rank } as any,
        regulation.handicapRules
      )
      const battle = await TournamentTeamBattleModel.create({
        match_id: matchId,
        battle_order: i + 1,
        match_code: generateMatchCode(),
        team1_member_id: m1.id,
        team2_member_id: m2.id,
        handicap_member_id: handicap.handicapParticipantId
          ? (handicap.handicapParticipantId === (m1 as any).id ? m1.id : m2.id)
          : null,
        handicap_rounds: handicap.rounds,
      })
      battleIds.push(battle.id)
    }

    return battleIds
  }

  // survival: 最初の1試合だけ生成
  static async generateFirstSurvivalBattle(
    matchId: number,
    team1Id: number,
    team2Id: number,
    regulation: TournamentRegulation
  ): Promise<number> {
    const [t1, t2] = await Promise.all([
      TournamentTeamMemberModel.getByTeam(team1Id),
      TournamentTeamMemberModel.getByTeam(team2Id),
    ])
    const m1 = sortByPosition(t1)[0]
    const m2 = sortByPosition(t2)[0]
    if (!m1 || !m2) throw new Error('Both teams must have at least 1 member')

    const handicap = BracketService.calcHandicap(
      { rank: m1.rank } as any,
      { rank: m2.rank } as any,
      regulation.handicapRules
    )
    const battle = await TournamentTeamBattleModel.create({
      match_id: matchId,
      battle_order: 1,
      match_code: generateMatchCode(),
      team1_member_id: m1.id,
      team2_member_id: m2.id,
      handicap_member_id: handicap.handicapParticipantId
        ? (handicap.handicapParticipantId === (m1 as any).id ? m1.id : m2.id)
        : null,
      handicap_rounds: handicap.rounds,
    })
    return battle.id
  }

  // survival: 前の試合を受けて次の試合を生成（null = 全滅でマッチ終了）
  static async generateNextSurvivalBattle(
    matchId: number,
    team1Id: number,
    team2Id: number,
    lastBattle: TournamentTeamBattle,
    regulation: TournamentRegulation
  ): Promise<number | null> {
    const [t1all, t2all, prevBattles] = await Promise.all([
      TournamentTeamMemberModel.getByTeam(team1Id),
      TournamentTeamMemberModel.getByTeam(team2Id),
      TournamentTeamBattleModel.getByMatch(matchId),
    ])

    const defeated = new Set(
      prevBattles
        .filter(b => b.status === 'completed' && b.winner_member_id)
        .map(b =>
          b.winner_member_id === b.team1_member_id ? b.team2_member_id : b.team1_member_id
        )
        .filter(Boolean) as number[]
    )

    const s1 = sortByPosition(t1all)
    const s2 = sortByPosition(t2all)

    const winnerId = lastBattle.winner_member_id!
    const loserIsT1 = t1all.some(m => m.id === (winnerId === lastBattle.team1_member_id ? lastBattle.team2_member_id : lastBattle.team1_member_id))

    let nextM1Id: number, nextM2Id: number

    if (loserIsT1) {
      const next = s1.find(m => !defeated.has(m.id))
      if (!next) return null  // team1 全滅
      nextM1Id = next.id
      nextM2Id = winnerId
    } else {
      const next = s2.find(m => !defeated.has(m.id))
      if (!next) return null  // team2 全滅
      nextM1Id = winnerId
      nextM2Id = next.id
    }

    const m1 = await TournamentTeamMemberModel.getById(nextM1Id)
    const m2 = await TournamentTeamMemberModel.getById(nextM2Id)
    const handicap = BracketService.calcHandicap(
      { rank: m1?.rank } as any,
      { rank: m2?.rank } as any,
      regulation.handicapRules
    )

    const battle = await TournamentTeamBattleModel.create({
      match_id: matchId,
      battle_order: prevBattles.length + 1,
      match_code: generateMatchCode(),
      team1_member_id: nextM1Id,
      team2_member_id: nextM2Id,
      handicap_member_id: handicap.handicapParticipantId
        ? (handicap.handicapParticipantId === (m1 as any).id ? m1!.id : m2!.id)
        : null,
      handicap_rounds: handicap.rounds,
    })
    return battle.id
  }

  // sequential: チームマッチの勝者を決定（最多勝数、同点はゲーム取得数）
  // 戻り値: winnerTeamId / null（未決 or 引き分け状態）
  // 完全な同点（勝敗・ゲーム取得数ともに同じ）の場合は null を返す。
  // tiebreaker (最終戦) battle がすでに完了していれば、その勝者を返す。
  static async resolveSequentialMatch(
    matchId: number,
    team1Id: number,
    team2Id: number
  ): Promise<number | null> {
    const battles = await TournamentTeamBattleModel.getByMatch(matchId)
    const completed = battles.filter(b => b.status === 'completed')
    if (completed.length < battles.length) return null  // まだ全部終わっていない

    // 最終戦（tiebreaker）が完了していれば、その勝者をマッチ勝者とする
    const tiebreakerCompleted = completed
      .filter(b => Number(b.is_tiebreaker) === 1)
      .sort((a, b) => b.battle_order - a.battle_order)[0]
    if (tiebreakerCompleted && tiebreakerCompleted.winner_team_id) {
      return Number(tiebreakerCompleted.winner_team_id)
    }

    const initial = completed.filter(b => Number(b.is_tiebreaker) !== 1)

    let t1Wins = 0, t2Wins = 0
    for (const b of initial) {
      const wId = b.winner_team_id != null ? Number(b.winner_team_id) : null
      if (wId === team1Id) t1Wins++
      else if (wId === team2Id) t2Wins++
    }
    if (t1Wins > t2Wins) return team1Id
    if (t2Wins > t1Wins) return team2Id

    // 同点: ゲーム取得数で比較
    let t1Games = 0, t2Games = 0
    for (const b of initial) {
      const wId = b.winner_team_id != null ? Number(b.winner_team_id) : null
      const isT1Winner = wId === team1Id
      if (isT1Winner) {
        t1Games += Number(b.team1_games_won)
        t2Games += Number(b.team2_games_won)
      } else {
        t1Games += Number(b.team2_games_won)
        t2Games += Number(b.team1_games_won)
      }
    }
    if (t1Games > t2Games) return team1Id
    if (t2Games > t1Games) return team2Id

    // 勝敗・ゲーム取得数ともに同点 → 引き分け状態（ユーザー判断待ち）
    return null
  }

  // sequential: 初期バトル（tiebreaker を除く）がすべて完了しているか
  static async isInitialBattlesComplete(matchId: number): Promise<boolean> {
    const battles = await TournamentTeamBattleModel.getByMatch(matchId)
    const initial = battles.filter(b => Number(b.is_tiebreaker) !== 1)
    return initial.length > 0 && initial.every(b => b.status === 'completed')
  }

  // sequential: 引き分け状態かどうか（初期バトル全完了 & 勝者未決）
  static async isDrawState(
    matchId: number,
    team1Id: number,
    team2Id: number
  ): Promise<boolean> {
    if (!(await this.isInitialBattlesComplete(matchId))) return false
    const winner = await this.resolveSequentialMatch(matchId, team1Id, team2Id)
    return winner === null
  }

  // 最終戦（tiebreaker）バトルを生成
  static async generateTiebreakerBattle(
    matchId: number,
    team1MemberId: number,
    team2MemberId: number,
    regulation: TournamentRegulation
  ): Promise<number> {
    const [m1, m2, existing] = await Promise.all([
      TournamentTeamMemberModel.getById(team1MemberId),
      TournamentTeamMemberModel.getById(team2MemberId),
      TournamentTeamBattleModel.getByMatch(matchId),
    ])
    if (!m1 || !m2) throw new Error('Tiebreaker members not found')

    // calcHandicap は引数オブジェクトの .id を返すので member.id を渡す
    const handicap = BracketService.calcHandicap(
      { id: m1.id, rank: m1.rank } as any,
      { id: m2.id, rank: m2.rank } as any,
      regulation.handicapRules
    )

    const battle = await TournamentTeamBattleModel.create({
      match_id: matchId,
      battle_order: existing.length + 1,
      match_code: generateMatchCode(),
      team1_member_id: m1.id,
      team2_member_id: m2.id,
      handicap_member_id: handicap.handicapParticipantId === m1.id
        ? m1.id
        : handicap.handicapParticipantId === m2.id
          ? m2.id
          : null,
      handicap_rounds: handicap.rounds,
      is_tiebreaker: true,
    })
    return battle.id
  }

  // 引き分け確定時のゲーム取得合計を返す（is_draw マッチのスコア保存用）
  // 規約: team1_member_id は常にマッチの team1 側、team2_member_id は team2 側に対応
  // （generateSequentialBattles / generateFirstSurvivalBattle / generateNextSurvivalBattle / generateTiebreakerBattle すべてこの規約で作成）
  static async computeTotalGames(
    matchId: number
  ): Promise<{ t1Games: number; t2Games: number }> {
    const battles = await TournamentTeamBattleModel.getByMatch(matchId)
    let t1Games = 0, t2Games = 0
    for (const b of battles) {
      if (b.status !== 'completed') continue
      t1Games += Number(b.team1_games_won)
      t2Games += Number(b.team2_games_won)
    }
    return { t1Games, t2Games }
  }

  // 既存の最終戦（tiebreaker）バトルがあるかチェック
  static async hasExistingTiebreaker(matchId: number): Promise<boolean> {
    const battles = await TournamentTeamBattleModel.getByMatch(matchId)
    return battles.some(b => Number(b.is_tiebreaker) === 1)
  }

  // survival: 全滅したチームの対面が勝者
  static async resolveSurvivalMatch(
    matchId: number,
    team1Id: number,
    team2Id: number
  ): Promise<number | null> {
    const battles = await TournamentTeamBattleModel.getByMatch(matchId)
    const [t1all, t2all] = await Promise.all([
      TournamentTeamMemberModel.getByTeam(team1Id),
      TournamentTeamMemberModel.getByTeam(team2Id),
    ])

    const defeated = new Set(
      battles
        .filter(b => b.status === 'completed' && b.winner_member_id)
        .map(b =>
          b.winner_member_id === b.team1_member_id ? b.team2_member_id : b.team1_member_id
        )
        .filter(Boolean) as number[]
    )

    const t1Alive = t1all.some(m => !defeated.has(m.id))
    const t2Alive = t2all.some(m => !defeated.has(m.id))

    if (!t1Alive) return team2Id
    if (!t2Alive) return team1Id
    return null  // まだ続く
  }

  // チームマッチの結果サマリー文字列（更新後のメッセージ末尾に付ける）
  static async formatMatchSummary(
    matchId: number,
    team1Id: number,
    team2Id: number,
    regulation: TournamentRegulation
  ): Promise<string> {
    const battles = await TournamentTeamBattleModel.getByMatch(matchId)
    const completed = battles.filter(b => b.status === 'completed')
    const initial = completed.filter(b => Number(b.is_tiebreaker) !== 1)

    let t1Wins = 0, t2Wins = 0
    for (const b of initial) {
      if (b.winner_team_id === team1Id) t1Wins++
      else if (b.winner_team_id === team2Id) t2Wins++
    }

    const memberIds = Array.from(new Set(
      completed.flatMap(b => [b.team1_member_id, b.team2_member_id])
        .filter((id): id is number => id != null)
    ))
    const memberList = await Promise.all(memberIds.map(id => TournamentTeamMemberModel.getById(id)))
    const memberMap = new Map<number, TournamentTeamMember>()
    for (const m of memberList) if (m) memberMap.set(m.id, m)

    const [t1, t2] = await Promise.all([
      TournamentTeamModel.getById(team1Id),
      TournamentTeamModel.getById(team2Id),
    ])

    const resultLines = completed.map(b => {
      const m1 = b.team1_member_id != null ? memberMap.get(b.team1_member_id) ?? null : null
      const m2 = b.team2_member_id != null ? memberMap.get(b.team2_member_id) ?? null : null
      const pos = battlePosLabel(b, m1, m2, regulation.teamBattleFormat)
      const score = `${b.team1_games_won}-${b.team2_games_won}`
      return `${pos}: ${score}`
    })

    return [
      '',
      `**${t1?.name ?? '?'}** ${t1Wins} - ${t2Wins} **${t2?.name ?? '?'}**`,
      ...resultLines,
    ].join('\n')
  }

  // チームマッチの試合結果embed
  static async formatTeamMatchEmbed(
    matchId: number,
    regulation: TournamentRegulation
  ): Promise<EmbedBuilder> {
    const battles = await TournamentTeamBattleModel.getByMatch(matchId)
    const match = await TournamentMatchModel.getWithParticipants(matchId)

    const t1Id = match?.p1_discord_id ? teamIdFromProxy(match.p1_discord_id) : null
    const t2Id = match?.p2_discord_id ? teamIdFromProxy(match.p2_discord_id) : null

    const [t1, t2] = await Promise.all([
      t1Id ? TournamentTeamModel.getById(t1Id) : null,
      t2Id ? TournamentTeamModel.getById(t2Id) : null,
    ])

    const memberIds = Array.from(new Set(
      battles.flatMap(b => [b.team1_member_id, b.team2_member_id])
        .filter((id): id is number => id != null)
    ))
    const memberList = await Promise.all(memberIds.map(id => TournamentTeamMemberModel.getById(id)))
    const memberMap = new Map<number, TournamentTeamMember>()
    for (const m of memberList) if (m) memberMap.set(m.id, m)

    let t1Wins = 0, t2Wins = 0
    const lines: string[] = []
    for (const b of battles) {
      const isTb = Number(b.is_tiebreaker) === 1
      const m1 = b.team1_member_id != null ? memberMap.get(b.team1_member_id) ?? null : null
      const m2 = b.team2_member_id != null ? memberMap.get(b.team2_member_id) ?? null : null
      const pos = battlePosLabel(b, m1, m2, regulation.teamBattleFormat)
      if (b.status === 'completed') {
        if (b.winner_team_id === t1Id) {
          if (!isTb) t1Wins++
          lines.push(`✅ ${pos}: **${t1?.name}**勝利 (${b.team1_games_won}-${b.team2_games_won})`)
        } else {
          if (!isTb) t2Wins++
          lines.push(`✅ ${pos}: **${t2?.name}**勝利 (${b.team1_games_won}-${b.team2_games_won})`)
        }
      } else {
        lines.push(`⏳ ${pos}: 試合中`)
      }
    }

    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⚔️ ${t1?.name ?? '?'} vs ${t2?.name ?? '?'}`)
      .setDescription(`**${t1?.name ?? '?'}** ${t1Wins} — ${t2Wins} **${t2?.name ?? '?'}**`)
      .addFields({ name: '試合結果', value: lines.join('\n') || 'まだ試合なし' })
  }
}
