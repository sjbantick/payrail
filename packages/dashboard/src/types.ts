export type DataSource = 'api' | 'mock';

export interface OverviewStats {
  totalRequestsToday: number;
  usdcEarnedToday: number;
  successRate: number;
  updatedAt: string;
  source: DataSource;
  note?: string;
}

export type TransactionStatus = 'verified' | 'pending' | 'failed';

export interface DashboardTransaction {
  id: string;
  txHash: string;
  amountUsdc: number;
  status: TransactionStatus;
  timestamp: string;
}

export interface TransactionsResult {
  transactions: DashboardTransaction[];
  source: DataSource;
  note?: string;
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiKeyListResult {
  keys: ApiKeyRecord[];
  source: DataSource;
  note?: string;
}

export interface CreateApiKeyInput {
  developerName: string;
  developerEmail: string;
  walletAddress: string;
  label: string;
}

export interface CreateApiKeyResult {
  key: ApiKeyRecord;
  plaintextApiKey: string;
  source: DataSource;
  note?: string;
}

export interface SettingsData {
  walletAddress: string;
  settlementSchedule: 'hourly' | 'daily' | 'weekly';
  source: DataSource;
  note?: string;
}
