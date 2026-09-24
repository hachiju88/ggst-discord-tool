/** Discord Webhook への通知（未設定ならコンソールのみ） */
export async function notify(webhookUrl: string | undefined, title: string, lines: string[], color = 0x95a5a6) {
  const text = `**${title}**\n${lines.join('\n')}`;
  console.log(`\n${text.replace(/\*\*/g, '')}\n`);
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BTC Trader',
        embeds: [{ title, description: lines.join('\n').slice(0, 4000), color, timestamp: new Date().toISOString() }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(`[notify] Discord 通知失敗 (${res.status}): ${await res.text()}`);
  } catch (e) {
    console.warn('[notify] Discord 通知失敗:', e);
  }
}

export const COLORS = { BUY: 0x2ecc71, SELL: 0xe74c3c, HOLD: 0x95a5a6, ERROR: 0xf39c12 } as const;
