import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  GuildMember,
  Guild,
} from 'discord.js'
import { TournamentModel, TournamentRegulation, HandicapRule } from '../models/Tournament'
import { TournamentParticipantModel } from '../models/TournamentParticipant'
import { TournamentMatchModel } from '../models/TournamentMatch'
import { BracketService } from '../services/BracketService'
import { LeagueService } from '../services/LeagueService'
import { SwissService } from '../services/SwissService'
import { TeamBattleService, isTeamProxy, teamIdFromProxy, proxyDiscordId } from '../services/TeamBattleService'
import { TournamentTeamModel } from '../models/TournamentTeam'
import { TournamentTeamMemberModel, POSITION_NAMES } from '../models/TournamentTeamMember'
import { TournamentTeamBattleModel } from '../models/TournamentTeamBattle'
import { TournamentParticipant } from '../models/TournamentParticipant'
import { RANKS } from '../constants/ranks'
import { CHARACTERS } from '../constants/characters'

export const data = new SlashCommandBuilder()
  .setName('tnm')
  .setDescription('大会（トーナメント）を管理します')
  .addSubcommand(s =>
    s.setName('create')
      .setDescription('大会を作成します')
      .addStringOption(o =>
        o.setName('format')
          .setDescription('大会形式')
          .setRequired(false)
          .addChoices(
            { name: 'シングルエリミネーション（デフォルト）', value: 'single_elim' },
            { name: 'リーグ戦（総当たり）', value: 'league' },
            { name: 'スイスドロー', value: 'swiss' }
          )
      )
      .addIntegerOption(o =>
        o.setName('total_rounds')
          .setDescription('スイスドローの総ラウンド数（スイスドロー形式のみ）')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(10)
      )
      .addBooleanOption(o =>
        o.setName('team')
          .setDescription('団体戦モード')
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName('team_battle')
          .setDescription('対戦方式（団体戦のみ）')
          .setRequired(false)
          .addChoices(
            { name: 'ポジション対応（先鋒vs先鋒…）', value: 'sequential' },
            { name: '勝ち抜き戦', value: 'survival' }
          )
      )
      .addStringOption(o =>
        o.setName('entry')
          .setDescription('エントリー方法（団体戦のみ）')
          .setRequired(false)
          .addChoices(
            { name: 'チームを作ってエントリー（デフォルト）', value: 'create' },
            { name: '既存チームにエントリー', value: 'join' },
            { name: '個人で集めてから振り分け', value: 'assign' }
          )
      )
  )
  .addSubcommand(s => s.setName('start').setDescription('参加受付を終了してブラケットを生成します'))
  .addSubcommand(s => s.setName('bracket').setDescription('現在のブラケットを表示します'))
  .addSubcommand(s => s.setName('status').setDescription('参加者一覧と進行状況を表示します'))
  .addSubcommand(s => s.setName('list').setDescription('このサーバーの大会一覧を表示します'))
  .addSubcommand(s => s.setName('close').setDescription('参加受付を終了します（ブラケット生成はしない）'))
  .addSubcommand(s => s.setName('delete').setDescription('大会を削除します'))
  .addSubcommand(s =>
    s.setName('leave').setDescription('参加を取り消します（受付中のみ）')
  )
  .addSubcommand(s =>
    s.setName('fix')
      .setDescription('誤った試合結果を修正します')
      .addStringOption(o =>
        o.setName('match_code').setDescription('修正するマッチコード（6桁）').setRequired(true)
      )
      .addUserOption(o =>
        o.setName('winner').setDescription('正しい勝者').setRequired(true)
      )
  )
  .addSubcommand(s =>
    s.setName('enter')
      .setDescription('指定ユーザーを代理でエントリーします（管理者用）')
      .addUserOption(o =>
        o.setName('user').setDescription('エントリーさせるユーザー').setRequired(true)
      )
  )
  .addSubcommand(s =>
    s.setName('team-setup')
      .setDescription('団体戦のチームを作成します（joinまたはassign方式）')
      .addStringOption(o => o.setName('team1').setDescription('チーム1名').setRequired(true))
      .addStringOption(o => o.setName('team2').setDescription('チーム2名').setRequired(true))
      .addStringOption(o => o.setName('team3').setDescription('チーム3名').setRequired(false))
      .addStringOption(o => o.setName('team4').setDescription('チーム4名').setRequired(false))
      .addStringOption(o => o.setName('team5').setDescription('チーム5名').setRequired(false))
      .addStringOption(o => o.setName('team6').setDescription('チーム6名').setRequired(false))
      .addStringOption(o => o.setName('team7').setDescription('チーム7名').setRequired(false))
      .addStringOption(o => o.setName('team8').setDescription('チーム8名').setRequired(false))
  )
  .addSubcommand(s =>
    s.setName('team-assign')
      .setDescription('参加者をチームに振り分けます（assign方式のみ）')
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand()

  if (sub === 'create') return handleCreate(interaction)
  if (sub === 'start') return handleStart(interaction)
  if (sub === 'bracket') return handleBracket(interaction)
  if (sub === 'status') return handleStatus(interaction)
  if (sub === 'list') return handleList(interaction)
  if (sub === 'close') return handleClose(interaction)
  if (sub === 'delete') return handleDelete(interaction)
  if (sub === 'leave') return handleLeave(interaction)
  if (sub === 'fix') return handleFix(interaction)
  if (sub === 'enter') return handleEnter(interaction)
  if (sub === 'team-setup') return handleTeamSetup(interaction)
  if (sub === 'team-assign') return handleTeamAssign(interaction)
}

// ─── Subcommand handlers ──────────────────────────────────────────────────────

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const format = interaction.options.getString('format') ?? 'single_elim'
  const totalRoundsArg = interaction.options.getInteger('total_rounds') ?? ''
  const teamMode = interaction.options.getBoolean('team') ?? false
  const teamBattle = interaction.options.getString('team_battle') ?? 'sequential'
  const entryMode = interaction.options.getString('entry') ?? 'create'
  const teamSuffix = teamMode ? `_team_${teamBattle}_${entryMode}` : ''

  const formatBase = format === 'league' ? 'リーグ戦' : format === 'swiss' ? 'スイスドロー' : 'シングルエリミネーション'
  const formatLabel = teamMode ? `${formatBase}（団体戦）` : formatBase

  const modal = new ModalBuilder()
    .setCustomId(`tnm-create:modal:${format}:${totalRoundsArg}${teamSuffix}`)
    .setTitle(`大会を作成する（${formatLabel}）`)

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('大会名')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)

  const maxInput = new TextInputBuilder()
    .setCustomId('max_participants')
    .setLabel('最大参加人数（空白=制限なし）')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('例: 16')

  const winsInput = new TextInputBuilder()
    .setCustomId('wins_required')
    .setLabel('先取数（2先なら 2、3先なら 3）')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('2')
    .setValue('2')

  const roundsInput = new TextInputBuilder()
    .setCustomId('rounds_required')
    .setLabel('ラウンド数（1ゲームを取るのに必要なラウンド）')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('2')
    .setValue('2')

  const handicapInput = new TextInputBuilder()
    .setCustomId('handicap_rules')
    .setLabel('ハンデルール（空白=なし）')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('例: 3:1,7:2 （ランク差:ラウンド数、カンマ区切り）')

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(maxInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(winsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(roundsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(handicapInput),
  )

  await interaction.showModal(modal)
}

async function handleStart(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()

  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.editReply('アクティブな大会が見つかりません。`/tnm create` で作成してください。')
    return
  }
  if (tournament.status !== 'registration' && tournament.status !== 'closed') {
    await interaction.editReply(`大会 **${tournament.name}** はすでに開始済みです。`)
    return
  }

  const participants = await TournamentParticipantModel.getByTournament(tournament.id)
  if (participants.length < 2) {
    await interaction.editReply('参加者が2人以上いないと大会を開始できません。')
    return
  }

  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return

  // ─── 団体戦モード ───────────────────────────────────────────────────────────
  if (regulation.teamMode) {
    const teams = await TournamentTeamModel.getByTournament(tournament.id)
    if (teams.length < 2) {
      await interaction.editReply('❌ チームが2つ以上必要です。エントリーを受け付けてください。')
      return
    }

    // チームごとにプロキシ参加者を作成（まだなければ）
    const proxyParticipants: TournamentParticipant[] = []
    for (const team of teams) {
      const did = proxyDiscordId(team.id)
      let proxy = await TournamentParticipantModel.getByDiscordId(tournament.id, did)
      if (!proxy) {
        proxy = await TournamentParticipantModel.create({
          tournament_id: tournament.id,
          discord_id: did,
          discord_name: team.name,
          rank: null,
          character: null,
        })
      }
      proxyParticipants.push(proxy)
    }

    let matchIds: number[] = []
    if (tournament.format === 'swiss') {
      const totalRounds = regulation.totalRounds
      if (!totalRounds) { await interaction.editReply('❌ スイスドローの総ラウンド数が設定されていません。'); return }
      matchIds = await SwissService.generateRound(tournament.id, 1, proxyParticipants, regulation, [])
    } else if (tournament.format === 'league') {
      matchIds = await LeagueService.generateLeague(tournament.id, proxyParticipants, regulation)
    } else {
      matchIds = await BracketService.generateBracket(tournament.id, proxyParticipants, regulation, [])
    }
    await TournamentModel.setStatus(tournament.id, 'in_progress')

    for (const matchId of matchIds) {
      try {
        const { content, components } = await TeamBattleService.formatTeamMatchContent(matchId, regulation)
        const msg = await channel.send({ content, components })
        await TournamentMatchModel.setMessageId(matchId, msg.id)
      } catch (err) {
        console.error(`[tnm] Failed to post team match ${matchId}:`, err)
      }
    }

    if (tournament.format === 'swiss') {
      await interaction.editReply({ embeds: [await SwissService.formatSwissEmbed(tournament.id)] })
    } else if (tournament.format === 'league') {
      await interaction.editReply({ embeds: [await LeagueService.formatLeagueEmbed(tournament.id)] })
    } else {
      await interaction.editReply({ embeds: [await BracketService.formatBracketEmbed(tournament.id)] })
    }
    return
  }

  if (tournament.format === 'swiss') {
    const totalRounds = regulation.totalRounds
    if (!totalRounds) {
      await interaction.editReply('❌ スイスドローの総ラウンド数が設定されていません。大会を作り直してください。')
      return
    }
    const matchIds = await SwissService.generateRound(tournament.id, 1, participants, regulation, [])
    await TournamentModel.setStatus(tournament.id, 'in_progress')

    const embed = await SwissService.formatSwissEmbed(tournament.id)
    await interaction.editReply({ embeds: [embed] })

    for (const matchId of matchIds) {
      try {
        const { content, components } = await SwissService.formatMatchContent(matchId, regulation, 1, totalRounds)
        const msg = await channel.send({ content, components })
        await TournamentMatchModel.setMessageId(matchId, msg.id)
      } catch (err) {
        console.error(`[tnm] Failed to post swiss match ${matchId}:`, err)
      }
    }
    return
  }

  if (tournament.format === 'league') {
    const matchIds = await LeagueService.generateLeague(tournament.id, participants, regulation)
    await TournamentModel.setStatus(tournament.id, 'in_progress')

    const leagueEmbed = await LeagueService.formatLeagueEmbed(tournament.id)
    await interaction.editReply({ embeds: [leagueEmbed] })

    for (const matchId of matchIds) {
      try {
        const { content, components } = await LeagueService.formatMatchContent(matchId, regulation)
        const msg = await channel.send({ content, components })
        await TournamentMatchModel.setMessageId(matchId, msg.id)
      } catch (err) {
        console.error(`[tnm] Failed to post league match ${matchId}:`, err)
      }
    }
    return
  }

  // single_elim
  const guild = interaction.guild!
  const voiceChannels = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildVoice)
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
    .map(c => c.id)

  const playableMatchIds = await BracketService.generateBracket(
    tournament.id,
    participants,
    regulation,
    voiceChannels
  )

  await TournamentModel.setStatus(tournament.id, 'in_progress')

  const bracketEmbed = await BracketService.formatBracketEmbed(tournament.id)
  await interaction.editReply({ embeds: [bracketEmbed] })

  for (const matchId of playableMatchIds) {
    try {
      const { content, components } = await BracketService.formatMatchContent(matchId, regulation)
      const msg = await channel.send({ content, components })
      await TournamentMatchModel.setMessageId(matchId, msg.id)
    } catch (err) {
      console.error(`[tnm] Failed to post match ${matchId}:`, err)
    }
  }
}

