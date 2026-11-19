/**
 * いいね・お気に入りの状態をページ全体で共有する。
 * API (/api/reactions) が無い環境ではブラウザ内保存のプレビューモードで動く。
 * 見るだけならログイン不要。押すときに未ログインならログインへ案内する。
 */
import { loginUrl } from './login';

type Kind = 'like' | 'fav';
type State = { likes: Record<string, number>; mine: Record<Kind, Set<string>>; preview: boolean; ready: boolean; loggedIn: boolean };

const API = '/api/reactions';
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

function askLogin(kind: Kind) {
  const what = kind === 'like' ? 'いいね' : 'お気に入り';
  if (confirm(`${what}するにはログインが必要です。ログインしますか？`)) location.href = loginUrl();
}

async function toggle(page: string, kind: Kind) {
  if (!state.preview && !state.loggedIn) return askLogin(kind);
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page, kind, on }),
    });
    if (res.status === 401) {
      state.loggedIn = false;
      throw Object.assign(new Error(), { login: true });
    }
    if (!res.ok) throw new Error();
    const d = await res.json();
    state.likes[page] = d.likes;
  } catch (e) {
    if ((e as { login?: boolean }).login) setTimeout(() => askLogin(kind));
    on ? set.delete(page) : set.add(page);
    state.likes[page] = prev;
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

const loaded = load();
