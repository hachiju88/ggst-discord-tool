/**
 * GitHub API で記事ファイルを読み書きする。
 * 複数ファイルの追加・更新・削除を 1 コミットにまとめる（Cloudflare のビルドも 1 回で済む）。
 */
export interface GitHubEnv {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // 例: owner/repo
  GITHUB_BRANCH?: string; // 既定: main
  GITHUB_API?: string; // テスト用に差し替え可能
}

export class ConflictError extends Error {}

const api = (env: GitHubEnv) => env.GITHUB_API ?? 'https://api.github.com';
const branch = (env: GitHubEnv) => env.GITHUB_BRANCH ?? 'main';

async function gh<T>(env: GitHubEnv, path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new Error('GitHub の設定（GITHUB_TOKEN / GITHUB_REPO）がありません');
  const res = await fetch(`${api(env)}/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'bridget-wiki',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

const decodeBase64 = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

/** ファイルを取得（無ければ null）。sha は同時編集の検出に使う。ref 省略時はブランチの最新 */
export async function getFile(env: GitHubEnv, path: string, ref?: string): Promise<{ text: string; sha: string } | null> {
  const r = await gh<{ content: string; sha: string }>(
    env,
    `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref ?? branch(env))}`,
  );
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`GitHub からの読み込みに失敗しました (${r.status})`);
  return { text: decodeBase64(r.data.content), sha: r.data.sha };
}

export type Change =
  | { path: string; content: string; expectSha?: string | null } // expectSha: null=新規のみ / 文字列=その版からの更新のみ
  | { path: string; delete: true; expectSha?: string };

/** Git の blob sha（GitHub の contents API が返す sha と同じ）。保存直後の sha をクライアントに返すのに使う */
export async function blobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.byteLength}\0`);
  const buf = new Uint8Array(head.byteLength + body.byteLength);
  buf.set(head);
  buf.set(body, head.byteLength);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 変更を 1 コミットで反映する。先に他の人が更新していたら ConflictError。
 * 競合チェックは「このコミットの親になる HEAD」に対して毎回行うので、
 * チェック後に別の保存が割り込んでも気づかず上書きすることはない。
 */
export async function commit(env: GitHubEnv, changes: Change[], message: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(env, `/git/ref/heads/${branch(env)}`);
    if (ref.status !== 200) throw new Error(`ブランチを取得できません (${ref.status})`);
    const head = ref.data.object.sha;

    for (const c of changes) {
      if (c.expectSha === undefined) continue;
      const cur = await getFile(env, c.path, head);
      if (c.expectSha === null && cur) throw new ConflictError('同じURL名の記事がすでにあります');
      if (c.expectSha && (!cur || cur.sha !== c.expectSha)) {
        throw new ConflictError('ほかの人が先にこの記事を更新しました。ページを読み込み直してください');
      }
    }
    const base = await gh<{ tree: { sha: string } }>(env, `/git/commits/${head}`);
    const tree = await gh<{ sha: string }>(env, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: base.data.tree.sha,
        tree: changes.map((c) =>
          'delete' in c
            ? { path: c.path, mode: '100644', type: 'blob', sha: null }
            : { path: c.path, mode: '100644', type: 'blob', content: c.content },
        ),
      }),
    });
    if (tree.status !== 201) throw new Error(`保存に失敗しました (tree ${tree.status})`);
    const created = await gh<{ sha: string }>(env, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.data.sha, parents: [head] }),
    });
    if (created.status !== 201) throw new Error(`保存に失敗しました (commit ${created.status})`);
    const upd = await gh(env, `/git/refs/heads/${branch(env)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: created.data.sha, force: false }),
    });
    if (upd.status === 200) return created.data.sha;
    if (upd.status !== 422 && upd.status !== 409) throw new Error(`保存に失敗しました (ref ${upd.status})`);
    // 同時に別のコミットが入った → 最新の状態から作り直す
  }
  throw new ConflictError('混み合っています。少し待ってからもう一度保存してください');
}
