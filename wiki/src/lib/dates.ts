import { execFileSync } from 'node:child_process';

/**
 * 記事ファイルごとの最終更新日（git の最終コミット日）。
 * ビルド時に1回だけ git log を読む。git が使えない環境では空（日付なし）になる。
 */
let cache: Map<string, Date> | undefined;

export function lastCommitDates(): Map<string, Date> {
  if (cache) return cache;
  cache = new Map();
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const log = execFileSync(
      'git',
      ['log', '--format=@%cI', '--name-only', '--', 'src/content/docs'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    let current: Date | undefined;
    for (const line of log.split('\n')) {
      if (line.startsWith('@')) current = new Date(line.slice(1));
      else if (line && current) {
        const abs = `${root}/${line}`;
        if (!cache.has(abs)) cache.set(abs, current);
      }
    }
  } catch {
    // git が無い・履歴が無い → 日付なしで続行
  }
  return cache;
}

export function lastUpdatedOf(filePath: string | undefined): Date | undefined {
  if (!filePath) return undefined;
  const map = lastCommitDates();
  for (const [abs, date] of map) if (abs.endsWith('/' + filePath.replace(/^\.?\//, ''))) return date;
  return undefined;
}
