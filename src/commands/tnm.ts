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
  ChannelSelectMenuBuilder,
  ChannelType,
  ThreadAutoArchiveDuration,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
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
import { BracketImageService } from '../services/BracketImageService'

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
  .addSubcommand(s => s.setName('view').setDescription('現在の大会状況を表示します（主催者には管理パネルも表示）'))
  .addSubcommand(s => s.setName('list').setDescription('このサーバーの大会一覧を表示します'))

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand()

  if (sub === 'create') return handleCreate(interaction)
  if (sub === 'view') return handleView(interaction)
  if (sub === 'list') return handleList(interaction)
}


export async function handleChannelSelectMenu(interaction: ChannelSelectMenuInteraction): Promise<void> {
  if (interaction.customId.startsWith('tnm-vc-setup')) {
    await handleVcSetupSelect(interaction)
  }
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

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(maxInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(winsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(roundsInput),
  )

  await interaction.showModal(modal)
}

// (handleStart moved to handleAdminStart — triggered via admin panel button)

async function handleView(interaction: ChatInputCommandInteraction) {
  const tournament = await TournamentModel.getLatestActive(interaction.guildId!)
  if (!tournament) {
    await interaction.reply({ content: 'アクティブな大会が見つかりません。`/tnm create` で作成してください。', flags: MessageFlags.Ephemeral })
    return
  }

  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  // 大会開始後や完了後はみんなに見えるように公開、それ以外はエフェメラル
  const showPublic = tournament.status === 'in_progress' || tournament.status === 'completed'
  await interaction.deferReply(showPublic ? {} : { flags: MessageFlags.Ephemeral })

  if (tournament.status === 'in_progress' || tournament.status === 'completed') {
    if (tournament.format === 'single_elim' && !regulation.teamMode) {
      try {
        const { attachment, embed } = await BracketImageService.formatBracketAsAttachment(tournament.id)
        await interaction.editReply({ embeds: [embed], files: [attachment] })
      } catch {
        await interaction.editReply({ embeds: [await BracketService.formatBracketEmbed(tournament.id)] })
      }
    } else if (tournament.format === 'league') {
      await interaction.editReply({ embeds: [await LeagueService.formatLeagueEmbed(tournament.id)] })
    } else if (tournament.format === 'swiss') {
      await interaction.editReply({ embeds: [await SwissService.formatSwissEmbed(tournament.id)] })
    } else {
      await interaction.editReply({ embeds: [await BracketService.formatBracketEmbed(tournament.id)] })
    }
  } else {
    const participants = await TournamentParticipantModel.getByTournament(tournament.id)
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋 ${tournament.name} — 参加者一覧`)
      .setDescription(participants.length > 0
        ? participants.map((p, i) =>
            `${i + 1}. <@${p.discord_id}> ${p.rank ? `[${p.rank}]` : ''}${p.character ? ` (${p.character})` : ''}`
          ).join('\n')
        : 'まだ参加者がいません。')
      .setFooter({ text: `${participants.length} 名 | ${statusLabel(tournament.status)}` })
      .setTimestamp()
    await interaction.editReply({ embeds: [embed] })
  }

  const member = interaction.member as GuildMember | null
  const isAdmin = interaction.user.id === tournament.created_by ||
    member?.permissions.has('ManageGuild')
  if (!isAdmin) return

  const adminRows = buildAdminPanelRows(tournament, regulation)
  await interaction.followUp({
    content: `**管理パネル — ${tournament.name}**`,
    components: adminRows,
    flags: MessageFlags.Ephemeral,
  })
}

function buildAdminPanelRows(tournament: { id: number; status: string; name: string }, regulation: TournamentRegulation): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  const id = tournament.id

  if (tournament.status === 'registration') {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tnm-admin-start:${id}`).setLabel('▶ 大会スタート').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tnm-admin-close:${id}`).setLabel('🔒 受付終了').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tnm-admin-enter:${id}`).setLabel('👤+ 代理エントリー').setStyle(ButtonStyle.Primary),
    ))
  } else if (tournament.status === 'closed') {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tnm-admin-start:${id}`).setLabel('▶ 大会スタート').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tnm-admin-reopen:${id}`).setLabel('🔓 受付を再開').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tnm-admin-enter:${id}`).setLabel('👤+ 代理エントリー').setStyle(ButtonStyle.Primary),
    ))
  }

  if ((tournament.status === 'registration' || tournament.status === 'closed') && regulation.teamMode) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tnm-admin-team-setup:${id}`).setLabel('👥 チーム設定').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tnm-admin-assign:${id}`).setLabel('🎲 振り分け').setStyle(ButtonStyle.Primary),
    ))
  }

  if (tournament.status === 'in_progress') {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tnm-admin-fix:${id}`).setLabel('✏️ 結果修正').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tnm-admin-enter:${id}`).setLabel('👤+ 代理エントリー').setStyle(ButtonStyle.Primary),
    ))
  }

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tnm-admin-delete:${id}`).setLabel('🗑 大会削除').setStyle(ButtonStyle.Danger),
  ))

  return rows
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

// (handleClose / handleLeave / handleFix / handleDelete moved to admin panel button handlers)

