import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { StrategyModel } from '../models/Strategy';
import { CommonStrategyModel } from '../models/CommonStrategy';

export const data = new SlashCommandBuilder()
  .setName('ge')
  .setDescription('[GGST] NotebookLM用にデータをエクスポートします');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const user = await UserModel.getUser(userId);

  if (!user) {
    await interaction.editReply('データがありません。まず `/setmychar` でキャラを設定してください。');
    return;
  }

  // データを取得
  const matches = await MatchModel.getByUser(userId);
  const overallStats = await MatchModel.getStats(userId);
  const charStats = await MatchModel.getStatsByCharacter(userId);
  const personalStrategies = await StrategyModel.getAllByUser(userId);
  const allCommonStrategies = await CommonStrategyModel.getAll();

  // Markdown生成
  const now = new Date().toLocaleString('ja-JP');
  let markdown = `# ギルティギア対戦記録 - ${interaction.user.username}\n\n`;
  markdown += `**メインキャラクター**: ${user.main_character || '未設定'}\n`;
  markdown += `**エクスポート日時**: ${now}\n\n`;

  markdown += `## 全体統計\n\n`;
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
