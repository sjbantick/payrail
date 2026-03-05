import type {
  ApiKeyListResult,
  ApiKeyRecord,
  CreateApiKeyInput,
  CreateApiKeyResult,
  DashboardTransaction,
  OverviewStats,
  SettingsData,
  TransactionsResult,
} from './types';

const MOCK_KEY_STORAGE = 'payrail.dashboard.mock.api-keys';
const MOCK_SETTINGS_STORAGE = 'payrail.dashboard.mock.settings';

function readLocalStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function getDefaultMockKeys(): ApiKeyRecord[] {
  const nowIso = new Date().toISOString();

  return [
    {
      id: 'mock-key-primary',
      label: 'Primary key',
      status: 'active',
      createdAt: nowIso,
      lastUsedAt: nowIso,
    },
    {
      id: 'mock-key-internal',
      label: 'Internal integrations',
      status: 'revoked',
      createdAt: nowIso,
      lastUsedAt: null,
    },
  ];
}

function getDefaultSettings(): SettingsData {
  return {
    walletAddress: '0x1111111111111111111111111111111111111111',
    settlementSchedule: 'daily',
    source: 'mock',
    note: 'Settings endpoint is not available yet. Changes are saved locally in this browser.',
  };
}

function loadMockKeys(): ApiKeyRecord[] {
  const storedKeys = readLocalStorage<ApiKeyRecord[]>(MOCK_KEY_STORAGE);
  if (storedKeys && Array.isArray(storedKeys)) {
    return storedKeys;
  }

  const defaultKeys = getDefaultMockKeys();
  writeLocalStorage(MOCK_KEY_STORAGE, defaultKeys);
  return defaultKeys;
}

function saveMockKeys(keys: ApiKeyRecord[]): void {
  writeLocalStorage(MOCK_KEY_STORAGE, keys);
}

function generateMockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `mock-${Math.random().toString(36).slice(2, 12)}`;
}

function generateMockPlaintextApiKey(): string {
  const randomPart = Math.random().toString(36).slice(2, 14);
  return `payrail_mock_${randomPart}`;
}

export function getMockOverviewStats(): OverviewStats {
  const nowIso = new Date().toISOString();

  return {
    totalRequestsToday: 428,
    usdcEarnedToday: 185.32,
    successRate: 99.4,
    updatedAt: nowIso,
    source: 'mock',
    note: 'Overview endpoint unavailable. Showing representative mock dashboard metrics.',
  };
}

export function getMockTransactions(): TransactionsResult {
  const now = Date.now();

  const transactions: DashboardTransaction[] = [
    {
      id: 'mock-tx-1',
      txHash: '0x7fe31cb2272f8f22a0e6f9c38e1ca72f1f9a67fd3e4e84eecfdd54af1a45eb9d',
      amountUsdc: 4.5,
      status: 'verified',
      timestamp: new Date(now - 1000 * 60 * 8).toISOString(),
    },
    {
      id: 'mock-tx-2',
      txHash: '0x5827d7f331f0ab3f2c69cf53d8f83f81477cf6f2f305c9e7172f84af98a66141',
      amountUsdc: 2.0,
      status: 'verified',
      timestamp: new Date(now - 1000 * 60 * 41).toISOString(),
    },
    {
      id: 'mock-tx-3',
      txHash: '0x85eabf8ca9ad7dc62d7f4fd30008265f2d8eb1ab11bd0d7d3587ed4df7c2f77f',
      amountUsdc: 6.75,
      status: 'pending',
      timestamp: new Date(now - 1000 * 60 * 95).toISOString(),
    },
  ];

  return {
    transactions,
    source: 'mock',
    note: 'Transactions endpoint unavailable. Showing mock payment activity.',
  };
}

export function getMockApiKeys(): ApiKeyListResult {
  return {
    keys: loadMockKeys(),
    source: 'mock',
    note: 'API key endpoint unavailable. Keys are managed in local browser storage.',
  };
}

export function createMockApiKey(input: CreateApiKeyInput): CreateApiKeyResult {
  const plaintextApiKey = generateMockPlaintextApiKey();
  const key: ApiKeyRecord = {
    id: generateMockId(),
    label: input.label || 'Generated key',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  const keys = [key, ...loadMockKeys()];
  saveMockKeys(keys);

  return {
    key,
    plaintextApiKey,
    source: 'mock',
    note: 'Created in local mock mode because API key endpoint is unavailable.',
  };
}

export function revokeMockApiKey(keyId: string): ApiKeyListResult {
  const keys = loadMockKeys().map((key) =>
    key.id === keyId
      ? {
          ...key,
          status: 'revoked',
        }
      : key,
  );

  saveMockKeys(keys);

  return {
    keys,
    source: 'mock',
    note: 'Revoked in local mock mode because API key endpoint is unavailable.',
  };
}

export function getMockSettings(): SettingsData {
  const storedSettings = readLocalStorage<SettingsData>(MOCK_SETTINGS_STORAGE);
  if (!storedSettings) {
    const defaultSettings = getDefaultSettings();
    writeLocalStorage(MOCK_SETTINGS_STORAGE, defaultSettings);
    return defaultSettings;
  }

  return {
    ...storedSettings,
    source: 'mock',
    note: 'Settings endpoint unavailable. Displaying values saved in this browser.',
  };
}

export function saveMockSettings(settings: SettingsData): SettingsData {
  const nextSettings: SettingsData = {
    ...settings,
    source: 'mock',
    note: 'Settings saved locally because server endpoint is unavailable.',
  };

  writeLocalStorage(MOCK_SETTINGS_STORAGE, nextSettings);
  return nextSettings;
}
