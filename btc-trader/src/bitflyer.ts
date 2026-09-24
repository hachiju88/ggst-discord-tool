import crypto from 'node:crypto';

const BASE_URL = 'https://api.bitflyer.com';

export interface Ticker {
  product_code: string;
  timestamp: string;
  best_bid: number;
  best_ask: number;
  ltp: number;
  volume_by_product: number;
}

export interface Balance {
  currency_code: string;
  amount: number;
  available: number;
}

export type HealthStatus = 'NORMAL' | 'BUSY' | 'VERY BUSY' | 'SUPER BUSY' | 'NO ORDER' | 'STOP';

export interface ChildOrder {
  child_order_acceptance_id: string;
  child_order_state: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'EXPIRED' | 'REJECTED';
  side: 'BUY' | 'SELL';
  average_price: number;
  executed_size: number;
  total_commission: number;
}

/** 署名文字列: timestamp + method + path(クエリ込み) + body を HMAC-SHA256 */
export function signRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  return crypto.createHmac('sha256', secret).update(timestamp + method + path + body).digest('hex');
}

export class BitflyerClient {
  constructor(
    private readonly apiKey?: string,
    private readonly apiSecret?: string,
  ) {}

  private async request<T>(method: 'GET' | 'POST', path: string, body?: object, auth = false): Promise<T> {
    const bodyText = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (auth) {
      if (!this.apiKey || !this.apiSecret) {
        throw new Error('bitFlyer の API キーが設定されていません');
      }
      const timestamp = Date.now().toString();
      headers['ACCESS-KEY'] = this.apiKey;
      headers['ACCESS-TIMESTAMP'] = timestamp;
      headers['ACCESS-SIGN'] = signRequest(this.apiSecret, timestamp, method, path, bodyText);
    }

    const res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: method === 'POST' ? bodyText : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`bitFlyer API ${method} ${path} 失敗 (${res.status}): ${text}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  getTicker(productCode: string): Promise<Ticker> {
    return this.request('GET', `/v1/ticker?product_code=${productCode}`);
  }

  async getHealth(productCode: string): Promise<HealthStatus> {
    const res = await this.request<{ status: HealthStatus }>('GET', `/v1/gethealth?product_code=${productCode}`);
    return res.status;
  }

  getBalances(): Promise<Balance[]> {
    return this.request('GET', '/v1/me/getbalance', undefined, true);
  }

  async getCommissionRate(productCode: string): Promise<number> {
    const res = await this.request<{ commission_rate: number }>(
      'GET',
      `/v1/me/gettradingcommission?product_code=${productCode}`,
      undefined,
      true,
    );
    return res.commission_rate;
  }

  async sendMarketOrder(productCode: string, side: 'BUY' | 'SELL', size: number): Promise<string> {
    const res = await this.request<{ child_order_acceptance_id: string }>(
      'POST',
      '/v1/me/sendchildorder',
      {
        product_code: productCode,
        child_order_type: 'MARKET',
        side,
        size: Number(size.toFixed(8)),
        time_in_force: 'GTC',
      },
      true,
    );
    return res.child_order_acceptance_id;
  }

  async getChildOrder(productCode: string, acceptanceId: string): Promise<ChildOrder | undefined> {
    const orders = await this.request<ChildOrder[]>(
      'GET',
      `/v1/me/getchildorders?product_code=${productCode}&child_order_acceptance_id=${acceptanceId}`,
      undefined,
      true,
    );
    return orders[0];
  }
}
