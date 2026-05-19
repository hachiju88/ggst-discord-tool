export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// Escape Discord markdown special characters so usernames don't break embed links.
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_~`|>\[\]()]/g, '\\$&');
}
