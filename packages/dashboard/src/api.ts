import {
  createMockApiKey,
  getMockApiKeys,
  getMockOverviewStats,
  getMockSettings,
  getMockTransactions,
  revokeMockApiKey,
  saveMockSettings,
} from './mock';
import type {
  ApiKeyListResult,
  ApiKeyRecord,
  CreateApiKeyInput,
  CreateApiKeyResult,
  OverviewStats,
  SettingsData,
  TransactionsResult,
} from './types';

export const API_BASE_URL =
  (import.meta.env.VITE_PAYRAIL_API_URL as string | undefined)?.trim() || 'http://127.0.0.1:3000';

class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function normalizeApiBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  baseUrl = API_BASE_URL,
): Promise<T> {
  const requestUrl = `${normalizeApiBaseUrl(baseUrl)}${path}`;

  let response: Response;
  try {
    response = await fetch(requestUrl, options);
  } catch (error) {
    throw new Error(`Unable to reach ${requestUrl}: ${(error as Error).message}`);
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const json = (await response.json()) as { error?: string; message?: string };
      message = json.message || json.error || message;
    } catch {
      // Ignore parsing failure and keep HTTP status text.
    }

    throw new HttpError(message, response.status);
  }

  return (await response.json()) as T;
}

function shouldUseMockFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (!(error instanceof HttpError)) {
    return true;
  }

  return [404, 405, 500, 501, 502, 503, 504].includes(error.status);
}

function buildAuthHeaders(managementApiKey: string): HeadersInit {
  if (!managementApiKey.trim()) {
    return {
      'content-type': 'application/json',
    };
  }

  return {
    'content-type': 'application/json',
    'x-api-key': managementApiKey.trim(),
  };
}

function parseNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function parseApiKeyRecord(input: Record<string, unknown>): ApiKeyRecord {
  return {
    id: String(input.id ?? ''),
    label: String(input.label ?? 'Unnamed key'),
    status: String(input.status ?? 'unknown'),
    createdAt: String(input.createdAt ?? new Date().toISOString()),
    lastUsedAt: input.lastUsedAt ? String(input.lastUsedAt) : null,
  };
}

interface UsagePayload {
  requestCount: number;
  totalUsdcReceived: number | string;
  updatedAt?: string;
}

interface DashboardOverviewPayload {
  totalRequestsToday?: number;
  usdcEarnedToday?: number;
  successRate?: number;
  updatedAt?: string;
}

export async function fetchOverviewStats(managementApiKey: string): Promise<OverviewStats> {
  try {
    const payload = await requestJson<DashboardOverviewPayload>('/api/dashboard/overview', {
      headers: buildAuthHeaders(managementApiKey),
    });

    return {
      totalRequestsToday: parseNumberValue(payload.totalRequestsToday),
      usdcEarnedToday: parseNumberValue(payload.usdcEarnedToday),
      successRate: parseNumberValue(payload.successRate),
      updatedAt: String(payload.updatedAt ?? new Date().toISOString()),
      source: 'api',
    };
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error;
    }
  }

  if (managementApiKey.trim()) {
    try {
      const usage = await requestJson<UsagePayload>(
        `/api/usage/${encodeURIComponent(managementApiKey.trim())}`,
      );

      return {
        totalRequestsToday: parseNumberValue(usage.requestCount),
        usdcEarnedToday: parseNumberValue(usage.totalUsdcReceived),
        successRate: 100,
        updatedAt: usage.updatedAt ?? new Date().toISOString(),
        source: 'api',
        note: 'Using /api/usage/:apiKey as a temporary fallback until /api/dashboard/overview is available.',
      };
    } catch (error) {
      if (!shouldUseMockFallback(error)) {
        throw error;
      }
    }
  }

  return getMockOverviewStats();
}

interface TransactionsPayload {
  transactions?: Array<{
    id?: string;
    txHash?: string;
    amountUsdc?: number | string;
    status?: string;
    timestamp?: string;
  }>;
}