async function handleBracket(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.editReply({
      content: 'アクティブな大会が見つかりません。',
    })
    return
  }

  const embed = tournament.format === 'league'
    ? await LeagueService.formatLeagueEmbed(tournament.id)
    : tournament.format === 'swiss'
    ? await SwissService.formatSwissEmbed(tournament.id)
    : await BracketService.formatBracketEmbed(tournament.id)
  await interaction.editReply({ embeds: [embed] })
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.editReply({
      content: 'アクティブな大会が見つかりません。',
    })
    return
  }

  const participants = await TournamentParticipantModel.getByTournament(tournament.id)
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 ${tournament.name} — 参加者一覧`)
    .setDescription(
      participants.length > 0
        ? participants
            .map((p, i) => `${i + 1}. <@${p.discord_id}> ${p.rank ? `[${p.rank}]` : ''}`)
            .join('\n')
        : 'まだ参加者がいません。'
    )
    .setFooter({ text: `${participants.length} 名参加中 | ステータス: ${statusLabel(tournament.status)}` })
    .setTimestamp()

  await interaction.editReply({ embeds: [embed] })
}

async function handleList(interaction: ChatInputCommandInteraction) {
  const tournaments = await TournamentModel.getByGuild(interaction.guildId!)
  if (tournaments.length === 0) {
    await interaction.reply({
      content: 'このサーバーにはまだ大会がありません。',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const lines = tournaments.slice(0, 10).map(t => {
    const date = new Date(t.created_at).toLocaleDateString('ja-JP')
    return `**${t.name}** — ${statusLabel(t.status)} (${date})`
  })

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🏟 大会一覧')
    .setDescription(lines.join('\n'))
    .setTimestamp()

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
}

async function handleClose(interaction: ChatInputCommandInteraction) {
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.reply({
      content: 'アクティブな大会が見つかりません。',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  if (tournament.status !== 'registration') {
    await interaction.reply({
      content: '参加受付中の大会が見つかりません。',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await TournamentModel.setStatus(tournament.id, 'closed')
  const count = await TournamentParticipantModel.count(tournament.id)
  await interaction.reply(`🔒 **${tournament.name}** の参加受付を終了しました。（${count} 名）\nブラケットを生成するには \`/tnm start\` を使用してください。`)
}

async function handleLeave(interaction: ChatInputCommandInteraction) {
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.reply({ content: 'アクティブな大会が見つかりません。', flags: MessageFlags.Ephemeral })
    return
  }
  if (tournament.status !== 'registration') {
    await interaction.reply({
      content: '参加受付が終了しているため、取り消しできません。',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const participant = await TournamentParticipantModel.getByDiscordId(tournament.id, interaction.user.id)
  if (!participant) {
    await interaction.reply({
      content: 'この大会に参加登録されていません。',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await TournamentParticipantModel.delete(participant.id)
  const count = await TournamentParticipantModel.count(tournament.id)

  if (interaction.guild) {
    await updateAnnouncementEmbed(interaction.guild, tournament, count)
  }

  await interaction.reply({
    content: `✅ **${tournament.name}** の参加を取り消しました。`,
    flags: MessageFlags.Ephemeral,
  })
}

async function handleFix(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const matchCode = interaction.options.getString('match_code', true).trim()
  const newWinnerUser = interaction.options.getUser('winner', true)

  // 完了済みの大会も含めて、マッチコードから対象大会と試合を特定する
  const tournaments = await TournamentModel.getByGuild(interaction.guildId!)
  let tournament: typeof tournaments[number] | null = null
  let match: Awaited<ReturnType<typeof TournamentMatchModel.getById>> = null
  let allMatches: Awaited<ReturnType<typeof TournamentMatchModel.getByTournament>> = []

  for (const t of tournaments) {
    const ms = await TournamentMatchModel.getByTournament(t.id)
    const found = ms.find(m => m.match_code === matchCode)
    if (found) {
      tournament = t
      match = found
      allMatches = ms
      break
    }
  }

  if (!tournament || !match) {
    await interaction.editReply(`マッチコード \`${matchCode}\` が見つかりません。`)
    return
  }
  if (match.status !== 'completed') {
    await interaction.editReply('この試合はまだ完了していません。')
    return
  }

  const p1 = match.participant1_id ? await TournamentParticipantModel.getById(match.participant1_id) : null
  const p2 = match.participant2_id ? await TournamentParticipantModel.getById(match.participant2_id) : null
  const newWinnerParticipant = [p1, p2].find(p => p?.discord_id === newWinnerUser.id)

  if (!newWinnerParticipant) {
    await interaction.editReply('指定したユーザーはこの試合の参加者ではありません。')
    return
  }
  if (Number(match.winner_id) === Number(newWinnerParticipant.id)) {
    await interaction.editReply('そのユーザーはすでに勝者として記録されています。')
    return
  }

  // 次ラウンドが完了していないか確認
  const maxRound = Math.max(...allMatches.map(m => m.round))
  const nextMatch = match.round < maxRound
    ? allMatches.find(m => m.round === match.round + 1 && m.match_number === Math.ceil(match.match_number / 2)) ?? null
    : null

  if (nextMatch && nextMatch.status === 'completed') {
    await interaction.editReply('次のラウンドの試合がすでに終了しているため修正できません。')
    return
  }

  const oldWinnerId = Number(match.winner_id)
  const newWinnerId = newWinnerParticipant.id
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  // DB 更新
  await TournamentMatchModel.changeWinner(match.id, newWinnerId)
  await TournamentParticipantModel.restore(newWinnerId)
  await TournamentParticipantModel.eliminate(oldWinnerId)

  // 元の試合メッセージに修正注記を追加
  if (match.message_id && tournament.channel_id && interaction.guild) {
    try {
      const ch = await interaction.guild.channels.fetch(tournament.channel_id)
      if (ch && ch.isTextBased() && !ch.isDMBased()) {
        const origMsg = await ch.messages.fetch(match.message_id)
        if (origMsg.editable) {
          await origMsg.edit({
            content: `${origMsg.content}\n🔧 修正: 勝者は <@${newWinnerUser.id}> に変更されました`,
            components: [],
          })
        }
      }
    } catch {
      // best effort
    }
  }

  // 次ラウンド試合の更新（決勝戦修正の場合は nextMatch なし）
  if (nextMatch) {
    const slot: 'p1' | 'p2' = match.match_number % 2 === 1 ? 'p1' : 'p2'
    await TournamentMatchModel.setParticipant(nextMatch.id, newWinnerId, slot)

    // ハンデ再計算 + match_code 確定（必要なら）
    const finalized = await BracketService.finalizeMatchIfReady(nextMatch.id, regulation)

    if (interaction.guild && tournament.channel_id) {
      try {
        const ch = await interaction.guild.channels.fetch(tournament.channel_id)
        if (ch && ch.isTextBased() && !ch.isDMBased()) {
          if (nextMatch.message_id) {
            // 既存メッセージを上書き
            const msg = await ch.messages.fetch(nextMatch.message_id)
            if (msg.editable) {
              const { content, components } = await formatMatchByFormat(tournament.format, nextMatch.id, nextMatch.round, regulation)
              await msg.edit({ content, components })
            }
          } else if (finalized) {
            // 修正をきっかけに次の試合が両方の参加者揃った → 新規投稿
            const { content, components } = await formatMatchByFormat(tournament.format, nextMatch.id, nextMatch.round, regulation)
            const newMsg = await ch.send({ content, components })
            await TournamentMatchModel.setMessageId(nextMatch.id, newMsg.id)
          }
        }
      } catch {
        // best effort
      }
    }
  }

  await interaction.editReply(
    `✅ マッチ \`#${matchCode}\` の勝者を修正しました。\n新しい勝者: <@${newWinnerUser.id}>`
  )
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.reply({
      content: 'アクティブな大会が見つかりません。',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await TournamentModel.delete(tournament.id)
  await interaction.reply(`🗑 **${tournament.name}** を削除しました。`)
}

// ─── Modal submit ─────────────────────────────────────────────────────────────

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId.startsWith('tnm-team-create:modal')) {
    const tournamentId = parseInt(interaction.customId.split(':')[2])
    return handleTeamCreateModal(interaction, tournamentId)
  }
  if (!interaction.customId.startsWith('tnm-create:modal')) return false
  const idParts = interaction.customId.split(':')
  const format = idParts[2] ?? 'single_elim'
  // idParts[3] は "totalRounds_team_teamBattle_entryMode" or "totalRounds" or ""
  const rawPart = idParts[3] ?? ''
  const teamIdx = rawPart.indexOf('_team_')
  const totalRounds = teamIdx > 0
    ? (rawPart.slice(0, teamIdx) ? parseInt(rawPart.slice(0, teamIdx)) : undefined)
    : (rawPart ? parseInt(rawPart) : undefined)
  const teamParts = teamIdx >= 0 ? rawPart.slice(teamIdx + 6).split('_') : []
  const teamMode = teamParts.length >= 2
  const teamBattleFormat = (teamParts[0] as 'sequential' | 'survival') || 'sequential'
  const teamEntryMode = (teamParts[1] as 'create' | 'join' | 'assign') || 'create'

  const name = interaction.fields.getTextInputValue('name').trim()
  const maxRaw = interaction.fields.getTextInputValue('max_participants').trim()
  const winsRaw = interaction.fields.getTextInputValue('wins_required').trim()
  const roundsRaw = interaction.fields.getTextInputValue('rounds_required').trim()
  const handicapRaw = interaction.fields.getTextInputValue('handicap_rules').trim()

  const maxParticipants = maxRaw ? parseInt(maxRaw) : null
  if (maxRaw && (isNaN(maxParticipants!) || maxParticipants! < 2)) {
    await interaction.reply({
      content: '❌ 最大参加人数は2以上の整数を入力してください。',
      flags: MessageFlags.Ephemeral,
    })
    return true
  }

  const winsRequired = winsRaw ? parseInt(winsRaw) : 2
  if (isNaN(winsRequired) || winsRequired < 1 || winsRequired > 5) {
    await interaction.reply({
      content: '❌ 先取数は1〜5の整数を入力してください。',
      flags: MessageFlags.Ephemeral,
    })
    return true
  }

  const roundsRequired = roundsRaw ? parseInt(roundsRaw) : 2
  if (isNaN(roundsRequired) || roundsRequired < 1 || roundsRequired > 5) {
    await interaction.reply({
      content: '❌ ラウンド数は1〜5の整数を入力してください。',
      flags: MessageFlags.Ephemeral,
    })
    return true
  }

  let handicapRules: HandicapRule[] = []
  if (handicapRaw) {
    try {
      handicapRules = parseHandicapRules(handicapRaw)
    } catch {
      await interaction.reply({
        content: '❌ ハンデルールの形式が正しくありません。\n例: `3:1,7:2`（ランク差:ラウンド数）',
        flags: MessageFlags.Ephemeral,
      })
      return true
    }
  }

  const regulation: TournamentRegulation = {
    winsRequired,
    roundsRequired,
    handicapRules,
    ...(totalRounds ? { totalRounds } : {}),
    ...(teamMode ? { teamMode: true, teamBattleFormat, teamEntryMode } : {}),
  }

  const tournament = await TournamentModel.create({
    guild_id: interaction.guildId!,
    name,
    format,
    max_participants: maxParticipants,
    regulation,
    created_by: interaction.user.id,
    channel_id: interaction.channelId,
  })

  // Build announcement embed
  const baseLabel = regulation.teamMode === true
    ? (format === 'league' ? 'リーグ戦（総当たり）団体戦' : format === 'swiss' ? `スイスドロー（${totalRounds ?? '?'}R）団体戦` : 'シングルエリミネーション 団体戦')
    : (format === 'league' ? 'リーグ戦（総当たり）' : format === 'swiss' ? `スイスドロー（${totalRounds ?? '?'}ラウンド）` : 'シングルエリミネーション')
  const formatLabel = baseLabel
  const regLines: string[] = [
    `形式: **${formatLabel}**`,
    `先取数: **${winsRequired}先** / ラウンド数: **${roundsRequired}**`,
  ]
  if (handicapRules.length > 0) {
    regLines.push(
      'ハンデ: ' +
        handicapRules.map(r => `ランク差${r.minRankDiff}以上→${r.rounds}R落とし`).join('、')
    )
  } else {
    regLines.push('ハンデ: なし')
  }
  if (maxParticipants) regLines.push(`定員: ${maxParticipants} 名`)

  const isTeam = regulation.teamMode === true
  const embedDesc = isTeam
    ? (regulation.teamEntryMode === 'create'
        ? 'チームを作って参加するには「チームを作る」、既存チームに参加するには「チームに参加」を押してください。'
        : regulation.teamEntryMode === 'join'
        ? '参加するチームを選んでください。（先に `/tnm team-setup` でチームを作成してください）'
        : '「参加する」を押して個人登録し、後ほど主催者がチームに振り分けます。')
    : '参加したい方は「参加する」ボタンを押してください。'

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`🏆 ${name}`)
    .setDescription(embedDesc)
    .addFields({ name: 'レギュレーション', value: regLines.join('\n') })
    .setFooter({ text: '参加受付中' })
    .setTimestamp()

  let joinRow: ActionRowBuilder<ButtonBuilder>
  if (isTeam && regulation.teamEntryMode === 'create') {
    joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tnm-team-create:${tournament.id}`)
        .setLabel('チームを作る ➕')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tnm-team-list:${tournament.id}`)
        .setLabel('チームに参加 📋')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tnm-leave-btn:${tournament.id}`)
        .setLabel('参加取り消し 🚪')
        .setStyle(ButtonStyle.Danger)
    )
  } else if (isTeam && regulation.teamEntryMode === 'assign') {
    joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tnm-join:${tournament.id}`)
        .setLabel('参加登録 🎮')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tnm-leave-btn:${tournament.id}`)
        .setLabel('参加取り消し 🚪')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`tnm-list:${tournament.id}`)
        .setLabel('参加者一覧 📋')
        .setStyle(ButtonStyle.Secondary)
    )
  } else {
    // join mode or individual tournament
    joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tnm-join:${tournament.id}`)
        .setLabel('参加する 🎮')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tnm-edit:${tournament.id}`)
        .setLabel('エントリー編集 ✏️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tnm-leave-btn:${tournament.id}`)
        .setLabel('参加取り消し 🚪')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`tnm-list:${tournament.id}`)
        .setLabel('参加者一覧 📋')
        .setStyle(ButtonStyle.Secondary)
    )
  }

  const msg = await interaction.reply({
    embeds: [embed],
    components: [joinRow],
    fetchReply: true,
  })

  await TournamentModel.setAnnouncementMessage(tournament.id, interaction.channelId!, msg.id)

  return true
}

