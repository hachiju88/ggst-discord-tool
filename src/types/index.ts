// Character型
export interface Character {
  id: number;
  name: string;
  name_en: string | null;
  display_order: number;
  created_at: string;
}

// User型
export interface User {
  discord_id: string;
  main_character: string | null; // 旧カラム（後方互換性）
  main_character_id: number | null; // 新カラム
  created_at: string;
  updated_at: string;
}

// Match型
export interface Match {
  id: number;
  user_discord_id: string;
  my_character: string | null; // 旧カラム（後方互換性）
  my_character_id: number | null; // 新カラム
  opponent_character: string; // 旧カラム（後方互換性）
  opponent_character_id: number; // 新カラム
  result: 'win' | 'loss' | null; // nullを許可（勝敗任意）
  defeat_reason_id: number | null;
  note: string | null;
  priority: 'critical' | 'important' | 'recommended' | null;
  match_date: string;
  created_at: string;
}

// Strategy型
export interface Strategy {
  id: number;
  user_discord_id: string;
  target_character: string; // 旧カラム（後方互換性）
  target_character_id: number; // 新カラム
  strategy_content: string;
  source: string;
  created_at: string;
  updated_at: string;
}

// CommonStrategy型
export interface CommonStrategy {
  id: number;
  target_character: string; // 旧カラム（後方互換性）
  target_character_id: number; // 新カラム
  strategy_content: string;
  created_by_discord_id: string;
  created_at: string;
  updated_at: string;
}

// DefeatReason型
export interface DefeatReason {
  id: number;
  user_discord_id: string;
  reason: string;
  created_at: string;
}

// CommonDefeatReason型
export interface CommonDefeatReason {
  id: number;
  reason: string;
  display_order: number;
  created_at: string;
}

// Combo型
export interface Combo {
  id: number;
  user_discord_id: string;
  character_id: number;
  location: 'center' | 'corner';
  tension_gauge: 0 | 50 | 100;
  starter: 'counter' | 'normal';
  combo_notation: string;
  damage: number | null;
  note: string | null;
  created_at: string;
}

// CharacterMove型
export interface CharacterMove {
  id: number;
  character_id: number;
  move_name: string;
  move_name_en: string | null;
  move_notation: string;
  move_type: string | null;
  created_at: string;
}

// MatchStats型（集計用）
export interface MatchStats {
  character: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}
