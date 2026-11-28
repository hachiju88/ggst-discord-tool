/**
 * いいね・お気に入りの状態をページ全体で共有する。
 * API (/api/reactions) が無い環境ではブラウザ内保存のプレビューモードで動く。
 * ログインしなくても押せる（ゲストはブラウザごとに区別される）。
 * ログイン中にゲストのときのデータが残っていれば、アカウントへ引き継ぐかを聞く。
 * ログインしているつもりで押したのにログインが切れていたら（401）、ゲストとして書き込まずに知らせる。
 */
import { loginUrl } from './login';

type Kind = 'like' | 'fav';
type State = { likes: Record<string, number>; mine: Record<Kind, Set<string>>; preview: boolean; ready: boolean; loggedIn: boolean };

const API = '/api/reactions';
/** ログインしているつもりの画面から書き込むときに付けるヘッダー（server/auth.ts の LOGIN_HEADER） */
export const loginHeader = (): Record<string, string> => (state.loggedIn ? { 'X-Bl-Login': '1' } : {});
const LOCAL = 'bridget-wiki:reactions';
export const state: State = { likes: {}, mine: { like: new Set(), fav: new Set() }, preview: false, ready: false, loggedIn: false };

const saveLocal = () => {
  try {
    localStorage.setItem(LOCAL, JSON.stringify({ like: [...state.mine.like], fav: [...state.mine.fav] }));
  } catch {}
};

async function load() {
  try {
    const res = await fetch(API);
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error();
    const d = await res.json();
    state.likes = d.likes;
    state.loggedIn = !!d.loggedIn;
    state.mine = { like: new Set(d.mine.like), fav: new Set(d.mine.fav) };
    if (d.guestData) setTimeout(() => askMerge(d.guestData));
  } catch {
    state.preview = true;
    let d = { like: [] as string[], fav: [] as string[] };
    try {
      d = { ...d, ...JSON.parse(localStorage.getItem(LOCAL) ?? '{}') };
    } catch {}
    state.mine = { like: new Set(d.like), fav: new Set(d.fav) };
    state.likes = Object.fromEntries(d.like.map((p) => [p, 1]));
  }
  state.ready = true;
  render();
}

/** ゲストのときのデータをアカウントへ引き継ぐか聞く（共用のPCで前の人のデータを取り込まないように） */
async function askMerge(g: { likes: number; favs: number; comments: number }) {
  const items = [g.likes && `いいね${g.likes}件`, g.favs && `お気に入り${g.favs}件`, g.comments && `コメント${g.comments}件`].filter(Boolean);
  const merge = confirm(
    `このブラウザに、ログインせずに付けた ${items.join('・')} があります。\nあなたのアカウントに引き継ぎますか？\n\n` +
      '（共用のPCなどで、ほかの人が付けたものならキャンセルしてください）',
  );
  const res = await fetch('/api/guest-merge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ merge }),
  }).catch(() => null);
  if (merge && res?.ok) {
    await load();
    document.dispatchEvent(new CustomEvent('guest:merged'));
  }
}

/** ログインが切れていたとき：ログインし直すか、ゲストとして続けるか */
export function loginExpired() {
  state.loggedIn = false;
  if (confirm('ログインが切れています。ログインし直しますか？\n（キャンセルすると、ログインしていない状態で続けます）')) {
    location.href = loginUrl();
    return;
  }
  load();
  document.dispatchEvent(new CustomEvent('login:expired'));
}

function render() {
  for (const b of document.querySelectorAll<HTMLElement>('[data-react]')) {
    const on = state.mine[b.dataset.kind as Kind].has(b.dataset.page!);
    b.setAttribute('aria-pressed', String(on));
  }
  for (const c of document.querySelectorAll<HTMLElement>('[data-like-count]')) {
    const n = state.likes[c.dataset.page!] ?? 0;
    c.textContent = String(n);
  }
  document.dispatchEvent(new CustomEvent('reactions:change'));
}

async function toggle(page: string, kind: Kind) {
  const set = state.mine[kind];
  const on = !set.has(page);
  const prev = state.likes[page] ?? 0;
  on ? set.add(page) : set.delete(page);
  if (kind === 'like') state.likes[page] = Math.max(0, prev + (on ? 1 : -1));
  render();
  if (state.preview) return saveLocal();
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...loginHeader() },
      body: JSON.stringify({ page, kind, on }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.error), { status: res.status });
    state.likes[page] = d.likes;
  } catch (e) {
    on ? set.delete(page) : set.add(page);
    state.likes[page] = prev;
    const { status, message } = e as Error & { status?: number };
    if (status === 401) setTimeout(loginExpired);
    else if (status === 429 && message) setTimeout(() => alert(message));
  }
  render();
}

document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-react]');
  if (!b) return;
  e.preventDefault();
  // 読み込み前に押されたら、読み込みが終わってから反映する
  loaded.then(() => toggle(b.dataset.page!, b.dataset.kind as Kind));
});

/** 最初の読み込み（ゲストのクッキーもここで付く）。書き込みはこれを待ってから送る */
export const loaded = load();