// ─── Modal submit ─────────────────────────────────────────────────────────────

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId.startsWith('tnm-combined-modal:')) return handleCombinedModal(interaction)
  if (interaction.customId.startsWith('tnm-handicap-custom-modal:')) {
    return handleHandicapCustomModal(interaction, parseInt(interaction.customId.split(':')[1]))
  }
  if (interaction.customId.startsWith('tnm-char-modal:')) return handleCharModal(interaction)
  if (interaction.customId.startsWith('tnm-admin-fix-modal:')) return handleAdminFixModal(interaction, parseInt(interaction.customId.split(':')[1]))
  if (interaction.customId.startsWith('tnm-admin-enter-modal:')) return handleAdminEnterModal(interaction, parseInt(interaction.customId.split(':')[1]))
  if (interaction.customId.startsWith('tnm-admin-team-setup-modal:')) return handleAdminTeamSetupModal(interaction, parseInt(interaction.customId.split(':')[1]))
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

  const handicapRules: HandicapRule[] = []

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

  // Ephemeral VC setup prompt
  await interaction.followUp({
    content: '✅ 大会を作成しました！\n\n**VCチャンネルの設定**（任意）\n対戦で使用するVCチャンネルを選択してください。未設定の場合は「🟦 GGST - ラウンジ #1」がデフォルトになります。',
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`tnm-vc-setup:${tournament.id}`)
          .setPlaceholder('VCチャンネルを選択（複数可）')
          .addChannelTypes(ChannelType.GuildVoice)
          .setMinValues(0)
          .setMaxValues(10)
      )
    ],
    flags: MessageFlags.Ephemeral,
  })

  await interaction.followUp({
    content: '**ハンデルールの設定**（任意）\nランク差に応じたラウンド落とし設定です。',
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`tnm-handicap-preset:${tournament.id}`)
          .setPlaceholder('ハンデルールを選択')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('なし（ハンデなし）').setValue('none'),
            new StringSelectMenuOptionBuilder().setLabel('ランク差3以上: 1R落とし').setValue('3:1'),
            new StringSelectMenuOptionBuilder().setLabel('ランク差5以上: 1R落とし').setValue('5:1'),
            new StringSelectMenuOptionBuilder().setLabel('ランク差3: 1R / 7以上: 2R落とし').setValue('3:1,7:2'),
            new StringSelectMenuOptionBuilder().setLabel('カスタム設定（テキスト入力）').setValue('custom'),
          )
      )
    ],
    flags: MessageFlags.Ephemeral,
  })

  const adminRows = buildAdminPanelRows(tournament, regulation)
  await interaction.followUp({
    content: `**管理パネル — ${tournament.name}**\nVCとハンデを設定したら「▶ 大会スタート」で開始できます。`,
    components: adminRows,
    flags: MessageFlags.Ephemeral,
  })

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
  if (prefix === 'tnm-team-set-info') {
    const tId = parseInt(parts[1])
    const tmId = parseInt(parts[2])
    await showCombinedModal(interaction, `team:${tId}:${tmId}`)
    return true
  }
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

  if (prefix === 'tnm-admin-start')         return handleAdminStart(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-close')         return handleAdminClose(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-reopen')        return handleAdminReopen(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-delete')        return handleAdminDelete(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-delete-confirm') return handleAdminDeleteConfirm(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-delete-cancel') return handleAdminDeleteCancel(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-fix')           return handleAdminFix(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-enter')         return handleAdminEnter(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-team-setup')    return handleAdminTeamSetup(interaction, parseInt(parts[1]))
  if (prefix === 'tnm-admin-assign')        return handleAdminAssign(interaction, parseInt(parts[1]))

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
  const currentInfo = `現在: ランク **${existing.rank ?? '未指定'}** / キャラ **${existing.character ?? '未指定'}**`
  await interaction.reply({
    content: `${currentInfo}\n\n新しいランクを選択してください。`,
    components: [buildRankSelectRow(`tnm-rank-select:edit:${tournamentId}`, existing.rank)],
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
    await interaction.reply({ content: '参加受付は終了しています。', flags: MessageFlags.Ephemeral })
    return true
  }
  if (tournament.max_participants) {
    const count = await TournamentParticipantModel.count(tournamentId)
    if (count >= tournament.max_participants) {
      await interaction.reply({ content: `❌ 定員（${tournament.max_participants}名）に達しています。`, flags: MessageFlags.Ephemeral })
      return true
    }
  }
  const existing = await TournamentParticipantModel.getByDiscordId(tournamentId, interaction.user.id)
  if (existing) {
    await interaction.reply({ content: `すでに参加登録済みです（ランク: ${existing.rank ?? 'なし'}）。`, flags: MessageFlags.Ephemeral })
    return true
  }
  await interaction.reply({
    content: 'ランクを選択してください。',
    components: [buildRankSelectRow(`tnm-rank-select:join:${tournamentId}`)],
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
  if (parts[0] === 'tnm-handicap-preset') return handleHandicapPreset(interaction, parseInt(parts[1]))
  if (parts[0] === 'tnm-rank-select')  return handleRankSelect(interaction, parts[1], parseInt(parts[2]))
  if (parts[0] === 'tnm-team-select')  return handleTeamSelectMenu(interaction, parseInt(parts[1]))
  if (parts[0] === 'tnm-assign-slot')  return handleAssignSlotSelect(interaction, parseInt(parts[1]), parts[2], parts[3])
  return false
}


// (handleEnter moved to handleAdminEnter — triggered via admin panel button)

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

  // ランク・キャラ設定ボタンを提示
  await interaction.followUp({
    content: 'ランク・キャラクターを設定してください。',
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-team-set-info:${tournamentId}:${team.id}`)
          .setLabel('ランク・キャラを設定 🎮')
          .setStyle(ButtonStyle.Primary)
      )
    ],
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

  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  await updateTeamAnnouncement(interaction.guild!, tournament, regulation)

  await showCombinedModal(interaction, `team:${tournamentId}:${teamId}`)
  return true
}

async function handleTeamSelectMenu(interaction: StringSelectMenuInteraction, tournamentId: number): Promise<boolean> {
  const teamId = parseInt(interaction.values[0])
  return handleTeamJoinButton(interaction as any, tournamentId, teamId)
}

// ─── /tnm team-setup / team-assign ──────────────────────────────────────────

// (handleTeamSetup moved to handleAdminTeamSetup — triggered via admin panel button)

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

// (handleTeamAssign moved to handleAdminAssign — triggered via admin panel button)

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

// ─── Admin panel button / modal handlers ─────────────────────────────────────

async function checkAdminPermission(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  tournament: { created_by: string }
): Promise<boolean> {
  const member = interaction.member as GuildMember | null
  return interaction.user.id === tournament.created_by || (member?.permissions.has('ManageGuild') ?? false)
}

async function handleAdminStart(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply('❌ 大会が見つかりません。'); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply('❌ この操作は大会主催者またはサーバー管理者のみ実行できます。'); return true
  }
  if (tournament.status !== 'registration' && tournament.status !== 'closed') {
    await interaction.editReply(`大会 **${tournament.name}** はすでに開始済みです。`); return true
  }

  const participants = await TournamentParticipantModel.getByTournament(tournament.id)
  if (participants.length < 2) {
    await interaction.editReply('参加者が2人以上いないと大会を開始できません。'); return true
  }

  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    await interaction.editReply('❌ テキストチャンネルで実行してください。'); return true
  }

  if (regulation.teamMode) {
    const teams = await TournamentTeamModel.getByTournament(tournament.id)
    if (teams.length < 2) { await interaction.editReply('❌ チームが2つ以上必要です。'); return true }

    const proxyParticipants: TournamentParticipant[] = []
    for (const team of teams) {
      const did = proxyDiscordId(team.id)
      let proxy = await TournamentParticipantModel.getByDiscordId(tournament.id, did)
      if (!proxy) {
        proxy = await TournamentParticipantModel.create({
          tournament_id: tournament.id, discord_id: did, discord_name: team.name, rank: null, character: null,
        })
      }
      proxyParticipants.push(proxy)
    }

    let matchIds: number[] = []
    if (tournament.format === 'swiss') {
      const totalRounds = regulation.totalRounds
      if (!totalRounds) { await interaction.editReply('❌ スイスドローの総ラウンド数が設定されていません。'); return true }
      matchIds = await SwissService.generateRound(tournament.id, 1, proxyParticipants, regulation, [])
    } else if (tournament.format === 'league') {
      matchIds = await LeagueService.generateLeague(tournament.id, proxyParticipants, regulation)
    } else {
      matchIds = await BracketService.generateBracket(tournament.id, proxyParticipants, regulation, [])
    }
    await TournamentModel.setStatus(tournament.id, 'in_progress')

    let teamMatchTarget: any = channel
    try {
      const tp = await channel.send({ content: `━━━━━━━━━━━━━━━━━━━━━━\n🏆 **${tournament.name}** — 試合はこのスレッドで行います` })
      teamMatchTarget = await (tp as any).startThread({ name: `${tournament.name} 試合`.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays })
    } catch { /* fallback */ }

    for (const matchId of matchIds) {
      try {
        const { content, components } = await TeamBattleService.formatTeamMatchContent(matchId, regulation)
        const msg = await teamMatchTarget.send({ content, components })
        await TournamentMatchModel.setMessageId(matchId, msg.id)
      } catch (err) { console.error(`[tnm] Failed to post team match ${matchId}:`, err) }
    }

    const bracketEmbed = tournament.format === 'swiss'
      ? await SwissService.formatSwissEmbed(tournament.id)
      : tournament.format === 'league'
      ? await LeagueService.formatLeagueEmbed(tournament.id)
      : await BracketService.formatBracketEmbed(tournament.id)
    await channel.send({ embeds: [bracketEmbed] })
    await setAnnouncementButtonsDisabled(interaction.guild, tournament, true, '大会開始済み — 受付終了')
    await interaction.editReply('✅ 大会を開始しました！')
    return true
  }

  if (tournament.format === 'swiss') {
    const totalRounds = regulation.totalRounds
    if (!totalRounds) { await interaction.editReply('❌ スイスドローの総ラウンド数が設定されていません。大会を作り直してください。'); return true }
    const matchIds = await SwissService.generateRound(tournament.id, 1, participants, regulation, [])
    await TournamentModel.setStatus(tournament.id, 'in_progress')
    await channel.send({ embeds: [await SwissService.formatSwissEmbed(tournament.id)] })

    let swissMatchTarget: any = channel
    try {
      const tp = await channel.send({ content: `━━━━━━━━━━━━━━━━━━━━━━\n🏆 **${tournament.name}** — 試合はこのスレッドで行います` })
      swissMatchTarget = await (tp as any).startThread({ name: `${tournament.name} 試合`.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays })
    } catch { /* fallback */ }

    for (const matchId of matchIds) {
      try {
        const { content, components } = await SwissService.formatMatchContent(matchId, regulation, 1, totalRounds)
        const msg = await swissMatchTarget.send({ content, components })
        await TournamentMatchModel.setMessageId(matchId, msg.id)
      } catch (err) { console.error(`[tnm] Failed to post swiss match ${matchId}:`, err) }
    }
    await setAnnouncementButtonsDisabled(interaction.guild, tournament, true, '大会開始済み — 受付終了')
    await interaction.editReply('✅ 大会を開始しました！')
    return true
  }

  if (tournament.format === 'league') {
    const matchIds = await LeagueService.generateLeague(tournament.id, participants, regulation)
    await TournamentModel.setStatus(tournament.id, 'in_progress')
    await channel.send({ embeds: [await LeagueService.formatLeagueEmbed(tournament.id)] })

    let leagueMatchTarget: any = channel
    try {
      const tp = await channel.send({ content: `━━━━━━━━━━━━━━━━━━━━━━\n🏆 **${tournament.name}** — 試合はこのスレッドで行います` })
      leagueMatchTarget = await (tp as any).startThread({ name: `${tournament.name} 試合`.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays })
    } catch { /* fallback */ }

    for (const matchId of matchIds) {
      try {
        const { content, components } = await LeagueService.formatMatchContent(matchId, regulation)
        const msg = await leagueMatchTarget.send({ content, components })
        await TournamentMatchModel.setMessageId(matchId, msg.id)
      } catch (err) { console.error(`[tnm] Failed to post league match ${matchId}:`, err) }
    }
    await setAnnouncementButtonsDisabled(interaction.guild, tournament, true, '大会開始済み — 受付終了')
    await interaction.editReply('✅ 大会を開始しました！')
    return true
  }

  // single_elim
  const guild = interaction.guild!
  let voiceChannels: string[] = regulation.vcChannelIds ?? []
  if (voiceChannels.length === 0) {
    const defaultVC = guild.channels.cache.find(
      c => c.type === ChannelType.GuildVoice && c.name === '🟦 GGST - ラウンジ #1'
    ) ?? guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0)).first()
    if (defaultVC) voiceChannels = [defaultVC.id]
  }

  const playableMatchIds = await BracketService.generateBracket(tournament.id, participants, regulation, voiceChannels)
  await TournamentModel.setStatus(tournament.id, 'in_progress')

  await channel.send({ embeds: [await BracketService.formatBracketEmbed(tournament.id)] })

  if (voiceChannels.length > 0 && voiceChannels.length < playableMatchIds.length) {
    await interaction.followUp({
      content: `⚠️ VCチャンネル数（${voiceChannels.length}）が試合数（${playableMatchIds.length}）より少ないため、複数の試合が同じVCを使用します。`,
      flags: MessageFlags.Ephemeral,
    })
  }

  let matchTarget: any = channel
  try {
    const tp = await channel.send({ content: `━━━━━━━━━━━━━━━━━━━━━━\n🏆 **${tournament.name}** — 試合はこのスレッドで行います` })
    matchTarget = await (tp as any).startThread({ name: `${tournament.name} 試合`.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays })
  } catch { /* fallback */ }

  for (const matchId of playableMatchIds) {
    try {
      const { content, components } = await BracketService.formatMatchContent(matchId, regulation)
      const msg = await matchTarget.send({ content, components })
      await TournamentMatchModel.setMessageId(matchId, msg.id)
    } catch (err) { console.error(`[tnm] Failed to post match ${matchId}:`, err) }
  }

  await setAnnouncementButtonsDisabled(interaction.guild, tournament, true, '大会開始済み — 受付終了')
  await interaction.editReply('✅ 大会を開始しました！')
  return true
}

async function handleAdminClose(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply('❌ 大会が見つかりません。'); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply('❌ この操作は大会主催者またはサーバー管理者のみ実行できます。'); return true
  }
  if (tournament.status !== 'registration') {
    await interaction.editReply('❌ 参加受付中の大会ではありません。'); return true
  }

  await TournamentModel.setStatus(tournament.id, 'closed')
  await setAnnouncementButtonsDisabled(interaction.guild, tournament, true, '参加受付終了')
  const count = await TournamentParticipantModel.count(tournament.id)
  await interaction.editReply(`🔒 **${tournament.name}** の参加受付を終了しました。（${count} 名）\n再開する場合は再度 \`/tnm view\` から「🔓 受付を再開」を押してください。`)
  return true
}

async function handleAdminReopen(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply('❌ 大会が見つかりません。'); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply('❌ 権限がありません。'); return true
  }
  if (tournament.status !== 'closed') {
    await interaction.editReply('❌ 受付終了状態の大会のみ再開できます。'); return true
  }

  await TournamentModel.setStatus(tournament.id, 'registration')
  await setAnnouncementButtonsDisabled(interaction.guild, tournament, false, '参加受付中')
  await interaction.editReply(`🔓 **${tournament.name}** の参加受付を再開しました。`)
  return true
}

// 告知メッセージの参加コンポーネント（ボタン・セレクト）の有効/無効を切り替える
async function setAnnouncementButtonsDisabled(
  guild: Guild | null,
  tournament: { channel_id: string | null; announcement_message_id: string | null },
  disabled: boolean,
  footerText?: string
): Promise<void> {
  if (!guild || !tournament.channel_id || !tournament.announcement_message_id) return
  try {
    const ch = await guild.channels.fetch(tournament.channel_id)
    if (!ch || !ch.isTextBased() || ch.isDMBased()) return
    const msg = await ch.messages.fetch(tournament.announcement_message_id)
    if (!msg.editable) return
    const rows: ActionRowBuilder<any>[] = []
    for (const row of msg.components) {
      const components = (row as any).components
      if (!Array.isArray(components)) continue
      const r = new ActionRowBuilder<any>()
      for (const c of components) {
        if (c.type === 2) { // Button
          r.addComponents(ButtonBuilder.from(c).setDisabled(disabled))
        } else if (c.type === 3) { // StringSelectMenu
          r.addComponents(StringSelectMenuBuilder.from(c).setDisabled(disabled))
        }
      }
      if (r.components.length > 0) rows.push(r)
    }
    const embed = footerText && msg.embeds[0]
      ? EmbedBuilder.from(msg.embeds[0]).setFooter({ text: footerText })
      : null
    await msg.edit({
      embeds: embed ? [embed] : msg.embeds,
      components: rows,
    })
  } catch { /* ベストエフォート */ }
}

async function handleAdminDelete(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.reply({ content: '❌ 大会が見つかりません。', flags: MessageFlags.Ephemeral }); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.reply({ content: '❌ 権限がありません。', flags: MessageFlags.Ephemeral }); return true
  }

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tnm-admin-delete-confirm:${tournamentId}`).setLabel('🗑 削除する').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`tnm-admin-delete-cancel:${tournamentId}`).setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
  )
  await interaction.reply({
    content: `⚠️ **${tournament.name}** を削除します。この操作は取り消せません。`,
    components: [confirmRow],
    flags: MessageFlags.Ephemeral,
  })
  return true
}

async function handleAdminDeleteConfirm(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferUpdate()
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply({ content: '❌ 大会が見つかりません。', components: [] }); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply({ content: '❌ 権限がありません。', components: [] }); return true
  }
  const name = tournament.name
  await setAnnouncementButtonsDisabled(interaction.guild, tournament, true)
  await TournamentModel.delete(tournament.id)
  await interaction.editReply({ content: `🗑 **${name}** を削除しました。`, components: [] })
  return true
}

async function handleAdminDeleteCancel(interaction: ButtonInteraction, _tournamentId: number): Promise<boolean> {
  await interaction.update({ content: 'キャンセルしました。', components: [] })
  return true
}

async function handleAdminFix(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const modal = new ModalBuilder()
    .setCustomId(`tnm-admin-fix-modal:${tournamentId}`)
    .setTitle('試合結果を修正')
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('match_code').setLabel('マッチコード（6桁）').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('winner').setLabel('正しい勝者（@メンション または ID）').setStyle(TextInputStyle.Short).setRequired(true)
    ),
  )
  await interaction.showModal(modal)
  return true
}

async function handleAdminFixModal(interaction: ModalSubmitInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply('❌ 大会が見つかりません。'); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply('❌ 権限がありません。'); return true
  }

  const matchCode = interaction.fields.getTextInputValue('match_code').trim()
  const winnerInput = interaction.fields.getTextInputValue('winner').trim()
  const winnerDiscordId = parseDiscordId(winnerInput)
  if (!winnerDiscordId) {
    await interaction.editReply('❌ 正しいDiscordユーザーのメンション（@）またはIDを入力してください。')
    return true
  }

  const allMatches = await TournamentMatchModel.getByTournament(tournament.id)
  const match = allMatches.find(m => m.match_code === matchCode)
  if (!match) { await interaction.editReply(`❌ マッチコード \`${matchCode}\` が見つかりません。`); return true }
  if (match.status !== 'completed') { await interaction.editReply('❌ この試合はまだ完了していません。'); return true }

  const p1 = match.participant1_id ? await TournamentParticipantModel.getById(match.participant1_id) : null
  const p2 = match.participant2_id ? await TournamentParticipantModel.getById(match.participant2_id) : null
  const newWinnerParticipant = [p1, p2].find(p => p?.discord_id === winnerDiscordId)

  if (!newWinnerParticipant) { await interaction.editReply('❌ 指定したユーザーはこの試合の参加者ではありません。'); return true }
  if (Number(match.winner_id) === Number(newWinnerParticipant.id)) {
    await interaction.editReply('そのユーザーはすでに勝者として記録されています。'); return true
  }

  const maxRound = Math.max(...allMatches.map(m => m.round))
  const nextMatch = match.round < maxRound
    ? allMatches.find(m => m.round === match.round + 1 && m.match_number === Math.ceil(match.match_number / 2)) ?? null
    : null

  if (nextMatch && nextMatch.status === 'completed') {
    await interaction.editReply('❌ 次のラウンドの試合がすでに終了しているため修正できません。'); return true
  }

  const oldWinnerId = Number(match.winner_id)
  const newWinnerId = newWinnerParticipant.id
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation

  await TournamentMatchModel.changeWinner(match.id, newWinnerId)
  await TournamentParticipantModel.restore(newWinnerId)
  await TournamentParticipantModel.eliminate(oldWinnerId)

  if (match.message_id && tournament.channel_id && interaction.guild) {
    try {
      const ch = await interaction.guild.channels.fetch(tournament.channel_id)
      if (ch && ch.isTextBased() && !ch.isDMBased()) {
        const origMsg = await ch.messages.fetch(match.message_id)
        if (origMsg.editable) {
          await origMsg.edit({ content: `${origMsg.content}\n🔧 修正: 勝者は <@${winnerDiscordId}> に変更されました`, components: [] })
        }
      }
    } catch { /* best effort */ }
  }

  if (nextMatch) {
    const slot: 'p1' | 'p2' = match.match_number % 2 === 1 ? 'p1' : 'p2'
    await TournamentMatchModel.setParticipant(nextMatch.id, newWinnerId, slot)
    const finalized = await BracketService.finalizeMatchIfReady(nextMatch.id, regulation)
    if (interaction.guild && tournament.channel_id) {
      try {
        const ch = await interaction.guild.channels.fetch(tournament.channel_id)
        if (ch && ch.isTextBased() && !ch.isDMBased()) {
          if (nextMatch.message_id) {
            const msg = await ch.messages.fetch(nextMatch.message_id)
            if (msg.editable) {
              const { content, components } = await formatMatchByFormat(tournament.format, nextMatch.id, nextMatch.round, regulation)
              await msg.edit({ content, components })
            }
          } else if (finalized) {
            const { content, components } = await formatMatchByFormat(tournament.format, nextMatch.id, nextMatch.round, regulation)
            const newMsg = await ch.send({ content, components })
            await TournamentMatchModel.setMessageId(nextMatch.id, newMsg.id)
          }
        }
      } catch { /* best effort */ }
    }
  }

  await interaction.editReply(`✅ マッチ \`#${matchCode}\` の勝者を修正しました。\n新しい勝者: <@${winnerDiscordId}>`)
  return true
}

