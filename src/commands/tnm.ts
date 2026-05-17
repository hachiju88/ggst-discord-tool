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
            { name: 'リーグ戦（総当たり）', value: 'league' }
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
}

// ─── Subcommand handlers ──────────────────────────────────────────────────────

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const format = interaction.options.getString('format') ?? 'single_elim'
  const formatLabel = format === 'league' ? 'リーグ戦' : 'シングルエリミネーション'

  const modal = new ModalBuilder()
    .setCustomId(`tnm-create:modal:${format}`)
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
  if (tournament.status !== 'registration') {
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
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.reply({
      content: 'アクティブな大会が見つかりません。',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const embed = tournament.format === 'league'
    ? await LeagueService.formatLeagueEmbed(tournament.id)
    : await BracketService.formatBracketEmbed(tournament.id)
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.reply({
      content: 'アクティブな大会が見つかりません。',
      flags: MessageFlags.Ephemeral,
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

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
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

  await TournamentModel.setStatus(tournament.id, 'in_progress')
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
              const { content, components } = await BracketService.formatMatchContent(nextMatch.id, regulation)
              await msg.edit({ content, components })
            }
          } else if (finalized) {
            // 修正をきっかけに次の試合が両方の参加者揃った → 新規投稿
            const { content, components } = await BracketService.formatMatchContent(nextMatch.id, regulation)
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
  if (!interaction.customId.startsWith('tnm-create:modal')) return false
  const format = interaction.customId.split(':')[2] ?? 'single_elim'

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

  const regulation: TournamentRegulation = { winsRequired, roundsRequired, handicapRules }

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
  const formatLabel = format === 'league' ? 'リーグ戦（総当たり）' : 'シングルエリミネーション'
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

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`🏆 ${name}`)
    .setDescription('参加したい方は「参加する」ボタンを押してください。')
    .addFields({ name: 'レギュレーション', value: regLines.join('\n') })
    .setFooter({ text: '参加受付中' })
    .setTimestamp()

  const joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

  if (prefix === 'tnm-league-score') {
    const matchId = parseInt(parts[1])
    const winnerId = parseInt(parts[2])
    const loserGames = parseInt(parts[3])
    return handleLeagueScoreButton(interaction, matchId, winnerId, loserGames)
  }

  if (prefix === 'tnm-edit') {
    const tournamentId = parseInt(parts[1])
    return handleEditButton(interaction, tournamentId)
  }

  if (prefix === 'tnm-leave-btn') {
    const tournamentId = parseInt(parts[1])
    return handleLeaveBtnButton(interaction, tournamentId)
  }

  return false
}

async function handleLeagueScoreButton(
  interaction: ButtonInteraction,
  matchId: number,
  winnerId: number,
  loserGames: number
): Promise<boolean> {
  const match = await TournamentMatchModel.getById(matchId)
  if (!match || match.status === 'completed') {
    await interaction.reply({ content: 'この試合はすでに終了しています。', flags: MessageFlags.Ephemeral })
    return true
  }

  await interaction.deferUpdate()

  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const p1IsWinner = Number(match.participant1_id) === winnerId
  const p1Games = p1IsWinner ? regulation.winsRequired : loserGames
  const p2Games = p1IsWinner ? loserGames : regulation.winsRequired

  await TournamentMatchModel.setScore(matchId, winnerId, p1Games, p2Games)

  const matchData = await TournamentMatchModel.getWithParticipants(matchId)
  const winnerName = p1IsWinner ? matchData?.p1_name : matchData?.p2_name

  // Edit match message to show final score
  const baseContent = interaction.message.content.split('\n\n')[0]
  await interaction.editReply({
    content: `${baseContent}\n\n✅ **${winnerName}** の勝利 (${p1Games}-${p2Games})`,
    components: [],
  })

  // Check if all league matches complete
  const allDone = await LeagueService.checkAllComplete(tournament.id)
  if (allDone) {
    await TournamentModel.setStatus(tournament.id, 'completed')
    const standings = await LeagueService.getStandings(tournament.id)
    const champion = standings[0]?.participant
    const channel = interaction.channel
    if (channel && channel.isTextBased() && !channel.isDMBased() && champion) {
      await channel.send(
        `🏆 **${tournament.name}** 全試合終了！\n優勝: <@${champion.discord_id}> **${champion.discord_name}** さん！おめでとうございます！`
      )
    }
  }

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
  const match = await TournamentMatchModel.getById(matchId)
  if (!match) {
    await interaction.reply({ content: '試合が見つかりません。', flags: MessageFlags.Ephemeral })
    return true
  }
  if (match.status === 'completed') {
    await interaction.reply({
      content: 'この試合はすでに終了しています。',
      flags: MessageFlags.Ephemeral,
    })
    return true
  }

  // Defer immediately so multi-step DB work doesn't exceed Discord's 3s interaction window
  await interaction.deferUpdate()

  const tournament = await TournamentModel.getById(match.tournament_id)
  if (!tournament) return true
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  const matchData = await TournamentMatchModel.getWithParticipants(matchId)
  const p1IdNum = matchData?.participant1_id != null ? Number(matchData.participant1_id) : null
  const loserName = p1IdNum === participantId ? matchData?.p2_name : matchData?.p1_name
  const winnerName = p1IdNum === participantId ? matchData?.p1_name : matchData?.p2_name
  const winnerLabel = winnerName ?? `参加者#${participantId}`

  // League format: show loser game count input before recording
  if (tournament.format === 'league') {
    const winsRequired = regulation.winsRequired
    const scoreRow = new ActionRowBuilder<ButtonBuilder>()
    for (let g = 0; g < winsRequired; g++) {
      scoreRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-league-score:${matchId}:${participantId}:${g}`)
          .setLabel(`${g}ゲーム`)
          .setStyle(ButtonStyle.Secondary)
      )
    }
    await interaction.editReply({
      content: `${interaction.message.content}\n\n**${winnerLabel}** の勝利が報告されました。\n**${loserName ?? '相手'}** は何ゲーム取りましたか？`,
      components: [scoreRow],
    })
    return true
  }

  // single_elim: record winner immediately and advance bracket
  const result = await BracketService.advanceWinner(matchId, participantId, regulation)

  await interaction.editReply({
    content: `${interaction.message.content}\n\n✅ **${winnerLabel}** の勝利が報告されました。`,
    components: [],
  })

  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return true

  if (result.isChampion) {
    const winner = await TournamentParticipantModel.getById(participantId)
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

  const member = interaction.member as GuildMember | null
  const displayName = member?.displayName ?? interaction.user.displayName ?? interaction.user.username

  await TournamentParticipantModel.create({
    tournament_id: tournamentId,
    discord_id: interaction.user.id,
    discord_name: displayName,
    rank,
    character,
  })

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
    case 'in_progress': return '進行中'
    case 'completed': return '終了'
    default: return status
  }
}