// ─── Button interaction ───────────────────────────────────────────────────────

export async function handleButtonInteract(interaction: ButtonInteraction): Promise<boolean> {
  const parts = interaction.customId.split(':')
  const prefix = parts[0]

  if (prefix === 'tnm-join') {
    const tournamentId = parseInt(parts[1])
    return handleJoinButton(interaction, tournamentId)
  }

  if (prefix === 'tnm-list') {
    const tournamentId = parseInt(parts[1])
    return handleListButton(interaction, tournamentId)
  }

  if (prefix === 'tnm-win') {
    const matchId = parseInt(parts[1])
    const participantId = parseInt(parts[2])
    return handleWinButton(interaction, matchId, participantId)
  }

  if (prefix === 'tnm-score') {
    const matchId = parseInt(parts[1])
    const winnerId = parseInt(parts[2])
    const loserGames = parseInt(parts[3])
    return handleScoreButton(interaction, matchId, winnerId, loserGames)
  }

  if (prefix === 'tnm-edit') {
    const tournamentId = parseInt(parts[1])
    return handleEditButton(interaction, tournamentId)
  }

  if (prefix === 'tnm-leave-btn') {
    const tournamentId = parseInt(parts[1])
    return handleLeaveBtnButton(interaction, tournamentId)
  }

  if (prefix === 'tnm-team-create') return handleTeamCreateButton(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-team-list')   return handleTeamListButton(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-team-join')   return handleTeamJoinButton(interaction, parseInt(parts[1]), parseInt(parts[2]))
  if (prefix === 'tnm-confirm')        return handleConfirmButton(interaction, parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]), parseInt(parts[4]))
  if (prefix === 'tnm-correct')        return handleCorrectButton(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-cancel')         return handleCancelButton(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-battle-start')   return handleBattleStart(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-battle-win')     return handleBattleWin(interaction, parseInt(parts[1]), parseInt(parts[2]))
  if (prefix === 'tnm-battle-score')   return handleBattleScore(interaction, parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]))
  if (prefix === 'tnm-battle-confirm') return handleBattleConfirmButton(interaction, parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]), parseInt(parts[4]))
  if (prefix === 'tnm-battle-correct') return handleBattleCorrectButton(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-battle-cancel')  return handleBattleCancelButton(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-assign')         return handleAssignButton(interaction, parseInt(parts[1]), parts[2])
  if (prefix === 'tnm-auto-assign')    return handleAutoAssign(interaction, parseInt(parts[1]), parts[2] as 'balanced' | 'random')

  return false
}

async function handleScoreButton(
  interaction: ButtonInteraction,
  matchId: number,
  winnerId: number,
  loserGames: number
): Promise<boolean> {
  await interaction.deferUpdate()

  const match = await TournamentMatchModel.getById(matchId)
  if (!match || match.status === 'completed') {
    await interaction.editReply({ content: 'この試合はすでに終了しています。' })
    return true
  }

  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const p1IsWinner = Number(match.participant1_id) === winnerId
  const p1Games = p1IsWinner ? regulation.winsRequired : loserGames
  const p2Games = p1IsWinner ? loserGames : regulation.winsRequired

  const matchData = await TournamentMatchModel.getWithParticipants(matchId)
  const winnerName = p1IsWinner ? matchData?.p1_name : matchData?.p2_name

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tnm-confirm:${matchId}:${winnerId}:${p1Games}:${p2Games}`)
      .setLabel('✅ 結果を送信')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`tnm-cancel:${matchId}`)
      .setLabel('❌ キャンセル')
      .setStyle(ButtonStyle.Danger),
  )

  const baseContent = interaction.message.content.split('\n\n')[0]
  await interaction.editReply({
    content: `${baseContent}\n\n⚠️ **${winnerName}** の勝利 (${p1Games}-${p2Games}) で確定しますか？`,
    components: [confirmRow],
  })

  return true
}

// フォーマット別に試合メッセージを再生成するヘルパー
async function formatMatchByFormat(
  format: string, matchId: number, round: number, regulation: TournamentRegulation
): Promise<{ content: string; components: ActionRowBuilder<ButtonBuilder>[] }> {
  if (format === 'league') return LeagueService.formatMatchContent(matchId, regulation)
  if (format === 'swiss') return SwissService.formatMatchContent(matchId, regulation, round, regulation.totalRounds ?? 4)
  return BracketService.formatMatchContent(matchId, regulation)
}

async function handleConfirmButton(
  interaction: ButtonInteraction,
  matchId: number,
  winnerId: number,
  p1Games: number,
  p2Games: number
): Promise<boolean> {
  await interaction.deferUpdate()

  const match = await TournamentMatchModel.getById(matchId)
  if (!match || match.status === 'completed') {
    await interaction.editReply({ content: 'この試合はすでに終了しています。' })
    return true
  }

  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const matchData = await TournamentMatchModel.getWithParticipants(matchId)
  const p1IsWinner = Number(match.participant1_id) === winnerId
  const winnerName = p1IsWinner ? matchData?.p1_name : matchData?.p2_name

  const correctRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tnm-correct:${matchId}`)
      .setLabel('🖊️ 結果を修正')
      .setStyle(ButtonStyle.Secondary),
  )

  const channel = interaction.channel
  const isTextChannel = channel && channel.isTextBased() && !channel.isDMBased()

  if (tournament.format === 'single_elim') {
    const recorded = await TournamentMatchModel.setScore(matchId, winnerId, p1Games, p2Games)
    if (!recorded) {
      await interaction.editReply({ content: 'この試合の結果はすでに記録されています。' })
      return true
    }
    const result = await BracketService.advanceWinner(matchId, winnerId, regulation)

    await interaction.editReply({
      content: `${interaction.message.content.split('\n\n')[0]}\n\n✅ **${winnerName}** の勝利が報告されました。`,
      components: [correctRow],
    })

    if (isTextChannel && channel) {
      if (result.isChampion) {
        const winner = await TournamentParticipantModel.getById(winnerId)
        if (winner) {
          await channel.send(
            `🏆 **${tournament.name}** 終了！\n優勝: <@${winner.discord_id}> **${winner.discord_name}** さん！おめでとうございます！`
          )
        }
      } else if (result.nextMatchId && result.nextMatchReady) {
        try {
          const { content, components } = await BracketService.formatMatchContent(result.nextMatchId, regulation)
          const msg = await channel.send({ content, components })
          await TournamentMatchModel.setMessageId(result.nextMatchId, msg.id)
        } catch (err) {
          console.error(`[tnm] Failed to post next match ${result.nextMatchId}:`, err)
        }
      }
    }
    return true
  }

  // league / swiss
  const scoreRecorded = await TournamentMatchModel.setScore(matchId, winnerId, p1Games, p2Games)
  if (!scoreRecorded) {
    await interaction.editReply({ content: 'この試合の結果はすでに記録されています。' })
    return true
  }

  await interaction.editReply({
    content: `${interaction.message.content.split('\n\n')[0]}\n\n✅ **${winnerName}** の勝利 (${p1Games}-${p2Games})`,
    components: [correctRow],
  })

  if (tournament.format === 'league') {
    const allDone = await LeagueService.checkAllComplete(tournament.id)
    if (allDone) {
      await TournamentModel.setStatus(tournament.id, 'completed')
      const standings = await LeagueService.getStandings(tournament.id)
      const champion = standings[0]?.participant
      if (isTextChannel && champion && channel) {
        await channel.send(
          `🏆 **${tournament.name}** 全試合終了！\n優勝: <@${champion.discord_id}> **${champion.discord_name}** さん！おめでとうございます！`
        )
      }
    }
    return true
  }

  if (tournament.format === 'swiss') {
    const totalRounds = regulation.totalRounds ?? 4
    const currentRound = match.round
    const roundDone = await SwissService.isRoundComplete(tournament.id, currentRound)
    if (!roundDone) return true

    if (currentRound >= totalRounds) {
      await TournamentModel.setStatus(tournament.id, 'completed')
      const standings = await SwissService.getStandings(tournament.id)
      const champion = standings[0]?.participant
      if (isTextChannel && channel) {
        const embed = await SwissService.formatSwissEmbed(tournament.id)
        await channel.send({ content: `🏆 **${tournament.name}** 全ラウンド終了！`, embeds: [embed] })
        if (champion) {
          await channel.send(
            `優勝: <@${champion.discord_id}> **${champion.discord_name}** さん！おめでとうございます！`
          )
        }
      }
      return true
    }

    const nextRound = currentRound + 1
    const allMatches = await TournamentMatchModel.getByTournament(tournament.id)
    const participants = await TournamentParticipantModel.getByTournament(tournament.id)
    const nextMatchIds = await SwissService.generateRound(tournament.id, nextRound, participants, regulation, allMatches)

    if (isTextChannel && channel) {
      await channel.send(`━━━━━━━━━━━━━━━━━━━━━━\n**Round ${nextRound} / ${totalRounds} 開始！**`)
      for (const mid of nextMatchIds) {
        try {
          const { content, components } = await SwissService.formatMatchContent(mid, regulation, nextRound, totalRounds)
          const msg = await channel.send({ content, components })
          await TournamentMatchModel.setMessageId(mid, msg.id)
        } catch (err) {
          console.error(`[tnm] Failed to post swiss round ${nextRound} match ${mid}:`, err)
        }
      }
    }
  }

  return true
}