async function handleAdminEnter(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.reply({ content: '❌ 大会が見つかりません。', flags: MessageFlags.Ephemeral }); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.reply({ content: '❌ 権限がありません。', flags: MessageFlags.Ephemeral }); return true
  }

  const modal = new ModalBuilder()
    .setCustomId(`tnm-admin-enter-modal:${tournamentId}`)
    .setTitle('代理エントリー')
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('user').setLabel('ユーザー（@メンション または ID）').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('rank').setLabel('ランク（部分入力 / 未指定 / ランダム）').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('例: ダイヤ２、未指定')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('character').setLabel('キャラ（部分入力 / 未指定 / ランダム）').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('例: ソル、未指定')
    ),
  )
  await interaction.showModal(modal)
  return true
}

async function handleAdminEnterModal(interaction: ModalSubmitInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply('❌ 大会が見つかりません。'); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply('❌ 権限がありません。'); return true
  }

  const userInput = interaction.fields.getTextInputValue('user').trim()
  const targetDiscordId = parseDiscordId(userInput)
  if (!targetDiscordId) {
    await interaction.editReply('❌ 正しいDiscordユーザーのメンション（@）またはIDを入力してください。')
    return true
  }

  const rank = resolveRank(interaction.fields.getTextInputValue('rank'))
  const character = resolveCharacter(interaction.fields.getTextInputValue('character'))

  let targetName = targetDiscordId
  try {
    const gm = await interaction.guild?.members.fetch(targetDiscordId)
    targetName = gm?.displayName ?? gm?.user.username ?? targetDiscordId
  } catch { /* fallback */ }

  const existing = await TournamentParticipantModel.getByDiscordId(tournamentId, targetDiscordId)
  if (existing) {
    await TournamentParticipantModel.setRankAndCharacter(existing.id, rank, character)
    await interaction.editReply(`✅ **${targetName}** のエントリーを更新しました。\nランク: **${rank ?? '未指定'}** / キャラ: **${character ?? '未指定'}**`)
  } else {
    if (tournament.max_participants) {
      const count = await TournamentParticipantModel.count(tournamentId)
      if (count >= tournament.max_participants) {
        await interaction.editReply(`❌ 定員（${tournament.max_participants}名）に達しています。`); return true
      }
    }
    await TournamentParticipantModel.create({ tournament_id: tournamentId, discord_id: targetDiscordId, discord_name: targetName, rank, character })
    const count = await TournamentParticipantModel.count(tournamentId)
    if (interaction.guild) await updateAnnouncementEmbed(interaction.guild, tournament, count)
    await interaction.editReply(`✅ **${targetName}** をエントリーしました。\nランク: **${rank ?? '未指定'}** / キャラ: **${character ?? '未指定'}**`)
  }
  return true
}

