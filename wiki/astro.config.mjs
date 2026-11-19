// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import remarkEscapeHtml from './src/lib/remark-escape-html.mjs';

const positioned = (dir, label) => ({
  label,
  collapsed: false,
  items: [
    { label: '一覧・絞り込み', link: `/${dir}/` },
    { label: '画面中央', collapsed: true, items: [{ autogenerate: { directory: `${dir}/center` } }] },
    { label: '画面端', collapsed: true, items: [{ autogenerate: { directory: `${dir}/corner` } }] },
  ],
});

const simple = (dir, label) => ({
  label,
  collapsed: true,
  items: [{ autogenerate: { directory: dir } }],
});

export default defineConfig({
  // 本文中の生HTMLは文字として表示（XSS対策）
  markdown: { remarkPlugins: [remarkEscapeHtml] },
  integrations: [
    starlight({
      title: 'BRIDGET LAB',
      description: 'ブリジット攻略wiki',
      defaultLocale: 'root',
      locales: { root: { label: '日本語', lang: 'ja' } },
      // 検索エンジンに載せない
      head: [
        { tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow, noarchive' } },
        // スクロールで出す要素を最初の描画前に隠しておく（後から隠すとちらつくため）
        {
          tag: 'script',
          content: "if ('IntersectionObserver' in window) document.documentElement.classList.add('js-place');",
        },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=VT323&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap',
          },
        },
      ],
      favicon: '/favicon.png',
      customCss: ['./src/styles/theme.css'],
      routeMiddleware: './src/route-middleware.ts',
      components: {
        PageTitle: './src/components/overrides/PageTitle.astro',
        MarkdownContent: './src/components/overrides/MarkdownContent.astro',
      },
      lastUpdated: false,
      sidebar: [
        {
          label: 'はじめに',
          items: [
            { label: 'トップ', link: '/' },
            { label: '全記事から探す', link: '/articles/' },
            { label: '★ お気に入り', link: '/articles/?fav=1' },
            { label: '＋ 記事を書く', link: '/edit/' },
          ],
        },
        simple('basics', '基本戦略'),
        simple('neutral', '立ち回り'),
        positioned('combos', 'コンボ'),
        positioned('okizeme', '起き攻め'),
        positioned('setplay', 'セットプレイ'),
        simple('matchups', 'キャラ対策'),
        simple('training', '練習方法'),
        simple('faq', 'Q&A'),
      ],
    }),
  ],
});