export async function fetchTransactions(managementApiKey: string): Promise<TransactionsResult> {
  try {
    const payload = await requestJson<TransactionsPayload>('/api/transactions', {
      headers: buildAuthHeaders(managementApiKey),
    });

    if (!Array.isArray(payload.transactions)) {
      throw new Error('Transactions payload is invalid.');
    }

    return {
      transactions: payload.transactions.map((transaction) => ({
        id: String(transaction.id ?? crypto.randomUUID()),
        txHash: String(transaction.txHash ?? ''),
        amountUsdc: parseNumberValue(transaction.amountUsdc),
        status: String(transaction.status ?? 'pending') as 'verified' | 'pending' | 'failed',
        timestamp: String(transaction.timestamp ?? new Date().toISOString()),
      })),
      source: 'api',
    };
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error;
    }

    return getMockTransactions();
  }
}

interface ApiKeysResponsePayload {
  keys: Array<Record<string, unknown>>;
}

export async function fetchApiKeys(managementApiKey: string): Promise<ApiKeyListResult> {
  if (!managementApiKey.trim()) {
    throw new Error('Enter a management API key to list keys.');
  }

  try {
    const payload = await requestJson<ApiKeysResponsePayload>('/api/keys', {
      headers: buildAuthHeaders(managementApiKey),
    });

    return {
      keys: payload.keys.map(parseApiKeyRecord),
      source: 'api',
    };
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error;
    }

    return getMockApiKeys();
  }
}

interface CreateApiKeyResponsePayload {
  id: string;
  label?: string | null;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  apiKey: string;
}

export async function createApiKey(
  input: CreateApiKeyInput,
  managementApiKey: string,
): Promise<CreateApiKeyResult> {
  const payload = {
    developerName: input.developerName.trim(),
    developerEmail: input.developerEmail.trim() || undefined,
    walletAddress: input.walletAddress.trim(),
    label: input.label.trim() || undefined,
  };

  try {
    const created = await requestJson<CreateApiKeyResponsePayload>('/api/keys', {
      method: 'POST',
      headers: buildAuthHeaders(managementApiKey),
      body: JSON.stringify(payload),
    });

    return {
      key: {
        id: created.id,
        label: created.label ?? 'Generated key',
        status: created.status,
        createdAt: created.createdAt,
        lastUsedAt: created.lastUsedAt,
      },
      plaintextApiKey: created.apiKey,
      source: 'api',
    };
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error;
    }

    return createMockApiKey(input);
  }
}

export async function revokeApiKey(keyId: string, managementApiKey: string): Promise<ApiKeyListResult> {
  if (!managementApiKey.trim()) {
    throw new Error('Enter a management API key to revoke keys.');
  }

  try {
    await requestJson(`/api/keys/${keyId}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(managementApiKey),
    });

    return fetchApiKeys(managementApiKey);
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error;
    }

    return revokeMockApiKey(keyId);
  }
}

interface SettingsApiPayload {
  walletAddress?: string;
  settlementSchedule?: 'hourly' | 'daily' | 'weekly';
}

export async function fetchSettings(managementApiKey: string): Promise<SettingsData> {
  try {
    const payload = await requestJson<SettingsApiPayload>('/api/settings', {
      headers: buildAuthHeaders(managementApiKey),
    });

    return {
      walletAddress: String(payload.walletAddress ?? ''),
      settlementSchedule: payload.settlementSchedule ?? 'daily',
      source: 'api',
    };
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error;
    }

    return getMockSettings();
  }
}

export async function saveSettings(
  settings: Omit<SettingsData, 'source' | 'note'>,
  managementApiKey: string,
): Promise<SettingsData> {
  try {
    const payload = await requestJson<SettingsApiPayload>('/api/settings', {
      method: 'PUT',
      headers: buildAuthHeaders(managementApiKey),
      body: JSON.stringify(settings),
    });

    return {
      walletAddress: String(payload.walletAddress ?? settings.walletAddress),
      settlementSchedule: payload.settlementSchedule ?? settings.settlementSchedule,
      source: 'api',
    };
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error;
    }

    return saveMockSettings({
      ...settings,
      source: 'mock',
    });
  }
}