async function handleAdminTeamSetup(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.reply({ content: '❌ 大会が見つかりません。', flags: MessageFlags.Ephemeral }); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.reply({ content: '❌ 権限がありません。', flags: MessageFlags.Ephemeral }); return true
  }

  const modal = new ModalBuilder()
    .setCustomId(`tnm-admin-team-setup-modal:${tournamentId}`)
    .setTitle('チームを作成する')
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('team1').setLabel('チーム1の名前').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('team2').setLabel('チーム2の名前').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('team3').setLabel('チーム3の名前（任意）').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('team4').setLabel('チーム4の名前（任意）').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30)
    ),
  )
  await interaction.showModal(modal)
  return true
}

async function handleAdminTeamSetupModal(interaction: ModalSubmitInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply('❌ 大会が見つかりません。'); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply('❌ 権限がありません。'); return true
  }
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  if (!regulation.teamMode) { await interaction.editReply('❌ 団体戦モードの大会ではありません。'); return true }

  const names: string[] = []
  for (let i = 1; i <= 4; i++) {
    try {
      const n = interaction.fields.getTextInputValue(`team${i}`).trim()
      if (n) names.push(n)
    } catch { /* optional fields */ }
  }

  if (names.length < 2) { await interaction.editReply('❌ チームは2つ以上設定してください。'); return true }

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
  return true
}