async function handleCorrectButton(interaction: ButtonInteraction, matchId: number): Promise<boolean> {
  await interaction.deferUpdate()

  const match = await TournamentMatchModel.getById(matchId)
  if (!match || match.status !== 'completed') {
    await interaction.editReply({ content: '修正できる完了試合がありません。' })
    return true
  }

  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) { await interaction.editReply({ content: '❌' }); return true }
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  if (tournament.format === 'single_elim') {
    const allMatches = await TournamentMatchModel.getByTournament(match.tournament_id)
    const nextRound = match.round + 1
    const nextMatchNumber = Math.ceil(match.match_number / 2)
    const nextMatch = allMatches.find(m => m.round === nextRound && m.match_number === nextMatchNumber)

    if (nextMatch && nextMatch.status === 'completed') {
      await interaction.editReply({
        content: '❌ 次の試合がすでに終了しているため修正できません。先に次の試合を修正してください。',
      })
      return true
    }

    const winnerId = match.winner_id
    const p1Id = match.participant1_id != null ? Number(match.participant1_id) : null
    const p2Id = match.participant2_id != null ? Number(match.participant2_id) : null
    const loserId = p1Id === winnerId ? p2Id : p1Id

    if (nextMatch) {
      const slot: 'p1' | 'p2' = match.match_number % 2 === 1 ? 'p1' : 'p2'
      await TournamentMatchModel.clearParticipant(nextMatch.id, slot)
    }
    if (loserId) await TournamentParticipantModel.restore(loserId)
    if (tournament.status === 'completed') await TournamentModel.setStatus(tournament.id, 'in_progress')
  }

  await TournamentMatchModel.resetMatch(matchId)
  const { content, components } = await formatMatchByFormat(tournament.format, matchId, match.round, regulation)
  await interaction.editReply({ content, components })
  return true
}

async function handleCancelButton(interaction: ButtonInteraction, matchId: number): Promise<boolean> {
  const match = await TournamentMatchModel.getById(matchId)
  if (!match) { await interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral }); return true }
  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  await interaction.deferUpdate()
  const { content, components } = await formatMatchByFormat(tournament.format, matchId, match.round, regulation)
  await interaction.editReply({ content, components })
  return true
}

async function handleEditButton(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.reply({ content: '参加受付は終了しています。', flags: MessageFlags.Ephemeral })
    return true
  }

  const existing = await TournamentParticipantModel.getByDiscordId(tournamentId, interaction.user.id)
  if (!existing) {
    await interaction.reply({ content: 'まだ参加登録されていません。「参加する」ボタンから登録してください。', flags: MessageFlags.Ephemeral })
    return true
  }

  const rankSelect = new StringSelectMenuBuilder()
    .setCustomId(`tnm-edit-rank:${tournamentId}`)
    .setPlaceholder('新しいランクを選択してください')
    .addOptions(RANKS.map(r => new StringSelectMenuOptionBuilder().setLabel(r).setValue(r)))

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rankSelect)

  await interaction.reply({
    content: `現在のエントリー情報: ランク **${existing.rank ?? 'なし'}** / キャラ **${existing.character ?? 'なし'}**\n新しいランクを選択してください。`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  })
  return true
}

async function handleLeaveBtnButton(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.reply({ content: '参加受付が終了しているため、取り消しできません。', flags: MessageFlags.Ephemeral })
    return true
  }

  const participant = await TournamentParticipantModel.getByDiscordId(tournamentId, interaction.user.id)
  if (!participant) {
    await interaction.reply({ content: 'この大会に参加登録されていません。', flags: MessageFlags.Ephemeral })
    return true
  }

  await TournamentParticipantModel.delete(participant.id)
  const count = await TournamentParticipantModel.count(tournamentId)

  if (interaction.guild) {
    await updateAnnouncementEmbed(interaction.guild, tournament, count)
  }

  await interaction.reply({
    content: `✅ **${tournament.name}** の参加を取り消しました。`,
    flags: MessageFlags.Ephemeral,
  })
  return true
}

async function handleJoinButton(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.reply({
      content: '参加受付は終了しています。',
      flags: MessageFlags.Ephemeral,
    })
    return true
  }

  if (tournament.max_participants) {
    const count = await TournamentParticipantModel.count(tournamentId)
    if (count >= tournament.max_participants) {
      await interaction.reply({
        content: `❌ 定員（${tournament.max_participants}名）に達しています。`,
        flags: MessageFlags.Ephemeral,
      })
      return true
    }
  }

  const existing = await TournamentParticipantModel.getByDiscordId(tournamentId, interaction.user.id)
  if (existing) {
    await interaction.reply({
      content: `すでに参加登録済みです（ランク: ${existing.rank ?? 'なし'}）。`,
      flags: MessageFlags.Ephemeral,
    })
    return true
  }

  const rankSelect = new StringSelectMenuBuilder()
    .setCustomId(`tnm-rank-select:${tournamentId}`)
    .setPlaceholder('ランクを選択してください')
    .addOptions(
      RANKS.map(r =>
        new StringSelectMenuOptionBuilder().setLabel(r).setValue(r)
      )
    )

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rankSelect)

  await interaction.reply({
    content: `**${tournament.name}** に参加するランクを選択してください。`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  })

  return true
}

