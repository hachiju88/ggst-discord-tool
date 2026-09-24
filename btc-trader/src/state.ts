import fs from 'node:fs';
import path from 'node:path';
import type { NewsAnalysis } from './analyst';
import type { Portfolio } from './strategy';

export interface TradeRecord {
  at: string;
  mode: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  orderId?: string;
}

export interface State {
  lastTradeAt?: number;
  tradeDay?: string; // JST の YYYY-MM-DD
  tradesToday: number;
  news?: { analyzedAt: number; analysis: NewsAnalysis };
  paper?: Portfolio;
  trades: TradeRecord[];
}

export function jstDate(ms = Date.now()): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

export class Store {
  private readonly statePath: string;
  private readonly journalPath: string;

  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.statePath = path.join(dir, 'state.json');
    this.journalPath = path.join(dir, 'journal.jsonl');
  }

  load(): State {
    if (!fs.existsSync(this.statePath)) return { tradesToday: 0, trades: [] };
    const s = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as State;
    s.trades ??= [];
    if (s.tradeDay !== jstDate()) {
      s.tradeDay = jstDate();
      s.tradesToday = 0;
    }
    return s;
  }

  save(state: State): void {
    const tmp = this.statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, this.statePath);
  }

  journal(entry: object): void {
    fs.appendFileSync(this.journalPath, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  }
}