async function handleAdminAssign(interaction: ButtonInteraction, tournamentId: number): Promise<boolean> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply('❌ 大会が見つかりません。'); return true }
  if (!await checkAdminPermission(interaction, tournament)) {
    await interaction.editReply('❌ 権限がありません。'); return true
  }
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  if (!regulation.teamMode || regulation.teamEntryMode !== 'assign') {
    await interaction.editReply('❌ この大会は「振り分け」エントリー方式ではありません。'); return true
  }

  const teams = await TournamentTeamModel.getByTournament(tournament.id)
  if (teams.length === 0) { await interaction.editReply('❌ 先にチームを作成してください。'); return true }

  const { content, components } = await buildAssignPanel(tournament.id)
  await interaction.editReply({ content, components })
  return true
}

function parseDiscordId(input: string): string | null {
  const trimmed = input.trim()
  const mentionMatch = trimmed.match(/^<@!?(\d+)>$/)
  if (mentionMatch) return mentionMatch[1]
  if (/^\d{17,20}$/.test(trimmed)) return trimmed
  return null
}

function buildRankSelectRow(customId: string, currentRank?: string | null): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('ランクを選択...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(!currentRank ? '未指定（現在）' : '未指定')
        .setValue('未指定'),
      new StringSelectMenuOptionBuilder().setLabel('ランダム').setValue('ランダム'),
      ...(RANKS as readonly string[]).map(r =>
        new StringSelectMenuOptionBuilder()
          .setLabel(r === currentRank ? `${r}（現在）` : r)
          .setValue(r)
      )
    )
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
}

