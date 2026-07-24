import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, closeDatabase, getDatabase } from './index';

/**
 * ランク追跡の「👤 自分のみ」フィルタは tracked_players.added_by_discord_id を
 * owner(その追跡対象を表す本人)として扱う。代理登録すると owner が登録者(代理者)の
 * Discord ID になってしまい、「自分のみ」に代理登録分が混ざる。
 *
 * このスクリプトはボットのロジックを一切変えず、DB 上の owner(added_by_discord_id)
 * だけを正しい本人の Discord ID に修正するための一回限りのメンテナンスツール。
 *
 * 使い方(Turso の認証情報がある環境で実行):
 *   1) 一覧を確認して対象行の id と、正しい owner の Discord ID を特定する
 *        npm run fix:tracked-owner -- --list
 *        npm run fix:tracked-owner -- --list --guild <GUILD_ID>
 *
 *   2) 対象行の owner を書き換える(--commit を付けるまでは dry-run)
 *        npm run fix:tracked-owner -- --id <TRACKED_ID> --owner <DISCORD_ID>
 *        npm run fix:tracked-owner -- --id <TRACKED_ID> --owner <DISCORD_ID> --commit
 */

type Args = {
  list: boolean;
  commit: boolean;
  guild?: string;
  id?: number;
  owner?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, commit: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--list':
        args.list = true;
        break;
      case '--commit':
        args.commit = true;
        break;
      case '--guild':
        args.guild = argv[++i];
        break;
      case '--id':
        args.id = parseInt(argv[++i] ?? '', 10);
        break;
      case '--owner':
        args.owner = argv[++i];
        break;
      default:
        console.warn(`不明な引数を無視しました: ${a}`);
    }
  }
  return args;
}

type Row = {
  id: number;
  guild_id: string;
  puddle_player_id: string;
  display_name: string;
  char_short: string;
  added_by_discord_id: string;
  created_at: string;
};

async function listPlayers(guild?: string): Promise<void> {
  const db = getDatabase();
  const result = guild
    ? await db.execute({
        sql: 'SELECT * FROM tracked_players WHERE guild_id = ? ORDER BY created_at ASC',
        args: [guild],
      })
    : await db.execute('SELECT * FROM tracked_players ORDER BY guild_id ASC, created_at ASC');

  const rows = result.rows as unknown as Row[];
  if (rows.length === 0) {
    console.log('該当する追跡対象はありません。');
    return;
  }

  console.log(`追跡対象 ${rows.length} 件:`);
  console.log('─'.repeat(100));
  for (const r of rows) {
    console.log(
      `id=${r.id}  guild=${r.guild_id}  ${r.display_name} (${r.char_short})  ` +
        `puddle_id=${r.puddle_player_id}  owner(added_by)=${r.added_by_discord_id}`,
    );
  }
  console.log('─'.repeat(100));
  console.log('「自分のみ」は owner(added_by) と実行者の Discord ID が一致する行だけを表示します。');
  console.log('代理登録した行の owner を本人の Discord ID に書き換えてください:');
  console.log('  npm run fix:tracked-owner -- --id <TRACKED_ID> --owner <DISCORD_ID> --commit');
}

async function setOwner(id: number, owner: string, commit: boolean): Promise<void> {
  const db = getDatabase();

  const before = await db.execute({ sql: 'SELECT * FROM tracked_players WHERE id = ?', args: [id] });
  if (before.rows.length === 0) {
    console.error(`❌ id=${id} の追跡対象が見つかりません。--list で確認してください。`);
    return;
  }
  const row = before.rows[0] as unknown as Row;
  console.log(`対象: id=${row.id}  ${row.display_name} (${row.char_short})  puddle_id=${row.puddle_player_id}`);
  console.log(`  owner(added_by): ${row.added_by_discord_id}  →  ${owner}`);

  if (row.added_by_discord_id === owner) {
    console.log('ℹ️ 既に指定の owner です。変更はありません。');
    return;
  }

  if (!commit) {
    console.log('（dry-run）変更は保存していません。実際に更新するには --commit を付けて再実行してください。');
    return;
  }

  await db.execute({
    sql: 'UPDATE tracked_players SET added_by_discord_id = ? WHERE id = ?',
    args: [owner, id],
  });
  console.log('✅ owner を更新しました。パネルの「🔄 更新」または「👤 自分のみ」で反映されます。');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await initDatabase();

  try {
    if (args.list) {
      await listPlayers(args.guild);
      return;
    }

    if (args.id !== undefined && args.owner) {
      if (Number.isNaN(args.id)) {
        console.error('❌ --id は数値で指定してください。');
        return;
      }
      await setOwner(args.id, args.owner, args.commit);
      return;
    }

    console.log('使い方:');
    console.log('  npm run fix:tracked-owner -- --list [--guild <GUILD_ID>]');
    console.log('  npm run fix:tracked-owner -- --id <TRACKED_ID> --owner <DISCORD_ID> [--commit]');
  } finally {
    await closeDatabase();
  }
}

main().catch(console.error);
