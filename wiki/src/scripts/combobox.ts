/**
 * 検索つきドロップダウン（技の選択用）。
 *  - 入力すると技表記・技名・読みで絞り込み
 *  - ↑↓ で選択、Enter で決定、Esc で閉じる
 *  - 候補にない文字も Enter でそのまま決定できる（"(CH)" や独自の書き方など）
 */
import type { Move } from '../lib/moves';

/** 全角英数→半角、カタカナ→ひらがな、小文字化 */
export function normalize(s: string) {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９．（）]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
    .toLowerCase();
}

function match(m: Move, q: string) {
  if (!q) return 1;
  const n = normalize(m.notation);
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  const hay = [n, normalize(m.name), normalize(m.kana ?? ''), normalize(m.group)];
  return hay.some((h) => h.includes(q)) ? 2 : 0;
}

let uid = 0;

export function attachCombobox(
  input: HTMLInputElement,
  options: () => Move[],
  onPick: (value: string) => void,
  { clearOnPick = true } = {},
) {
  const id = `cb-${++uid}`;
  const list = document.createElement('ul');
  list.className = 'cb-list';
  list.id = id;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  input.after(list);
  input.parentElement!.classList.add('cb-wrap');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', id);
  input.setAttribute('aria-expanded', 'false');
  input.autocomplete = 'off';

  let items: Move[] = [];
  let active = -1;

  const render = () => {
    const q = normalize(input.value);
    items = options()
      .map((m, i) => ({ m, s: match(m, q), i }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, 40)
      .map((x) => x.m);
    active = q && items.length ? 0 : -1;
    list.replaceChildren(
      ...items.map((m, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.id = `${id}-${i}`;
        li.dataset.index = String(i);
        const b = document.createElement('b');
        b.textContent = m.notation;
        const name = document.createElement('span');
        name.textContent = m.name === m.notation ? '' : m.name;
        const g = document.createElement('small');
        g.textContent = m.group;
        li.append(b, name, g);
        return li;
      }),
    );
    if (input.value.trim() && !items.some((m) => normalize(m.notation) === q)) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.className = 'cb-custom';
      li.dataset.custom = '1';
      li.textContent = `「${input.value.trim()}」をそのまま追加`;
      list.append(li);
    }
    highlight();
    open(list.children.length > 0);
  };
  const open = (on: boolean) => {
    list.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
  };
  const highlight = () => {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    const el = list.children[active] as HTMLElement | undefined;
    if (el) {
      input.setAttribute('aria-activedescendant', el.id || '');
      el.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const pick = (value: string) => {
    value = value.trim();
    if (!value) return;
    // 表記ゆれ（"2k" など）は候補の正式な表記にそろえる
    const exact = options().find((m) => normalize(m.notation) === normalize(value));
    if (exact) value = exact.notation;
    // 決定した値を先に入力欄へ反映してから通知する（通知先が入力欄を読むため）
    input.value = clearOnPick ? '' : value;
    onPick(value);
    open(false);
    if (clearOnPick) input.focus();
  };
  const pickAt = (i: number) => {
    const li = list.children[i] as HTMLElement | undefined;
    if (!li) return pick(input.value);
    pick(li.dataset.custom ? input.value : items[Number(li.dataset.index)].notation);
  };

  input.addEventListener('input', render);
  if (!clearOnPick) {
    // 候補から選ばずに入力して欄を離れたときも、表記ゆれを正式な表記にそろえる
    input.addEventListener('change', () => {
      const exact = options().find((m) => normalize(m.notation) === normalize(input.value));
      if (exact) input.value = exact.notation;
    });
  }
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(() => open(false), 150));
  input.addEventListener('keydown', (e) => {
    const n = list.children.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) return render();
      active = n ? (active + 1) % n : -1;
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = n ? (active - 1 + n) % n : -1;
      highlight();
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (active >= 0) pickAt(active);
      else pick(input.value);
    } else if (e.key === 'Escape') {
      open(false);
    } else if (e.key === 'Backspace' && !input.value && clearOnPick) {
      input.dispatchEvent(new CustomEvent('combobox:backspace'));
    }
  });
  // クリックで選択（blur より先に処理するため mousedown）
  list.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li');
    if (!li) return;
    e.preventDefault();
    pickAt([...list.children].indexOf(li));
  });
}