async function handleRankSelect(interaction: StringSelectMenuInteraction, type: string, tournamentId: number): Promise<boolean> {
  const selectedRank = interaction.values[0]
  const modal = new ModalBuilder()
    .setCustomId(`tnm-char-modal:${type}:${tournamentId}:${selectedRank}`)
    .setTitle(type === 'join' ? '参加登録' : 'エントリー編集')
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('character')
        .setLabel('キャラクター（部分入力 / 未指定 / ランダム）')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('例: ソル、ラム、未指定、ランダム')
    )
  )
  await interaction.showModal(modal)
  return true
}

async function handleCharModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  // customId: tnm-char-modal:{type}:{tournamentId}:{rank}
  const parts = interaction.customId.split(':')
  const type = parts[1]
  const tournamentId = parseInt(parts[2])
  const rawRank = parts.slice(3).join(':')

  const rank = resolveRank(rawRank)
  const character = resolveCharacter(interaction.fields.getTextInputValue('character'))

  if (type === 'join') {
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament || tournament.status !== 'registration') {
      await interaction.reply({ content: '参加受付は終了しています。', flags: MessageFlags.Ephemeral }); return true
    }
    const member = interaction.member as GuildMember | null
    const displayName = member?.displayName ?? interaction.user.displayName ?? interaction.user.username
    const result = await TournamentParticipantModel.createIfUnderCap({
      tournament_id: tournamentId, discord_id: interaction.user.id, discord_name: displayName,
      rank, character, maxParticipants: tournament.max_participants,
    })
    if (result === 'duplicate') { await interaction.reply({ content: 'すでに参加登録済みです。', flags: MessageFlags.Ephemeral }); return true }
    if (result === 'over_cap') { await interaction.reply({ content: `❌ 定員（${tournament.max_participants}名）に達しています。`, flags: MessageFlags.Ephemeral }); return true }
    const count = await TournamentParticipantModel.count(tournamentId)
    if (interaction.guild) await updateAnnouncementEmbed(interaction.guild, tournament, count)
    await interaction.reply({
      content: `✅ **${tournament.name}** に参加しました！\nランク: **${rank ?? '未指定'}** / キャラ: **${character ?? '未指定'}**\n現在の参加者: ${count} 名`,
      flags: MessageFlags.Ephemeral,
    })
  } else if (type === 'edit') {
    const participant = await TournamentParticipantModel.getByDiscordId(tournamentId, interaction.user.id)
    if (!participant) { await interaction.reply({ content: '参加登録が見つかりません。', flags: MessageFlags.Ephemeral }); return true }
    await TournamentParticipantModel.setRankAndCharacter(participant.id, rank, character)
    await interaction.reply({
      content: `✅ エントリーを更新しました！\nランク: **${rank ?? '未指定'}** / キャラ: **${character ?? '未指定'}**`,
      flags: MessageFlags.Ephemeral,
    })
  }

  return true
}

