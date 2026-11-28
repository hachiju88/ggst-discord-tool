/**
 * 本文の `![タイトル](動画URL)` を、その位置の動画プレイヤーにする。
 * 1つの段落に動画だけが並んでいるときに置き換える（続けて書いた動画は横に並ぶ）。
 * プレイヤーの見た目・動きは VideoPlayer.astro と同じ（再生は scripts/player.ts）。
 * remarkEscapeHtml の後に動かすこと（ここで作る HTML を文字にされないように）。
 */
import { parseVideo, youtubeThumb, BODY_VIDEO_URL, type Video } from './video';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LABEL = { youtube: 'YouTube', x: 'X', file: 'VIDEO' } as const;

function player(v: Exclude<Video, { type: 'link' }>): string {
  const src = v.type === 'youtube' ? v.id : v.url;
  const start = v.type === 'youtube' ? ` data-start="${v.start}"` : '';
  const inner =
    v.type === 'youtube'
      ? `<img src="${esc(youtubeThumb(v.id))}" alt="" loading="lazy" onerror="this.remove()">`
      : v.type === 'file'
        ? `<video src="${esc(v.url)}#t=0.1" preload="metadata" muted playsinline tabindex="-1"></video>`
        : '<span class="x-mark" aria-hidden="true">𝕏</span>';
  const label = esc(`${v.title ?? '動画'}を再生`);
  return (
    `<figure class="player player-page ${v.type}">` +
    `<button type="button" class="player-facade" data-player data-type="${v.type}" data-src="${esc(src)}"${start} data-mode="page" aria-label="${label}">` +
    `${inner}<span class="player-play" aria-hidden="true"></span><span class="player-badge">${LABEL[v.type]}</span></button>` +
    (v.title ? `<figcaption>${esc(v.title)}</figcaption>` : '') +
    `</figure>`
  );
}

function videoOf(node: any): Exclude<Video, { type: 'link' }> | undefined {
  if (node?.type !== 'image' || typeof node.url !== 'string' || !BODY_VIDEO_URL.test(node.url)) return;
  const v = parseVideo({ url: node.url, title: node.alt?.trim() || undefined });
  return v.type === 'link' ? undefined : v;
}

const blank = (n: any) => n.type === 'break' || (n.type === 'text' && !n.value.trim());

export default function remarkVideo() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node.children) return;
      node.children = node.children.map((child: any) => {
        if (child.type === 'paragraph') {
          const items = child.children.filter((c: any) => !blank(c));
          const vids = items.map(videoOf);
          if (items.length && vids.every(Boolean)) {
            const multi = vids.length > 1 ? ' multi' : '';
            return { type: 'html', value: `<div class="videos body-videos not-content${multi}">${vids.map((v: any) => player(v)).join('')}</div>` };
          }
          return child;
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}
