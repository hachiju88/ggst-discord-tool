import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { StrategyModel } from '../models/Strategy';
import { CommonStrategyModel } from '../models/CommonStrategy';

export const data = new SlashCommandBuilder()
  .setName('ge')
  .setDescription('[GGST] NotebookLM用にデータをエクスポートします')
  .addStringOption(option =>
    option
      .setName('period')
      .setDescription('検索期間（デフォルト: 1日）')
      .setRequired(false)
      .addChoices(
        { name: '1日', value: '1day' },
        { name: '1週間', value: '1week' },
        { name: '1ヶ月', value: '1month' },
        { name: '無期限', value: 'all' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const period = (interaction.options.getString('period') || '1day') as '1day' | '1week' | '1month' | 'all';
  const user = await UserModel.getUser(userId);

  if (!user) {
    await interaction.editReply('データがありません。まず `/setmychar` でキャラを設定してください。');
    return;
  }

  // データを取得（期間フィルター適用）
  const matches = await MatchModel.getByUser(userId, undefined, undefined, undefined, period);
  const overallStats = await MatchModel.getStats(userId, undefined, undefined, period);
  const charStats = await MatchModel.getStatsByCharacter(userId, period);
  const personalStrategies = await StrategyModel.getAllByUser(userId);
  const allCommonStrategies = await CommonStrategyModel.getAll();

  // Markdown生成
  const now = new Date().toLocaleString('ja-JP');
  const periodMap = { '1day': '過去1日', '1week': '過去1週間', '1month': '過去1ヶ月', 'all': '全期間' };
  let markdown = `# ギルティギア対戦記録 - ${interaction.user.username}\n\n`;
  markdown += `**メインキャラクター**: ${user.main_character || '未設定'}\n`;
  markdown += `**対象期間**: ${periodMap[period]}\n`;
  markdown += `**エクスポート日時**: ${now}\n\n`;

  markdown += `## 全体統計 (${periodMap[period]})\n\n`;
  markdown += `- 総対戦数: ${overallStats.total}戦\n`;
  markdown += `- 勝率: ${overallStats.total > 0 ? ((overallStats.wins / overallStats.total) * 100).toFixed(1) : 0}% (${overallStats.wins}勝${overallStats.losses}敗)\n\n`;

  if (charStats.length > 0) {
    markdown += `## キャラ別対戦成績\n\n`;
    for (const stat of charStats) {
      markdown += `### vs ${stat.character} (${stat.wins}勝${stat.losses}敗 - ${stat.winRate.toFixed(1)}%)\n\n`;

      // このキャラの共通戦略を表示
      const commonStrats = allCommonStrategies.filter(s => s.target_character === stat.character);
      if (commonStrats.length > 0) {
        markdown += `**共通対策情報**:\n`;
        commonStrats.forEach((strat, i) => {
          markdown += `${i + 1}. ${strat.strategy_content}\n`;
        });
        markdown += `\n`;
      }

      // このキャラの個人戦略を表示
      const personalStrats = personalStrategies.filter(s => s.target_character === stat.character);
      if (personalStrats.length > 0) {
        markdown += `**あなたの戦略メモ**:\n`;
        personalStrats.forEach((strat, i) => {
          markdown += `${i + 1}. ${strat.strategy_content}\n`;
        });
        markdown += `\n`;
      }

      // このキャラとの対戦メモ
      const charMatches = matches.filter(m => m.opponent_character === stat.character);
      if (charMatches.length > 0) {
        markdown += `**対戦メモ**:\n`;
        charMatches.forEach(match => {
          const date = new Date(match.match_date).toLocaleDateString('ja-JP');
          const result = match.result === 'win' ? '勝利' : '敗北';
          const myChar = match.my_character || user.main_character || '？';
          markdown += `- [${date}] ${myChar} vs ${match.opponent_character}: ${result}`;
          if (match.note) {
            markdown += ` - ${match.note}`;
          }
          markdown += `\n`;
        });
        markdown += `\n`;
      }
    }
  } else {
    markdown += `対戦記録がありません。\n\n`;
  }

  // 未対戦キャラの共通戦略も含める
  markdown += `## 未対戦キャラの共通対策情報\n\n`;
  const foughtChars = charStats.map(s => s.character);
  const unfoughtCommonStrats = allCommonStrategies.filter(s => !foughtChars.includes(s.target_character));

  if (unfoughtCommonStrats.length > 0) {
    const grouped = unfoughtCommonStrats.reduce((acc, strat) => {
      if (!acc[strat.target_character]) {
        acc[strat.target_character] = [];
      }
      acc[strat.target_character].push(strat);
      return acc;
    }, {} as Record<string, typeof unfoughtCommonStrats>);

    for (const [char, strats] of Object.entries(grouped)) {
      markdown += `### ${char}\n\n`;
      strats.forEach((strat, i) => {
        markdown += `${i + 1}. ${strat.strategy_content}\n`;
      });
      markdown += `\n`;
    }
  } else {
    markdown += `なし\n\n`;
  }

  // ファイル作成
  const buffer = Buffer.from(markdown, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, {
    name: `ggst-data-${interaction.user.username}-${Date.now()}.md`
  });

  await interaction.editReply({
    content: '📄 データをエクスポートしました。このファイルをNotebookLMにアップロードして分析してください。',
    files: [attachment]
  });
}
