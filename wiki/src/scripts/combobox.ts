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

/** 候補のうち、入力と同じ表記のもの（表記ゆれを正式な表記にそろえるのに使う） */
export function resolveNotation(value: string, options: Move[]): string {
  const v = value.trim();
  return options.find((m) => normalize(m.notation) === normalize(v))?.notation ?? v;
}

/**
 * 日本語入力の変換確定の Enter かどうか。
 * Safari は確定の Enter を isComposing=false・keyCode 229 で送ってくるので両方見る。
 */
export function isImeEnter(e: KeyboardEvent, composing: boolean) {
  return e.isComposing || composing || e.keyCode === 229;
}

/** compositionstart〜end の間 true になる状態を input に付ける */
export function trackComposition(input: HTMLInputElement) {
  const state = { composing: false };
  input.addEventListener('compositionstart', () => (state.composing = true));
  // Safari は compositionend の直後に確定の keydown が来るため、少し遅らせて解除する
  input.addEventListener('compositionend', () => setTimeout(() => (state.composing = false), 0));
  return state;
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
  const ime = trackComposition(input);

  const render = () => {
    const q = normalize(input.value);
    const scored = options()
      .map((m, i) => ({ m, s: match(m, q), i }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, 40);
    items = scored.map((x) => x.m);
    // 先頭の候補を選んでおくのは「表記が前方一致」か「2文字以上で技名・読みに一致」のときだけ。
    // 「S」のような1文字の入力で、名前に含むだけの候補が勝手に選ばれないようにする（その場合は「そのまま追加」）
    const top = scored[0]?.s ?? 0;
    const strong = q !== '' && (top >= 3 || (top >= 2 && q.length >= 2));
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
    active = strong ? 0 : q ? list.children.length - 1 : -1;
    highlight();
    open(list.children.length > 0);
  };
  const open = (on: boolean) => {
    list.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
    if (!on) {
      // 閉じたら選択状態を捨てる（閉じた後の Enter で前の候補が再度選ばれないように）
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }
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
    value = resolveNotation(value, options());
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
      if (input.value.trim()) input.value = resolveNotation(input.value, options());
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
    } else if (e.key === 'Enter') {
      if (isImeEnter(e, ime.composing)) return;
      e.preventDefault();
      if (!list.hidden && active >= 0) pickAt(active);
      else if (input.value.trim()) pick(input.value);
    } else if (e.key === 'Escape') {
      open(false);
    } else if (e.key === 'Backspace' && !input.value && clearOnPick && !ime.composing) {
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
  // 一覧は <label> の中に置かれることがある。候補のクリックがラベルのクリックとして
  // 入力欄にフォーカスを戻し、一覧が開き直すのを防ぐ
  list.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}