async function handleListButton(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) {
    await interaction.reply({ content: '大会が見つかりません。', flags: MessageFlags.Ephemeral })
    return true
  }

  const participants = await TournamentParticipantModel.getByTournament(tournamentId)
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 ${tournament.name} — 参加者一覧`)
    .setDescription(
      participants.length > 0
        ? participants.map((p, i) => `${i + 1}. <@${p.discord_id}> ${p.rank ? `[${p.rank}]` : ''}${p.character ? ` (${p.character})` : ''}`).join('\n')
        : 'まだ参加者がいません。'
    )
    .setFooter({ text: `${participants.length} 名` })
    .setTimestamp()

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
  return true
}

async function handleWinButton(
  interaction: ButtonInteraction,
  matchId: number,
  participantId: number
): Promise<boolean> {
  // Defer immediately so multi-step DB work doesn't exceed Discord's 3s interaction window
  await interaction.deferUpdate()

  const match = await TournamentMatchModel.getById(matchId)
  if (!match) {
    await interaction.editReply({ content: '試合が見つかりません。' })
    return true
  }
  if (match.status === 'completed') {
    await interaction.editReply({
      content: 'この試合はすでに終了しています。',
    })
    return true
  }

  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const matchData = await TournamentMatchModel.getWithParticipants(matchId)
  const p1IdNum = matchData?.participant1_id != null ? Number(matchData.participant1_id) : null
  const loserName = p1IdNum === participantId ? matchData?.p2_name : matchData?.p1_name
  const winnerName = p1IdNum === participantId ? matchData?.p1_name : matchData?.p2_name
  const winnerLabel = winnerName ?? `参加者#${participantId}`

  // League / Swiss: show loser game count input then confirmation
  if (tournament.format === 'league' || tournament.format === 'swiss') {
    const winsRequired = regulation.winsRequired
    const scoreRow = new ActionRowBuilder<ButtonBuilder>()
    for (let g = 0; g < winsRequired; g++) {
      scoreRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-score:${matchId}:${participantId}:${g}`)
          .setLabel(`${g}ゲーム`)
          .setStyle(ButtonStyle.Secondary)
      )
    }
    const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tnm-cancel:${matchId}`)
        .setLabel('❌ キャンセル')
        .setStyle(ButtonStyle.Danger),
    )
    await interaction.editReply({
      content: `${interaction.message.content}\n\n**${winnerLabel}** の勝利が報告されました。\n**${loserName ?? '相手'}** は何ゲーム取りましたか？`,
      components: [scoreRow, cancelRow],
    })
    return true
  }

  // single_elim: show confirmation before recording
  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tnm-confirm:${matchId}:${participantId}:0:0`)
      .setLabel('✅ 結果を送信')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`tnm-cancel:${matchId}`)
      .setLabel('❌ キャンセル')
      .setStyle(ButtonStyle.Danger),
  )
  await interaction.editReply({
    content: `${interaction.message.content}\n\n⚠️ **${winnerLabel}** の勝利で確定しますか？`,
    components: [confirmRow],
  })

  return true
}

// ─── Select menu interaction ──────────────────────────────────────────────────

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<boolean> {
  const parts = interaction.customId.split(':')
  if (parts[0] === 'tnm-rank-select')  return handleRankSelectMenu(interaction, parseInt(parts[1]))
  if (parts[0] === 'tnm-char-select')  return handleCharacterSelectMenu(interaction, parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]))
  if (parts[0] === 'tnm-edit-rank')    return handleEditRankSelectMenu(interaction, parseInt(parts[1]))
  if (parts[0] === 'tnm-edit-char')    return handleEditCharSelectMenu(interaction, parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]))
  if (parts[0] === 'tnm-admin-rank')   return handleAdminRankSelectMenu(interaction, parseInt(parts[1]), parts[2])
  if (parts[0] === 'tnm-admin-char')   return handleAdminCharSelectMenu(interaction, parseInt(parts[1]), parts[2], parseInt(parts[3]), parseInt(parts[4]))
  if (parts[0] === 'tnm-team-rank')    return handleTeamMemberRankSelect(interaction, parseInt(parts[1]), parseInt(parts[2]))
  if (parts[0] === 'tnm-team-char')    return handleTeamMemberCharSelect(interaction, parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]))
  if (parts[0] === 'tnm-team-select')  return handleTeamSelectMenu(interaction, parseInt(parts[1]))
  if (parts[0] === 'tnm-assign-slot')  return handleAssignSlotSelect(interaction, parseInt(parts[1]), parts[2], parts[3])
  return false
}

async function handleEditRankSelectMenu(interaction: StringSelectMenuInteraction, tournamentId: number): Promise<boolean> {
  const rank = interaction.values[0]
  if (!RANKS.includes(rank as typeof RANKS[number])) {
    await interaction.update({ content: '❌ 無効なランクです。', components: [] })
    return true
  }
  const rankIndex = RANKS.indexOf(rank as typeof RANKS[number])
  const row = buildCharacterSelectRow(`tnm-edit-char:${tournamentId}:${rankIndex}`, 0)
  await interaction.update({
    content: `ランク **${rank}** を選択しました。\nキャラクターを選択してください。`,
    components: [row],
  })
  return true
}

async function handleEditCharSelectMenu(
  interaction: StringSelectMenuInteraction,
  tournamentId: number,
  rankIndex: number,
  page: number
): Promise<boolean> {
  const value = interaction.values[0]
  if (value === '__next__') {
    await interaction.update({ components: [buildCharacterSelectRow(`tnm-edit-char:${tournamentId}:${rankIndex}`, page + 1)] })
    return true
  }
  if (value === '__prev__') {
    await interaction.update({ components: [buildCharacterSelectRow(`tnm-edit-char:${tournamentId}:${rankIndex}`, page - 1)] })
    return true
  }
  const character = value
  if (!CHARACTERS.includes(character as typeof CHARACTERS[number])) {
    await interaction.update({ content: '❌ 無効なキャラクターです。', components: [] })
    return true
  }
  const rank = RANKS[rankIndex]
  if (!rank) {
    await interaction.update({ content: '❌ ランク情報が不正です。最初からやり直してください。', components: [] })
    return true
  }
  const participant = await TournamentParticipantModel.getByDiscordId(tournamentId, interaction.user.id)
  if (!participant) {
    await interaction.update({ content: '参加登録が見つかりません。', components: [] })
    return true
  }
  await TournamentParticipantModel.setRankAndCharacter(participant.id, rank, character)
  await interaction.update({
    content: `✅ エントリーを更新しました！\nランク: **${rank}** / キャラ: **${character}**`,
    components: [],
  })
  return true
}

async function handleAdminRankSelectMenu(
  interaction: StringSelectMenuInteraction,
  tournamentId: number,
  targetDiscordId: string
): Promise<boolean> {
  const rank = interaction.values[0]
  if (!RANKS.includes(rank as typeof RANKS[number])) {
    await interaction.update({ content: '❌ 無効なランクです。', components: [] })
    return true
  }
  const rankIndex = RANKS.indexOf(rank as typeof RANKS[number])
  const row = buildCharacterSelectRow(`tnm-admin-char:${tournamentId}:${targetDiscordId}:${rankIndex}`, 0)
  await interaction.update({
    content: `ランク **${rank}** を選択しました。\nキャラクターを選択してください。`,
    components: [row],
  })
  return true
}

async function handleAdminCharSelectMenu(
  interaction: StringSelectMenuInteraction,
  tournamentId: number,
  targetDiscordId: string,
  rankIndex: number,
  page: number
): Promise<boolean> {
  const value = interaction.values[0]
  if (value === '__next__') {
    await interaction.update({ components: [buildCharacterSelectRow(`tnm-admin-char:${tournamentId}:${targetDiscordId}:${rankIndex}`, page + 1)] })
    return true
  }
  if (value === '__prev__') {
    await interaction.update({ components: [buildCharacterSelectRow(`tnm-admin-char:${tournamentId}:${targetDiscordId}:${rankIndex}`, page - 1)] })
    return true
  }
  const character = value
  if (!CHARACTERS.includes(character as typeof CHARACTERS[number])) {
    await interaction.update({ content: '❌ 無効なキャラクターです。', components: [] })
    return true
  }
  const rank = RANKS[rankIndex]
  if (!rank) {
    await interaction.update({ content: '❌ ランク情報が不正です。最初からやり直してください。', components: [] })
    return true
  }
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.update({ content: '参加受付は終了しています。', components: [] })
    return true
  }

  // Fetch target member for display name
  let targetName = targetDiscordId
  try {
    const member = await interaction.guild?.members.fetch(targetDiscordId)
    targetName = member?.displayName ?? member?.user.username ?? targetDiscordId
  } catch { /* fallback to id */ }

  const existing = await TournamentParticipantModel.getByDiscordId(tournamentId, targetDiscordId)
  if (existing) {
    await TournamentParticipantModel.setRankAndCharacter(existing.id, rank, character)
    await interaction.update({
      content: `✅ **${targetName}** のエントリーを更新しました。\nランク: **${rank}** / キャラ: **${character}**`,
      components: [],
    })
  } else {
    if (tournament.max_participants) {
      const count = await TournamentParticipantModel.count(tournamentId)
      if (count >= tournament.max_participants) {
        await interaction.update({ content: `❌ 定員（${tournament.max_participants}名）に達しています。`, components: [] })
        return true
      }
    }
    await TournamentParticipantModel.create({
      tournament_id: tournamentId,
      discord_id: targetDiscordId,
      discord_name: targetName,
      rank,
      character,
    })
    const count = await TournamentParticipantModel.count(tournamentId)
    if (interaction.guild) {
      await updateAnnouncementEmbed(interaction.guild, tournament, count)
    }
    await interaction.update({
      content: `✅ **${targetName}** をエントリーしました。\nランク: **${rank}** / キャラ: **${character}**`,
      components: [],
    })
  }
  return true
}

// idPrefix: everything before ":page" in the customId (e.g. "tnm-char-select:1:5")
function buildCharacterSelectRow(idPrefix: string, page: number): ActionRowBuilder<StringSelectMenuBuilder> {
  const PAGE_SIZE = 24
  const start = page * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, CHARACTERS.length)
  const hasNext = end < CHARACTERS.length
  const hasPrev = page > 0

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${idPrefix}:${page}`)
    .setPlaceholder('キャラクターを選択してください')

  if (hasPrev) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel('← 前のページ').setValue('__prev__'))
  }
  for (let i = start; i < end; i++) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(CHARACTERS[i]).setValue(CHARACTERS[i]))
  }
  if (hasNext) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel('次のページ →').setValue('__next__'))
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
}

async function handleRankSelectMenu(interaction: StringSelectMenuInteraction, tournamentId: number): Promise<boolean> {
  const rank = interaction.values[0]

  if (!RANKS.includes(rank as typeof RANKS[number])) {
    await interaction.update({ content: '❌ 無効なランクです。', components: [] })
    return true
  }

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.update({ content: '参加受付は終了しています。', components: [] })
    return true
  }

  if (tournament.max_participants) {
    const count = await TournamentParticipantModel.count(tournamentId)
    if (count >= tournament.max_participants) {
      await interaction.update({ content: `❌ 定員（${tournament.max_participants}名）に達しています。`, components: [] })
      return true
    }
  }

  const existing = await TournamentParticipantModel.getByDiscordId(tournamentId, interaction.user.id)
  if (existing) {
    await interaction.update({
      content: `すでに参加登録済みです（ランク: ${existing.rank ?? 'なし'}）。`,
      components: [],
    })
    return true
  }

  const rankIndex = RANKS.indexOf(rank as typeof RANKS[number])
  const row = buildCharacterSelectRow(`tnm-char-select:${tournamentId}:${rankIndex}`, 0)

  await interaction.update({
    content: `ランク **${rank}** を選択しました。\n次に使用キャラクターを選択してください。`,
    components: [row],
  })

  return true
}

async function handleCharacterSelectMenu(
  interaction: StringSelectMenuInteraction,
  tournamentId: number,
  rankIndex: number,
  page: number
): Promise<boolean> {
  const value = interaction.values[0]

  if (value === '__next__') {
    await interaction.update({ components: [buildCharacterSelectRow(`tnm-char-select:${tournamentId}:${rankIndex}`, page + 1)] })
    return true
  }
  if (value === '__prev__') {
    await interaction.update({ components: [buildCharacterSelectRow(`tnm-char-select:${tournamentId}:${rankIndex}`, page - 1)] })
    return true
  }

  const character = value
  if (!CHARACTERS.includes(character as typeof CHARACTERS[number])) {
    await interaction.update({ content: '❌ 無効なキャラクターです。', components: [] })
    return true
  }

  const rank = RANKS[rankIndex]
  if (!rank) {
    await interaction.update({ content: '❌ ランク情報が不正です。最初からやり直してください。', components: [] })
    return true
  }

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.update({ content: '参加受付は終了しています。', components: [] })
    return true
  }

  const member = interaction.member as GuildMember | null
  const displayName = member?.displayName ?? interaction.user.displayName ?? interaction.user.username

  const result = await TournamentParticipantModel.createIfUnderCap({
    tournament_id: tournamentId,
    discord_id: interaction.user.id,
    discord_name: displayName,
    rank,
    character,
    maxParticipants: tournament.max_participants,
  })

  if (result === 'duplicate') {
    await interaction.update({
      content: 'すでに参加登録済みです。',
      components: [],
    })
    return true
  }

  if (result === 'over_cap') {
    await interaction.update({ content: `❌ 定員（${tournament.max_participants}名）に達しています。`, components: [] })
    return true
  }

  const count = await TournamentParticipantModel.count(tournamentId)

  if (interaction.guild) {
    await updateAnnouncementEmbed(interaction.guild, tournament, count)
  }

  await interaction.update({
    content: `✅ **${tournament.name}** に参加登録しました！\nランク: **${rank}** / キャラ: **${character}**\n現在の参加者: ${count} 名`,
    components: [],
  })

  return true
}

async function handleEnter(interaction: ChatInputCommandInteraction) {
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.reply({ content: 'アクティブな大会の参加受付がありません。', flags: MessageFlags.Ephemeral })
    return
  }

  const targetUser = interaction.options.getUser('user', true)

  const rankSelect = new StringSelectMenuBuilder()
    .setCustomId(`tnm-admin-rank:${tournament.id}:${targetUser.id}`)
    .setPlaceholder('ランクを選択してください')
    .addOptions(RANKS.map(r => new StringSelectMenuOptionBuilder().setLabel(r).setValue(r)))

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rankSelect)

  await interaction.reply({
    content: `**${targetUser.displayName ?? targetUser.username}** のランクを選択してください。`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateAnnouncementEmbed(guild: Guild, tournament: { channel_id: string | null; announcement_message_id: string | null }, count: number): Promise<void> {
  if (!tournament.channel_id || !tournament.announcement_message_id) return
  try {
    const ch = await guild.channels.fetch(tournament.channel_id)
    if (!ch || !ch.isTextBased() || ch.isDMBased()) return
    const msg = await ch.messages.fetch(tournament.announcement_message_id)
    if (!msg.editable || !msg.embeds[0]) return
    const updated = EmbedBuilder.from(msg.embeds[0]).setFooter({ text: `参加受付中 — ${count} 名` })
    await msg.edit({ embeds: [updated] })
  } catch {
    // best effort
  }
}

function parseHandicapRules(input: string): HandicapRule[] {
  return input.split(',').map(part => {
    const [diffStr, roundsStr] = part.trim().split(':')
    const diff = parseInt(diffStr)
    const rounds = parseInt(roundsStr)
    if (isNaN(diff) || isNaN(rounds) || diff < 1 || rounds < 1) {
      throw new Error(`Invalid rule: ${part}`)
    }
    return { minRankDiff: diff, rounds }
  })
}

function statusLabel(status: string): string {
  switch (status) {
    case 'registration': return '参加受付中'
    case 'closed': return '受付終了'
    case 'in_progress': return '進行中'
    case 'completed': return '終了'
    default: return status
  }
}

// ─── 団体戦ヘルパー ────────────────────────────────────────────────────────────

function buildTeamRankSelectRow(tournamentId: number, teamId: number) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`tnm-team-rank:${tournamentId}:${teamId}`)
    .setPlaceholder('ランクを選択してください')
    .addOptions(RANKS.map(r => new StringSelectMenuOptionBuilder().setLabel(r).setValue(r)))
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
}

