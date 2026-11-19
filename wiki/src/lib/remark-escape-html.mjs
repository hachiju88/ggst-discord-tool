/**
 * Markdown 本文に書かれた生の HTML をタグとして扱わず、文字としてそのまま表示する。
 * フォームから誰でも記事を書けるため、<script> や onerror= などによる XSS を根本から防ぐ。
 * （Starlight の :::note などの記法は HTML ではないので影響しない）
 */
export default function remarkEscapeHtml() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (const child of node.children) {
        if (child.type === 'html') {
          child.type = 'text';
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
