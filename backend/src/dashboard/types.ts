import { Progress } from '../routes/learning/types.js';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  date: Date;
  type: 'certificate' | 'badge' | 'reward';
  hash?: string;
  did?: string | null;
}

export interface TokenBalance {
  symbol: string;
  balance: number;
  lastUpdated: Date;
}

export interface StudentDashboard {
  userId: string;
  progress: Progress;
  certificates: Achievement[];
  tokenBalance: TokenBalance;
  recentActivity: string[];
  studentDid?: string | null;
}