async function buildTeamAnnouncementComponents(
  tournamentId: number,
  entryMode: string
): Promise<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]> {
  if (entryMode === 'create') {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tnm-team-create:${tournamentId}`).setLabel('チームを作る ➕').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tnm-team-list:${tournamentId}`).setLabel('チームに参加 📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tnm-leave-btn:${tournamentId}`).setLabel('参加取り消し 🚪').setStyle(ButtonStyle.Danger),
    )]
  }
  if (entryMode === 'join') {
    const teams = await TournamentTeamModel.getByTournament(tournamentId)
    if (teams.length === 0) {
      return [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`tnm-team-list:${tournamentId}`).setLabel('チームを確認 📋').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`tnm-leave-btn:${tournamentId}`).setLabel('参加取り消し 🚪').setStyle(ButtonStyle.Danger),
      )]
    }
    if (teams.length <= 3) {
      const row = new ActionRowBuilder<ButtonBuilder>()
      for (const t of teams) {
        row.addComponents(new ButtonBuilder().setCustomId(`tnm-team-join:${tournamentId}:${t.id}`).setLabel(`${t.name}に参加`).setStyle(ButtonStyle.Primary))
      }
      row.addComponents(new ButtonBuilder().setCustomId(`tnm-leave-btn:${tournamentId}`).setLabel('参加取り消し 🚪').setStyle(ButtonStyle.Danger))
      return [row]
    }
    // 4チーム以上はセレクトメニュー
    const select = new StringSelectMenuBuilder()
      .setCustomId(`tnm-team-select:${tournamentId}`)
      .setPlaceholder('参加するチームを選択')
      .addOptions(teams.map(t => new StringSelectMenuOptionBuilder().setLabel(t.name).setValue(String(t.id))))
    return [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`tnm-leave-btn:${tournamentId}`).setLabel('参加取り消し 🚪').setStyle(ButtonStyle.Danger),
      ),
    ]
  }
  // assign mode
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tnm-join:${tournamentId}`).setLabel('参加登録 🎮').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tnm-leave-btn:${tournamentId}`).setLabel('参加取り消し 🚪').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`tnm-list:${tournamentId}`).setLabel('参加者一覧 📋').setStyle(ButtonStyle.Secondary),
  )]
}

async function updateTeamAnnouncement(guild: any, tournament: any, regulation: TournamentRegulation) {
  if (!tournament.announcement_message_id || !tournament.channel_id) return
  try {
    const channel = await guild.channels.fetch(tournament.channel_id)
    if (!channel?.isTextBased()) return
    const msg = await channel.messages.fetch(tournament.announcement_message_id)
    const teams = await TournamentTeamModel.getByTournament(tournament.id)
    const teamLines = await Promise.all(teams.map(async t => {
      const members = await TournamentTeamMemberModel.getByTeam(t.id)
      const names = members.map(m => m.discord_name).join(', ') || '（未参加）'
      return `**${t.name}** (${members.length}名): ${names}`
    }))
    const entryMode = regulation.teamEntryMode ?? 'create'
    const embed = EmbedBuilder.from(msg.embeds[0])
      .spliceFields(0, 10)
      .addFields(
        { name: 'レギュレーション', value: msg.embeds[0].fields.find((f: { name: string }) => f.name === 'レギュレーション')?.value ?? '' },
        { name: `参加チーム (${teams.length}チーム)`, value: teamLines.join('\n') || 'まだチームがありません' }
      )
    const components = await buildTeamAnnouncementComponents(tournament.id, entryMode)
    await msg.edit({ embeds: [embed], components })
  } catch { /* ベストエフォート */ }
}

// ─── 団体戦エントリーハンドラ ────────────────────────────────────────────────

async function handleTeamCreateButton(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.reply({ content: '参加受付中の大会が見つかりません。', flags: MessageFlags.Ephemeral })
    return true
  }
  const modal = new ModalBuilder()
    .setCustomId(`tnm-team-create:modal:${tournamentId}`)
    .setTitle('チームを作成する')
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('team_name').setLabel('チーム名').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
    )
  )
  await interaction.showModal(modal)
  return true
}

async function handleTeamCreateModal(interaction: ModalSubmitInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.editReply('❌ 参加受付中の大会が見つかりません。')
    return true
  }
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  // 既に同名チームがないか確認
  const teamName = interaction.fields.getTextInputValue('team_name').trim()
  if (!teamName) { await interaction.editReply('❌ チーム名を入力してください。'); return true }
  const existing = await TournamentTeamModel.getByName(tournamentId, teamName)
  if (existing) { await interaction.editReply(`❌ **${teamName}** はすでに存在します。`); return true }

  // 自分が既にどこかのチームにいないか確認
  const alreadyMember = await TournamentTeamMemberModel.getByDiscordIdInTournament(tournamentId, interaction.user.id)
  if (alreadyMember) { await interaction.editReply('❌ すでにチームに参加しています。'); return true }

  const teamOrder = (await TournamentTeamModel.getByTournament(tournamentId)).length
  const team = await TournamentTeamModel.create({ tournament_id: tournamentId, name: teamName, team_order: teamOrder })

  // 作成者をキャプテン（先鋒=1）として追加
  await TournamentTeamMemberModel.create({
    team_id: team.id,
    discord_id: interaction.user.id,
    discord_name: interaction.user.displayName || interaction.user.username,
    position: 1,
    is_captain: true,
  })

  await interaction.editReply(`✅ **${teamName}** を作成し、先鋒で参加しました。\nランク・キャラ設定のため続けてください。`)

  // チームメッセージを投稿（参加ボタン付き）
  const channel = interaction.channel
  if (channel && channel.isTextBased() && !channel.isDMBased()) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tnm-team-join:${tournamentId}:${team.id}`).setLabel(`${teamName}に参加する`).setStyle(ButtonStyle.Primary)
    )
    const msg = await channel.send({
      content: `📣 **${teamName}** が結成されました！参加したい方はボタンを押してください。`,
      components: [row],
    })
    await TournamentTeamModel.setAnnouncementMessageId(team.id, msg.id)
  }

  // ランク選択を促す
  const rankRow = buildTeamRankSelectRow(tournamentId, team.id)
  await interaction.followUp({
    content: 'ランクを設定してください。',
    components: [rankRow as any],
    flags: MessageFlags.Ephemeral,
  })

  await updateTeamAnnouncement(interaction.guild!, tournament, regulation)
  return true
}

async function handleTeamListButton(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const teams = await TournamentTeamModel.getByTournament(tournamentId)
  if (teams.length === 0) {
    await interaction.reply({ content: 'まだチームがありません。「チームを作る」ボタンで作成してください。', flags: MessageFlags.Ephemeral })
    return true
  }
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  // 5ボタン/行
  for (let i = 0; i < teams.length && i < 20; i += 4) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    for (let j = i; j < Math.min(i + 4, teams.length); j++) {
      const t = teams[j]
      const count = await TournamentTeamMemberModel.countByTeam(t.id)
      row.addComponents(
        new ButtonBuilder().setCustomId(`tnm-team-join:${tournamentId}:${t.id}`).setLabel(`${t.name} (${count}名)`).setStyle(ButtonStyle.Primary).setDisabled(count >= 5)
      )
    }
    rows.push(row)
  }
  await interaction.reply({ content: '参加するチームを選んでください。', components: rows, flags: MessageFlags.Ephemeral })
  return true
}

async function handleTeamJoinButton(interaction: ButtonInteraction, tournamentId: number, teamId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament || tournament.status !== 'registration') {
    await interaction.reply({ content: '参加受付中の大会が見つかりません。', flags: MessageFlags.Ephemeral })
    return true
  }
  const alreadyMember = await TournamentTeamMemberModel.getByDiscordIdInTournament(tournamentId, interaction.user.id)
  if (alreadyMember) {
    const existingTeam = await TournamentTeamModel.getById(alreadyMember.team_id)
    await interaction.reply({ content: `❌ すでに **${existingTeam?.name ?? `チーム#${alreadyMember.team_id}`}** に参加しています。`, flags: MessageFlags.Ephemeral })
    return true
  }
  const team = await TournamentTeamModel.getById(teamId)
  if (!team) { await interaction.reply({ content: '❌ チームが見つかりません。', flags: MessageFlags.Ephemeral }); return true }
  const count = await TournamentTeamMemberModel.countByTeam(teamId)
  if (count >= 5) { await interaction.reply({ content: `❌ **${team.name}** はすでに満員です（5名）。`, flags: MessageFlags.Ephemeral }); return true }

  // 一旦名前だけ追加して位置は後で
  await TournamentTeamMemberModel.create({
    team_id: teamId,
    discord_id: interaction.user.id,
    discord_name: interaction.user.displayName || interaction.user.username,
    position: count + 1,
  })

  const rankRow = buildTeamRankSelectRow(tournamentId, teamId)
  await interaction.reply({
    content: `✅ **${team.name}** に参加しました（${POSITION_NAMES[count]}）。\nランクを選択してください。`,
    components: [rankRow as any],
    flags: MessageFlags.Ephemeral,
  })

  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  await updateTeamAnnouncement(interaction.guild!, tournament, regulation)
  return true
}

async function handleTeamMemberRankSelect(interaction: StringSelectMenuInteraction, tournamentId: number, teamId: number): Promise<boolean> {
  const rank = interaction.values[0]
  const member = await TournamentTeamMemberModel.getByDiscordId(teamId, interaction.user.id)
  if (!member) { await interaction.update({ content: '❌ チームメンバーが見つかりません。', components: [] }); return true }
  await TournamentTeamMemberModel.setRank(member.id, rank)
  const rankIndex = RANKS.indexOf(rank as any)
  const charRow = buildCharacterSelectRow(`tnm-team-char:${tournamentId}:${teamId}:${rankIndex}`, 0)
  await interaction.update({ content: `ランク **${rank}** を設定しました。キャラクターを選択してください。`, components: [charRow] })
  return true
}

async function handleTeamMemberCharSelect(interaction: StringSelectMenuInteraction, tournamentId: number, teamId: number, rankIndex: number): Promise<boolean> {
  const value = interaction.values[0]
  const parts = interaction.customId.split(':')
  // customId format: tnm-team-char:tournamentId:teamId:rankIndex:page
  const page = parseInt(parts[4] ?? '0')

  if (value === '__next__') {
    const row = buildCharacterSelectRow(`tnm-team-char:${tournamentId}:${teamId}:${rankIndex}`, page + 1)
    await interaction.update({ components: [row] })
    return true
  }
  if (value === '__prev__') {
    const row = buildCharacterSelectRow(`tnm-team-char:${tournamentId}:${teamId}:${rankIndex}`, page - 1)
    await interaction.update({ components: [row] })
    return true
  }
  const character = value
  const member = await TournamentTeamMemberModel.getByDiscordId(teamId, interaction.user.id)
  if (!member) { await interaction.update({ content: '❌ メンバーが見つかりません。', components: [] }); return true }
  await TournamentTeamMemberModel.setCharacter(member.id, character)
  const team = await TournamentTeamModel.getById(teamId)
  await interaction.update({ content: `✅ キャラクター **${character}** を設定しました。登録完了！（チーム: **${team?.name}**）`, components: [] })
  return true
}

async function handleTeamSelectMenu(interaction: StringSelectMenuInteraction, tournamentId: number): Promise<boolean> {
  const teamId = parseInt(interaction.values[0])
  return handleTeamJoinButton(interaction as any, tournamentId, teamId)
}

// ─── /tnm team-setup / team-assign ──────────────────────────────────────────

async function handleTeamSetup(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) { await interaction.editReply('❌ アクティブな大会が見つかりません。'); return }
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  if (!regulation.teamMode) { await interaction.editReply('❌ 団体戦モードの大会ではありません。'); return }

  const names: string[] = []
  for (let i = 1; i <= 8; i++) {
    const n = interaction.options.getString(`team${i}`)
    if (n) names.push(n.trim())
  }

  const created: string[] = []
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const existing = await TournamentTeamModel.getByName(tournament.id, name)
    if (existing) { created.push(`${name}（既存）`); continue }
    await TournamentTeamModel.create({ tournament_id: tournament.id, name, team_order: i })
    created.push(name)
  }

  await updateTeamAnnouncement(interaction.guild!, tournament, regulation)
  await interaction.editReply(`✅ チームを作成しました:\n${created.map(n => `• ${n}`).join('\n')}`)
}

const TEAM_EMOJIS = ['🔵', '🔴', '🟡', '🟢', '🟠', '🟣', '⚫', '⚪']

async function buildAssignPanel(tournamentId: number): Promise<{ content: string; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const teams = await TournamentTeamModel.getByTournament(tournamentId)
  const allMembers = await TournamentTeamMemberModel.getByTournament(tournamentId)
  const assignedIds = new Set(allMembers.map(m => m.discord_id))
  const participants = await TournamentParticipantModel.getByTournament(tournamentId)
  const unassigned = participants.filter(p => !isTeamProxy(p.discord_id) && !assignedIds.has(p.discord_id))

  const membersByTeam = new Map<number, typeof allMembers>()
  for (const m of allMembers) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, [])
    membersByTeam.get(m.team_id)!.push(m)
  }

  const teamLines = teams.map((t, idx) => {
    const members = membersByTeam.get(t.id) ?? []
    const filled = members.filter(m => m.position !== null).length
    const emoji = TEAM_EMOJIS[idx % TEAM_EMOJIS.length]
    const slots = POSITION_NAMES.map((pos, i) => {
      const m = members.find(mb => mb.position === i + 1)
      return `${pos}: ${m ? m.discord_name.slice(0, 10) : '───'}`
    }).join(' ／ ')
    return `${emoji} **${t.name}** (${filled}/5)\n　　${slots}`
  })

  const footerText = unassigned.length > 0
    ? `👥 未配置: ${unassigned.length}名 — ボタンで個別配置、または下の自動振り分けをお使いください`
    : '✅ 全員配置済みです'

  const lines = [
    '**チーム振り分けパネル**',
    '',
    ...teamLines,
    '',
    footerText,
  ]

  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  // 未配置プレイヤーボタン（最大20名、5列×4行）
  for (let i = 0; i < unassigned.length && i < 20; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    for (let j = i; j < Math.min(i + 5, unassigned.length); j++) {
      const p = unassigned[j]
      const rankPart = p.rank ? ` [${p.rank}]` : ''
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-assign:${tournamentId}:${p.discord_id}`)
          .setLabel(`${p.discord_name.slice(0, 12)}${rankPart}`.slice(0, 20))
          .setStyle(ButtonStyle.Secondary)
      )
    }
    rows.push(row)
  }

  // 自動振り分けボタン行（最大5行制限を守る）
  if (rows.length < 5 && unassigned.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tnm-auto-assign:${tournamentId}:balanced`)
        .setLabel('🎯 ランクバランス')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tnm-auto-assign:${tournamentId}:random`)
        .setLabel('🎲 ランダム')
        .setStyle(ButtonStyle.Secondary),
    ))
  }

  return { content: lines.join('\n'), components: rows }
}