// ─── Rank / character resolution ─────────────────────────────────────────────

function resolveRank(input: string): string | null {
  const t = input.trim()
  if (!t || t === '未指定') return null
  if (t === 'ランダム') return (RANKS as readonly string[])[Math.floor(Math.random() * RANKS.length)]
  return (RANKS as readonly string[]).find(r => r === t)
    ?? (RANKS as readonly string[]).find(r => r.toLowerCase().includes(t.toLowerCase()))
    ?? null
}

function resolveCharacter(input: string): string | null {
  const t = input.trim()
  if (!t || t === '未指定') return null
  if (t === 'ランダム') return (CHARACTERS as readonly string[])[Math.floor(Math.random() * CHARACTERS.length)]
  return (CHARACTERS as readonly string[]).find(c => c === t)
    ?? (CHARACTERS as readonly string[]).find(c => c.toLowerCase().includes(t.toLowerCase()))
    ?? null
}

async function showCombinedModal(
  interaction: { showModal: (modal: ModalBuilder) => Promise<void> },
  customIdSuffix: string,
  existingRank?: string | null,
  existingChar?: string | null
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`tnm-combined-modal:${customIdSuffix}`)
    .setTitle('参加情報を入力')
  const rankInput = new TextInputBuilder()
    .setCustomId('rank')
    .setLabel('ランク（部分入力 / 未指定 / ランダム）')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('例: ダイヤ２、ランダム、未指定')
  if (existingRank) rankInput.setValue(existingRank)
  const charInput = new TextInputBuilder()
    .setCustomId('character')
    .setLabel('キャラクター（部分入力 / 未指定 / ランダム）')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('例: ソル、ラム、未指定、ランダム')
  if (existingChar) charInput.setValue(existingChar)
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(rankInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(charInput),
  )
  await interaction.showModal(modal)
}

