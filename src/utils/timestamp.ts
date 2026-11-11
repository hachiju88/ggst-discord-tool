// puddle.farm の /ratings は chrono::NaiveDateTime の to_string() をそのまま返すため
// "2026-11-05 03:12:45" や "2026-11-05 03:12:45.123456" のような
// 「タイムゾーン無し・スペース区切り」の UTC 時刻になる。
// これを JS の new Date() に渡すとローカル時刻として解釈され(JST 環境では 9 時間ずれる)、
// また DB 上で ISO 文字列(…T…Z)と文字列比較した際に期間フィルタが崩れるため、
// 保存前に必ず ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS.sssZ) へ正規化する。
//
// TZ 無しの文字列は常に UTC として扱う。想定外の形式は new Date() に任せると
// ローカル時刻解釈でずれるため、フォールバックせず null を返す。
export function normalizeTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!m) return null;
  const [, date, hm, frac = '', tz] = m;
  const time = hm.length === 5 ? `${hm}:00` : hm;
  const ms = (frac + '000').slice(0, 3);
  let zone = tz ?? 'Z';
  if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const d = new Date(`${date}T${time}.${ms}${zone}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
