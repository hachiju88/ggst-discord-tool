/** [data-player] を押したら実際の動画に差し替える */
let xLoading: Promise<void> | undefined;
function loadX() {
  return (xLoading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.append(s);
  }));
}

function play(btn: HTMLElement) {
  const { type, src = '', start = '0', mode } = btn.dataset;
  const card = mode === 'card';
  let el: HTMLElement;
  if (type === 'youtube') {
    const f = document.createElement('iframe');
    const q = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
    if (Number(start) > 0) q.set('start', start);
    if (card) q.set('mute', '1');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(src)}?${q}`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.title = 'YouTube';
    el = f;
  } else if (type === 'file') {
    const v = document.createElement('video');
    v.src = src;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    if (card) {
      v.muted = true;
      v.loop = true;
    }
    el = v;
  } else {
    const box = document.createElement('div');
    box.className = 'x-embed';
    const bq = document.createElement('blockquote');
    bq.className = 'twitter-tweet';
    bq.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const a = document.createElement('a');
    a.href = src;
    a.textContent = 'Xで見る';
    bq.append(a);
    box.append(bq);
    el = box;
    loadX().then(() => (window as any).twttr?.widgets?.load(box));
  }
  el.classList.add('player-live');
  btn.replaceWith(el);
}

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-player]');
  if (btn) {
    e.preventDefault();
    play(btn);
  }
});