async function handleTeamAssign(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) { await interaction.editReply('❌ アクティブな大会が見つかりません。'); return }
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  if (!regulation.teamMode || regulation.teamEntryMode !== 'assign') {
    await interaction.editReply('❌ この大会は「振り分け」エントリー方式ではありません。'); return
  }

  const teams = await TournamentTeamModel.getByTournament(tournament.id)
  if (teams.length === 0) { await interaction.editReply('❌ 先に `/tnm team-setup` でチームを作成してください。'); return }

  const { content, components } = await buildAssignPanel(tournament.id)
  await interaction.editReply({ content, components })
}

async function handleAssignButton(interaction: ButtonInteraction, tournamentId: number, discordId: string): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral }); return true }

  // 名前を participant から引く
  const participant = await TournamentParticipantModel.getByDiscordId(tournamentId, discordId)
  const displayName = participant?.discord_name ?? discordId

  const teams = await TournamentTeamModel.getByTournament(tournamentId)

  const options: StringSelectMenuOptionBuilder[] = []
  for (const t of teams) {
    const members = await TournamentTeamMemberModel.getByTeam(t.id)
    for (let pos = 1; pos <= 5; pos++) {
      const taken = members.find(m => m.position === pos)
      if (!taken) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`${t.name} / ${POSITION_NAMES[pos - 1]}`)
          .setValue(`${t.id}:${pos}`))
      }
    }
  }

  if (options.length === 0) {
    await interaction.reply({ content: '❌ 空きポジションがありません。', flags: MessageFlags.Ephemeral })
    return true
  }

  const msgId = interaction.message.id
  const select = new StringSelectMenuBuilder()
    .setCustomId(`tnm-assign-slot:${tournamentId}:${discordId}:${msgId}`)
    .setPlaceholder('チームとポジションを選択')
    .addOptions(options.slice(0, 25))

  await interaction.reply({
    content: `**${displayName}** をどのポジションに配置しますか？`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select) as any],
    flags: MessageFlags.Ephemeral,
  })
  return true
}

async function handleAssignSlotSelect(interaction: StringSelectMenuInteraction, tournamentId: number, discordId: string, mainMsgId: string): Promise<boolean> {
  const [teamIdStr, posStr] = interaction.values[0].split(':')
  const teamId = parseInt(teamIdStr)
  const position = parseInt(posStr)

  const participant = await TournamentParticipantModel.getByDiscordId(tournamentId, discordId)
  if (!participant) { await interaction.update({ content: '❌ 参加者が見つかりません。', components: [] }); return true }

  const existing = await TournamentTeamMemberModel.getByDiscordIdInTournament(tournamentId, discordId)
  if (existing) { await interaction.update({ content: '❌ すでにチームに配置されています。', components: [] }); return true }

  await TournamentTeamMemberModel.create({
    team_id: teamId,
    discord_id: discordId,
    discord_name: participant.discord_name,
    rank: participant.rank,
    character: participant.character,
    position,
  })

  await interaction.update({ content: `✅ ${participant.discord_name} を ${POSITION_NAMES[position - 1]} に配置しました。`, components: [] })

  // メインパネルを更新
  try {
    const channel = interaction.channel
    if (channel && channel.isTextBased() && !channel.isDMBased()) {
      const mainMsg = await channel.messages.fetch(mainMsgId)
      const { content: pc, components: pc2 } = await buildAssignPanel(tournamentId)
      await mainMsg.edit({ content: pc, components: pc2 })
    }
  } catch { /* ベストエフォート */ }

  return true
}

// ─── 団体戦・個人試合ハンドラ ────────────────────────────────────────────────

async function handleBattleStart(interaction: ButtonInteraction, matchId: number): Promise<boolean> {
  const match = await TournamentMatchModel.getById(matchId)
  if (!match) { await interaction.reply({ content: '❌ 試合が見つかりません。', flags: MessageFlags.Ephemeral }); return true }

  const existingBattles = await TournamentTeamBattleModel.getByMatch(matchId)
  if (existingBattles.length > 0) {
    await interaction.reply({ content: '対戦はすでに開始されています。', flags: MessageFlags.Ephemeral })
    return true
  }

  await interaction.deferUpdate()

  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const matchData = await TournamentMatchModel.getWithParticipants(matchId)
  const p1Id = matchData?.p1_discord_id ? teamIdFromProxy(matchData.p1_discord_id) : null
  const p2Id = matchData?.p2_discord_id ? teamIdFromProxy(matchData.p2_discord_id) : null
  if (!p1Id || !p2Id) { return true }

  let battleIds: number[]
  if (regulation.teamBattleFormat === 'survival') {
    battleIds = [await TeamBattleService.generateFirstSurvivalBattle(matchId, p1Id, p2Id, regulation)]
  } else {
    battleIds = await TeamBattleService.generateSequentialBattles(matchId, p1Id, p2Id, regulation)
  }

  // 「対戦開始」ボタンを削除
  await interaction.editReply({ content: interaction.message.content, components: [] })

  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return true

  for (const bid of battleIds) {
    try {
      const { content, components } = await TeamBattleService.formatBattleContent(bid, regulation)
      const msg = await channel.send({ content, components })
      await TournamentTeamBattleModel.setMessageId(bid, msg.id)
    } catch (err) {
      console.error(`[tnm] Failed to post battle ${bid}:`, err)
    }
  }
  return true
}

async function handleBattleWin(interaction: ButtonInteraction, battleId: number, memberId: number): Promise<boolean> {
  await interaction.deferUpdate()

  const battle = await TournamentTeamBattleModel.getById(battleId)
  if (!battle || battle.status === 'completed') {
    await interaction.editReply({ content: 'この試合はすでに終了しています。' })
    return true
  }

  const match = await TournamentMatchModel.getById(battle.match_id)
  if (!match) return true
  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  const winsRequired = regulation.winsRequired

  // スコア入力ボタンを表示
  const member = await TournamentTeamMemberModel.getById(memberId)
  const loserName = battle.team1_member_id === memberId
    ? (await TournamentTeamMemberModel.getById(battle.team2_member_id!))?.discord_name
    : (await TournamentTeamMemberModel.getById(battle.team1_member_id!))?.discord_name

  const scoreRow = new ActionRowBuilder<ButtonBuilder>()
  for (let g = 0; g < winsRequired; g++) {
    scoreRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`tnm-battle-score:${battleId}:${memberId}:${g}`)
        .setLabel(`${g}ゲーム`)
        .setStyle(ButtonStyle.Secondary)
    )
  }
  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tnm-battle-cancel:${battleId}`)
      .setLabel('❌ キャンセル')
      .setStyle(ButtonStyle.Danger),
  )
  await interaction.editReply({
    content: `${interaction.message.content}\n\n**${member?.discord_name}** の勝利が報告されました。\n**${loserName ?? '相手'}** は何ゲーム取りましたか？`,
    components: [scoreRow, cancelRow],
  })
  return true
}

async function handleBattleScore(interaction: ButtonInteraction, battleId: number, winnerId: number, loserGames: number): Promise<boolean> {
  await interaction.deferUpdate()

  const battle = await TournamentTeamBattleModel.getById(battleId)
  if (!battle || battle.status === 'completed') {
    await interaction.editReply({ content: 'この試合はすでに終了しています。' })
    return true
  }

  const match = await TournamentMatchModel.getById(battle.match_id)
  if (!match) return true
  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const winnerMember = await TournamentTeamMemberModel.getById(winnerId)
  if (!winnerMember) return true

  const isT1Winner = battle.team1_member_id === winnerId
  const t1Games = isT1Winner ? regulation.winsRequired : loserGames
  const t2Games = isT1Winner ? loserGames : regulation.winsRequired

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tnm-battle-confirm:${battleId}:${winnerId}:${t1Games}:${t2Games}`)
      .setLabel('✅ 結果を送信')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`tnm-battle-cancel:${battleId}`)
      .setLabel('❌ キャンセル')
      .setStyle(ButtonStyle.Danger),
  )

  const baseContent = interaction.message.content.split('\n\n')[0]
  await interaction.editReply({
    content: `${baseContent}\n\n⚠️ **${winnerMember.discord_name}** の勝利 (${t1Games}-${t2Games}) で確定しますか？`,
    components: [confirmRow],
  })
  return true
}

