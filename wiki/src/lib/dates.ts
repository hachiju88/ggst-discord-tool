import { execFileSync } from 'node:child_process';

/**
 * 記事ファイルごとの最終更新日（git の最終コミット日）と作成日（最初のコミット日）。
 * ビルド時に1回だけ git log を読む。
 *
 * 履歴が浅い（shallow clone）と、一番古いコミットで全ファイルが「追加」扱いになり
 * 全記事が同じ日付になってしまう。そのときはまず履歴を取り直し、
 * それでも浅いままなら日付は使わない（空の Map を返す → 表示側は日付なしで並べる）。
 */
let cache: Map<string, Date> | undefined;
let createdCache: Map<string, Date> | undefined;

const git = (args: string[], timeout = 15_000) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout, maxBuffer: 32 * 1024 * 1024 }).trim();

function isShallow(): boolean {
  return git(['rev-parse', '--is-shallow-repository']) === 'true';
}

export function lastCommitDates(): Map<string, Date> {
  if (cache) return cache;
  cache = new Map();
  createdCache = new Map();
  try {
    if (isShallow()) {
      try {
        git(['fetch', '--unshallow', '--quiet'], 120_000);
      } catch {
        // 取り直せない環境（ネットワークなし等）は下でそのまま判定
      }
      if (isShallow()) {
        console.warn('[dates] git の履歴が浅いため、記事の更新日は表示しません');
        return cache;
      }
    }
    const root = git(['rev-parse', '--show-toplevel']);
    // -M: サイトで URL を変えた記事（同じコミットで追加＋削除）を名前変更として扱い、作成日を引き継ぐ
    const log = git(['log', '--format=@%cI', '--name-status', '-M', '--', 'src/content/docs'], 60_000);
    const renamedTo = new Map<string, string>(); // 古いパス → 今のパス
    const now = (p: string) => renamedTo.get(p) ?? p;
    let current: Date | undefined;
    for (const line of log.split('\n')) {
      if (line.startsWith('@')) {
        current = new Date(line.slice(1));
        continue;
      }
      if (!line || !current) continue;
      const [status, ...paths] = line.split('\t');
      if (!paths.length) continue;
      const target = now(paths[paths.length - 1]);
      const abs = `${root}/${target}`;
      if (!cache.has(abs)) cache.set(abs, current);
      createdCache.set(abs, current); // 新しい順に読むので、最後に残るのが最初のコミット
      if (status.startsWith('R') && paths.length === 2) renamedTo.set(paths[0], target);
    }
  } catch {
    // git が無い・リポジトリでない → 日付なしで続行
  }
  return cache;
}

function lookup(map: Map<string, Date>, filePath: string | undefined): Date | undefined {
  if (!filePath) return undefined;
  const rel = '/' + filePath.replace(/^\.?\//, '');
  for (const [abs, date] of map) if (abs.endsWith(rel)) return date;
  return undefined;
}

export function lastUpdatedOf(filePath: string | undefined): Date | undefined {
  return lookup(lastCommitDates(), filePath);
}

/** 記事の作成日（最初のコミット日）。まだコミットしていない記事は undefined */
export function createdOf(filePath: string | undefined): Date | undefined {
  lastCommitDates();
  return lookup(createdCache!, filePath);
}
