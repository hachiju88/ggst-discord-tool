// User型
export interface User {
  discord_id: string;
  main_character: string | null;
  created_at: string;
  updated_at: string;
}

// Match型
export interface Match {
  id: number;
  user_discord_id: string;
  opponent_character: string;
  result: 'win' | 'loss';
  note: string | null;
  match_date: string;
  created_at: string;
}

// Strategy型
export interface Strategy {
  id: number;
  user_discord_id: string;
  target_character: string;
  strategy_content: string;
  source: string;
  created_at: string;
  updated_at: string;
}

// CommonStrategy型
export interface CommonStrategy {
  id: number;
  target_character: string;
  strategy_content: string;
  created_by_discord_id: string;
  created_at: string;
  updated_at: string;
}

// MatchStats型（集計用）
export interface MatchStats {
  character: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}
