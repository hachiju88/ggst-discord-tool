import { getDatabase } from '../database';
import { CommonStrategy, CharacterMove } from '../types';

interface BackupData {
    version: number;
    timestamp: string;
    commonStrategies: CommonStrategy[];
    characterMoves: CharacterMove[];
}

export class BackupService {
    static async exportData(): Promise<BackupData> {
        const db = getDatabase();

        // 共通戦略の取得
        const strategiesResult = await db.execute('SELECT * FROM common_strategies');
        const commonStrategies = strategiesResult.rows as unknown as CommonStrategy[];

        // 技データの取得
        const movesResult = await db.execute('SELECT * FROM character_moves');
        const characterMoves = movesResult.rows as unknown as CharacterMove[];

        return {
            version: 1,
            timestamp: new Date().toISOString(),
            commonStrategies,
            characterMoves
        };
    }

    static async importData(data: any): Promise<{ strategiesCount: number; movesCount: number }> {
        const db = getDatabase();

        // バリデーション
        if (!data.commonStrategies || !Array.isArray(data.commonStrategies)) {
            throw new Error('Invalid backup format: commonStrategies missing or invalid');
        }
        if (!data.characterMoves || !Array.isArray(data.characterMoves)) {
            throw new Error('Invalid backup format: characterMoves missing or invalid');
        }

        let strategiesCount = 0;
        let movesCount = 0;

        // トランザクションがあればベストだが、Tursoのクライアントでどうやるか確認が必要。
        // ここでは個別に実行する。失敗したら一部適用されるリスクはあるが、復元用途なので許容。
        // まずはデータを全削除してからインポートする「Wipe and Replace」方式か、
        // 「Upsert」方式か。ユーザーは「汚染されるリスク」を懸念しているので、
        // 正常なバックアップに戻す＝「Wipe and Replace」が確実。
        // ただし、バックアップに含まれていない新しいデータが消えるリスクがある。
        // ここでは安全のため「Upsert (IDが一致すれば更新、なければ挿入)」にする。
        // 重複IDがある場合はバックアップの内容で上書きする。

        // 共通戦略のインポート
        for (const strat of data.commonStrategies) {
            await db.execute({
                sql: `
          INSERT INTO common_strategies (id, target_character, target_character_id, strategy_content, created_by_discord_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            target_character = excluded.target_character,
            target_character_id = excluded.target_character_id,
            strategy_content = excluded.strategy_content,
            created_by_discord_id = excluded.created_by_discord_id,
            updated_at = excluded.updated_at
        `,
                args: [
                    strat.id,
                    strat.target_character,
                    strat.target_character_id,
                    strat.strategy_content,
                    strat.created_by_discord_id,
                    strat.created_at,
                    strat.updated_at || null
                ]
            });
            strategiesCount++;
        }

        // 技データのインポート
        for (const move of data.characterMoves) {
            await db.execute({
                sql: `
          INSERT INTO character_moves (id, character_id, move_name, move_name_en, move_notation, move_type)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            character_id = excluded.character_id,
            move_name = excluded.move_name,
            move_name_en = excluded.move_name_en,
            move_notation = excluded.move_notation,
            move_type = excluded.move_type
        `,
                args: [
                    move.id,
                    move.character_id,
                    move.move_name,
                    move.move_name_en || null,
                    move.move_notation,
                    move.move_type || null
                ]
            });
            movesCount++;
        }

        return { strategiesCount, movesCount };
    }
}