async function handleBattleConfirmButton(
  interaction: ButtonInteraction,
  battleId: number,
  winnerId: number,
  t1Games: number,
  t2Games: number
): Promise<boolean> {
  await interaction.deferUpdate()

  const battle = await TournamentTeamBattleModel.getById(battleId)
  if (!battle || battle.status === 'completed') {
    await interaction.editReply({ content: 'この試合はすでに終了しています。' })
    return true
  }

  const match = await TournamentMatchModel.getById(battle.match_id)
  if (!match) return true
  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const winnerMember = await TournamentTeamMemberModel.getById(winnerId)
  if (!winnerMember) return true

  const isT1Winner = battle.team1_member_id === winnerId
  const matchData = await TournamentMatchModel.getWithParticipants(battle.match_id)
  const team1Id = matchData?.p1_discord_id ? teamIdFromProxy(matchData.p1_discord_id) : null
  const team2Id = matchData?.p2_discord_id ? teamIdFromProxy(matchData.p2_discord_id) : null
  const winnerTeamId = isT1Winner ? team1Id : team2Id
  if (!winnerTeamId || !team1Id || !team2Id) return true

  const battleRecorded = await TournamentTeamBattleModel.setWinner(battleId, winnerId, winnerTeamId, t1Games, t2Games)
  if (!battleRecorded) {
    await interaction.editReply({ content: 'この試合の結果はすでに記録されています。' })
    return true
  }

  const correctRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tnm-battle-correct:${battleId}`)
      .setLabel('🖊️ 結果を修正')
      .setStyle(ButtonStyle.Secondary),
  )
  const baseContent = interaction.message.content.split('\n\n')[0]
  await interaction.editReply({
    content: `${baseContent}\n\n✅ **${winnerMember.discord_name}** の勝利 (${t1Games}-${t2Games})`,
    components: [correctRow],
  })

  const channel = interaction.channel
  const isText = channel && channel.isTextBased() && !channel.isDMBased()

  const isSurvival = regulation.teamBattleFormat === 'survival'
  let matchWinnerTeamId: number | null = null

  if (isSurvival) {
    const nextBattleId = await TeamBattleService.generateNextSurvivalBattle(battle.match_id, team1Id, team2Id, battle, regulation)
    if (nextBattleId === null) {
      matchWinnerTeamId = await TeamBattleService.resolveSurvivalMatch(battle.match_id, team1Id, team2Id)
    } else if (isText) {
      try {
        const { content: nc, components: rc } = await TeamBattleService.formatBattleContent(nextBattleId, regulation)
        const msg = await channel.send({ content: nc, components: rc })
        await TournamentTeamBattleModel.setMessageId(nextBattleId, msg.id)
      } catch (err) {
        console.error('[tnm] Failed to post next survival battle:', err)
      }
    }
  } else {
    matchWinnerTeamId = await TeamBattleService.resolveSequentialMatch(battle.match_id, team1Id, team2Id)
  }

  if (matchWinnerTeamId === null) return true

  const winnerTeam = await TournamentTeamModel.getById(matchWinnerTeamId)
  const summary = await TeamBattleService.formatMatchSummary(battle.match_id, team1Id, team2Id)

  if (match.message_id && isText) {
    try {
      const matchMsg = await channel.messages.fetch(match.message_id)
      await matchMsg.edit({ content: matchMsg.content + `\n\n🏆 **${winnerTeam?.name}** の勝利！${summary}`, components: [] })
    } catch { /* ベストエフォート */ }
  }

  const winnerProxyDiscordId = proxyDiscordId(matchWinnerTeamId)
  const winnerProxy = await TournamentParticipantModel.getByDiscordId(match.tournament_id, winnerProxyDiscordId)
  if (!winnerProxy) return true

  if (tournament.format === 'single_elim') {
    const result = await BracketService.advanceWinner(battle.match_id, winnerProxy.id, regulation)
    if (result.isChampion && isText && channel) {
      await channel.send(`🏆 **${tournament.name}** 終了！\n優勝: **${winnerTeam?.name}** ！おめでとうございます！`)
    } else if (result.nextMatchId && result.nextMatchReady && isText && channel) {
      try {
        const { content: nc, components: rc } = await TeamBattleService.formatTeamMatchContent(result.nextMatchId, regulation)
        const msg = await channel.send({ content: nc, components: rc })
        await TournamentMatchModel.setMessageId(result.nextMatchId, msg.id)
      } catch (err) { console.error('[tnm] Failed to post next team match:', err) }
    }
  } else if (tournament.format === 'league') {
    const battles = await TournamentTeamBattleModel.getByMatch(battle.match_id)
    let t1TotalGames = 0, t2TotalGames = 0
    for (const b of battles) {
      if (b.status === 'completed') {
        const m1 = b.team1_member_id ? await TournamentTeamMemberModel.getById(b.team1_member_id) : null
        if (m1?.team_id === team1Id) { t1TotalGames += b.team1_games_won; t2TotalGames += b.team2_games_won }
        else { t1TotalGames += b.team2_games_won; t2TotalGames += b.team1_games_won }
      }
    }
    await TournamentMatchModel.setScore(battle.match_id, winnerProxy.id, t1TotalGames, t2TotalGames)
    const allDone = await LeagueService.checkAllComplete(tournament.id)
    if (allDone) {
      await TournamentModel.setStatus(tournament.id, 'completed')
      if (isText && channel) await channel.send(`🏆 **${tournament.name}** 全試合終了！\n優勝チーム: **${winnerTeam?.name}** ！おめでとうございます！`)
    }
  } else if (tournament.format === 'swiss') {
    const allBattles = await TournamentTeamBattleModel.getByMatch(battle.match_id)
    let t1TG = 0, t2TG = 0
    for (const b of allBattles) {
      if (b.status === 'completed') {
        const m1 = b.team1_member_id ? await TournamentTeamMemberModel.getById(b.team1_member_id) : null
        if (m1?.team_id === team1Id) { t1TG += b.team1_games_won; t2TG += b.team2_games_won }
        else { t1TG += b.team2_games_won; t2TG += b.team1_games_won }
      }
    }
    await TournamentMatchModel.setScore(battle.match_id, winnerProxy.id, t1TG, t2TG)
    const currentRound = match.round
    const roundDone = await SwissService.isRoundComplete(tournament.id, currentRound)
    if (!roundDone) return true
    const totalRounds = regulation.totalRounds ?? 4
    if (currentRound >= totalRounds) {
      await TournamentModel.setStatus(tournament.id, 'completed')
      if (isText && channel) {
        const embed = await SwissService.formatSwissEmbed(tournament.id)
        await channel.send({ content: `🏆 **${tournament.name}** 全ラウンド終了！\n優勝チーム: **${winnerTeam?.name}**！`, embeds: [embed] })
      }
    } else {
      const nextRound = currentRound + 1
      const allMatches = await TournamentMatchModel.getByTournament(tournament.id)
      const proxyParticipants = await TournamentParticipantModel.getByTournament(tournament.id)
        .then(ps => ps.filter(p => isTeamProxy(p.discord_id)))
      const nextMatchIds = await SwissService.generateRound(tournament.id, nextRound, proxyParticipants, regulation, allMatches)
      if (isText && channel) {
        await channel.send(`━━━━━━━━━━━━━━━━━━━━━━\n**Round ${nextRound} / ${totalRounds} 開始！**`)
        for (const mid of nextMatchIds) {
          try {
            const { content: nc, components: rc } = await TeamBattleService.formatTeamMatchContent(mid, regulation)
            const msg = await channel.send({ content: nc, components: rc })
            await TournamentMatchModel.setMessageId(mid, msg.id)
          } catch { /* ベストエフォート */ }
        }
      }
    }
  }

  return true
}

async function handleBattleCorrectButton(interaction: ButtonInteraction, battleId: number): Promise<boolean> {
  const battle = await TournamentTeamBattleModel.getById(battleId)
  if (!battle || battle.status !== 'completed') {
    await interaction.reply({ content: '修正できる完了済み対戦がありません。', flags: MessageFlags.Ephemeral })
    return true
  }
  await TournamentTeamBattleModel.resetBattle(battleId)
  await interaction.deferUpdate()
  const match = await TournamentMatchModel.getById(battle.match_id)
  if (!match) return true
  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  const { content, components } = await TeamBattleService.formatBattleContent(battleId, regulation)
  await interaction.editReply({ content, components })
  return true
}

async function handleBattleCancelButton(interaction: ButtonInteraction, battleId: number): Promise<boolean> {
  const battle = await TournamentTeamBattleModel.getById(battleId)
  if (!battle) { await interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral }); return true }
  await interaction.deferUpdate()
  const match = await TournamentMatchModel.getById(battle.match_id)
  if (!match) return true
  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  const { content, components } = await TeamBattleService.formatBattleContent(battleId, regulation)
  await interaction.editReply({ content, components })
  return true
}

// ─── 自動振り分け ──────────────────────────────────────────────────────────────

async function handleAutoAssign(
  interaction: ButtonInteraction,
  tournamentId: number,
  mode: 'balanced' | 'random'
): Promise<boolean> {
  await interaction.deferUpdate()

  const teams = await TournamentTeamModel.getByTournament(tournamentId)
  const allMembers = await TournamentTeamMemberModel.getByTournament(tournamentId)
  const assignedIds = new Set(allMembers.map(m => m.discord_id))
  const participants = await TournamentParticipantModel.getByTournament(tournamentId)
  let unassigned = participants.filter(p => !isTeamProxy(p.discord_id) && !assignedIds.has(p.discord_id))

  if (unassigned.length === 0) {
    await interaction.followUp({ content: '未配置の参加者がいません。', flags: MessageFlags.Ephemeral })
    return true
  }

  if (mode === 'balanced') {
    // ランク順（強い順）でソート
    unassigned = [...unassigned].sort((a, b) => {
      const ai = RANKS.indexOf(a.rank as any)
      const bi = RANKS.indexOf(b.rank as any)
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi)
    })
  } else {
    // シャッフル
    for (let i = unassigned.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[unassigned[i], unassigned[j]] = [unassigned[j], unassigned[i]]
    }
  }

  // チームごとの現在占有ポジションを把握
  const occupiedByTeam = new Map<number, Set<number>>()
  for (const t of teams) {
    const members = await TournamentTeamMemberModel.getByTeam(t.id)
    occupiedByTeam.set(t.id, new Set(members.map(m => m.position).filter(Boolean) as number[]))
  }

  // スネークドラフトで割り当てスロット生成
  const slots: { teamId: number; position: number }[] = []
  let ascending = true
  while (slots.length < unassigned.length) {
    const order = ascending ? [...teams] : [...teams].reverse()
    let added = false
    for (const t of order) {
      const occ = occupiedByTeam.get(t.id)!
      for (let pos = 1; pos <= 5; pos++) {
        if (!occ.has(pos)) {
          slots.push({ teamId: t.id, position: pos })
          occ.add(pos)
          added = true
          break
        }
      }
      if (slots.length >= unassigned.length) break
    }
    if (!added) break  // 全チーム満員
    ascending = !ascending
  }

  // 実際に割り当て
  const assigned: string[] = []
  for (let i = 0; i < Math.min(unassigned.length, slots.length); i++) {
    const p = unassigned[i]
    const slot = slots[i]
    const team = teams.find(t => t.id === slot.teamId)
    await TournamentTeamMemberModel.create({
      team_id: slot.teamId,
      discord_id: p.discord_id,
      discord_name: p.discord_name,
      rank: p.rank,
      character: p.character,
      position: slot.position,
    })
    assigned.push(`${p.discord_name}${p.rank ? ` [${p.rank}]` : ''} → **${team?.name}** ${POSITION_NAMES[slot.position - 1]}`)
  }

  // パネルを更新
  const { content, components } = await buildAssignPanel(tournamentId)
  await interaction.editReply({ content, components })

  const modeLabel = mode === 'balanced' ? 'ランクバランス' : '完全ランダム'
  await interaction.followUp({
    content: `✅ **${modeLabel}**で${assigned.length}名を振り分けました:\n${assigned.map(s => `• ${s}`).join('\n')}`,
    flags: MessageFlags.Ephemeral,
  })

  return true
}