async function handleCombinedModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const parts = interaction.customId.split(':')
  // customId: tnm-combined-modal:{type}:{tournamentId}[:{extraId}]
  const type = parts[1]
  const tournamentId = parseInt(parts[2])
  const extraId = parts[3] // teamId for 'team', targetDiscordId for 'admin'

  const rawRank = interaction.fields.getTextInputValue('rank')
  const rawChar = interaction.fields.getTextInputValue('character')
  const rank = resolveRank(rawRank)
  const character = resolveCharacter(rawChar)

  if (type === 'team') {
    const teamId = parseInt(extraId)
    const member = await TournamentTeamMemberModel.getByDiscordId(teamId, interaction.user.id)
    if (!member) { await interaction.reply({ content: '❌ メンバーが見つかりません。', flags: MessageFlags.Ephemeral }); return true }
    await TournamentTeamMemberModel.setRank(member.id, rank ?? null)
    await TournamentTeamMemberModel.setCharacter(member.id, character ?? null)
    const team = await TournamentTeamModel.getById(teamId)
    await interaction.reply({ content: `✅ 登録完了！（チーム: **${team?.name}**）\nランク: **${rank ?? '未指定'}** / キャラ: **${character ?? '未指定'}**`, flags: MessageFlags.Ephemeral })
  }

  return true
}

async function handleHandicapCustomModal(interaction: ModalSubmitInteraction, tournamentId: number): Promise<boolean> {
  const rulesRaw = interaction.fields.getTextInputValue('rules').trim()
  try {
    const rules = parseHandicapRules(rulesRaw)
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) { await interaction.reply({ content: '❌ 大会が見つかりません。', flags: MessageFlags.Ephemeral }); return true }
    const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
    regulation.handicapRules = rules
    await TournamentModel.setRegulation(tournament.id, regulation)
    const label = rules.map(r => `ランク差${r.minRankDiff}以上→${r.rounds}R落とし`).join('、')
    await interaction.reply({ content: `✅ ハンデルールを設定しました: ${label}`, flags: MessageFlags.Ephemeral })
  } catch {
    await interaction.reply({ content: '❌ 形式が正しくありません。例: `3:1,7:2`（ランク差:ラウンド数）', flags: MessageFlags.Ephemeral })
  }
  return true
}

async function handleHandicapPreset(interaction: StringSelectMenuInteraction, tournamentId: number): Promise<boolean> {
  const value = interaction.values[0]

  if (value === 'custom') {
    const modal = new ModalBuilder()
      .setCustomId(`tnm-handicap-custom-modal:${tournamentId}`)
      .setTitle('ハンデルール カスタム設定')
    const ruleInput = new TextInputBuilder()
      .setCustomId('rules')
      .setLabel('ランク差:ラウンド数（カンマ区切り）')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('例: 3:1,7:2')
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(ruleInput))
    await interaction.showModal(modal)
    return true
  }

  await interaction.deferUpdate()
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) { await interaction.editReply({ content: '❌ 大会が見つかりません。', components: [] }); return true }
  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  regulation.handicapRules = value === 'none' ? [] : parseHandicapRules(value)
  await TournamentModel.setRegulation(tournament.id, regulation)
  const label = regulation.handicapRules.length > 0
    ? regulation.handicapRules.map(r => `ランク差${r.minRankDiff}以上→${r.rounds}R落とし`).join('、')
    : 'なし'
  await interaction.editReply({ content: `✅ ハンデルールを設定しました: ${label}`, components: [] })
  return true
}

// ─── VC setup select (triggered from tnm-vc-setup:{tournamentId} in create flow) ──

async function handleVcSetupSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate()
  const tournamentId = parseInt(interaction.customId.split(':')[1])
  const tournament = await TournamentModel.getById(tournamentId)
  if (!tournament) {
    await interaction.followUp({ content: '❌ 大会が見つかりません。', flags: MessageFlags.Ephemeral })
    return
  }

  const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
  regulation.vcChannelIds = interaction.values
  await TournamentModel.setRegulation(tournament.id, regulation)

  const label = interaction.values.length > 0
    ? interaction.values.map(id => `<#${id}>`).join('、')
    : '未設定（デフォルト: 🟦 GGST - ラウンジ #1）'

  await interaction.editReply({
    content: `✅ VCチャンネルを設定しました: ${label}`,
    components: [],
  })
}
