import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  API_BASE_URL,
  createApiKey,
  fetchApiKeys,
  fetchOverviewStats,
  fetchSettings,
  fetchTransactions,
  revokeApiKey,
  saveSettings,
} from './api';
import type {
  ApiKeyListResult,
  CreateApiKeyInput,
  OverviewStats,
  SettingsData,
  TransactionsResult,
} from './types';

type DashboardPage = 'overview' | 'transactions' | 'keys' | 'settings';

const dashboardPages: Array<{ id: DashboardPage; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'keys', label: 'API Keys' },
  { id: 'settings', label: 'Settings' },
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error occurred.';
}

function formatUsdc(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '—';
  }

  return parsedDate.toLocaleString();
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) {
    return hash;
  }

  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function SourceBadge({ source }: { source: 'api' | 'mock' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        source === 'api'
          ? 'bg-emerald-500/20 text-emerald-200'
          : 'bg-amber-500/20 text-amber-100'
      }`}
    >
      {source === 'api' ? 'Live API' : 'Mock fallback'}
    </span>
  );
}

export default function DashboardApp() {
  const [activePage, setActivePage] = useState<DashboardPage>('overview');
  const [managementKeyDraft, setManagementKeyDraft] = useState('');
  const [managementApiKey, setManagementApiKey] = useState('');

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [transactions, setTransactions] = useState<TransactionsResult | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyListResult | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);

  const [settingsDraft, setSettingsDraft] = useState({
    walletAddress: '',
    settlementSchedule: 'daily' as 'hourly' | 'daily' | 'weekly',
  });

  const [newKeyInput, setNewKeyInput] = useState<CreateApiKeyInput>({
    developerName: 'PayRail Developer',
    developerEmail: '',
    walletAddress: '0x1111111111111111111111111111111111111111',
    label: 'Primary key',
  });

  const [newlyCreatedApiKey, setNewlyCreatedApiKey] = useState<string | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isCreatingApiKey, setIsCreatingApiKey] = useState(false);

  const hasManagementKey = useMemo(() => managementApiKey.trim().length > 0, [managementApiKey]);

  const loadOverview = useCallback(async () => {
    setIsLoadingOverview(true);
    try {
      const nextOverview = await fetchOverviewStats(managementApiKey);
      setOverview(nextOverview);
    } catch (error) {
      setErrorMessage(`Overview failed: ${toErrorMessage(error)}`);
    } finally {
      setIsLoadingOverview(false);
    }
  }, [managementApiKey]);

  const loadTransactionsData = useCallback(async () => {
    setIsLoadingTransactions(true);
    try {
      const nextTransactions = await fetchTransactions(managementApiKey);
      setTransactions(nextTransactions);
    } catch (error) {
      setErrorMessage(`Transactions failed: ${toErrorMessage(error)}`);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [managementApiKey]);

  const loadApiKeys = useCallback(async () => {
    setIsLoadingApiKeys(true);
    try {
      const nextApiKeys = await fetchApiKeys(managementApiKey);
      setApiKeys(nextApiKeys);
    } catch (error) {
      setApiKeys(null);
      setErrorMessage(`API keys failed: ${toErrorMessage(error)}`);
    } finally {
      setIsLoadingApiKeys(false);
    }
  }, [managementApiKey]);

  const loadSettingsData = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const nextSettings = await fetchSettings(managementApiKey);
      setSettings(nextSettings);
      setSettingsDraft({
        walletAddress: nextSettings.walletAddress,
        settlementSchedule: nextSettings.settlementSchedule,
      });
    } catch (error) {
      setErrorMessage(`Settings failed: ${toErrorMessage(error)}`);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [managementApiKey]);

  useEffect(() => {
    void loadOverview();
    void loadTransactionsData();
    void loadSettingsData();
  }, [loadOverview, loadTransactionsData, loadSettingsData]);

  useEffect(() => {
    if (!hasManagementKey) {
      setApiKeys(null);
      return;
    }

    void loadApiKeys();
  }, [hasManagementKey, loadApiKeys]);

  const applyManagementKey = () => {
    setErrorMessage(null);
    setLastActionMessage(null);
    setManagementApiKey(managementKeyDraft.trim());
  };

  const refreshData = async () => {
    setErrorMessage(null);
    setLastActionMessage(null);

    await Promise.all([loadOverview(), loadTransactionsData(), loadSettingsData()]);
    if (hasManagementKey) {
      await loadApiKeys();
    }
  };

  const handleCreateApiKey = async () => {
    setErrorMessage(null);
    setLastActionMessage(null);
    setIsCreatingApiKey(true);

    try {
      const created = await createApiKey(newKeyInput, managementApiKey);
      setNewlyCreatedApiKey(created.plaintextApiKey);

      if (!hasManagementKey) {
        setManagementKeyDraft(created.plaintextApiKey);
        setManagementApiKey(created.plaintextApiKey);
      }

      setLastActionMessage(
        created.source === 'api'
          ? 'API key created through server API.'
          : 'API key created in mock fallback mode.',
      );

      await loadApiKeys();
    } catch (error) {
      setErrorMessage(`Create key failed: ${toErrorMessage(error)}`);
    } finally {
      setIsCreatingApiKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    setErrorMessage(null);
    setLastActionMessage(null);

    try {
      const nextApiKeys = await revokeApiKey(keyId, managementApiKey);
      setApiKeys(nextApiKeys);
      setLastActionMessage(
        nextApiKeys.source === 'api'
          ? 'API key revoked through server API.'
          : 'API key revoked in mock fallback mode.',
      );
    } catch (error) {
      setErrorMessage(`Revoke key failed: ${toErrorMessage(error)}`);
    }
  };

  const handleSaveSettings = async () => {
    setErrorMessage(null);
    setLastActionMessage(null);
    setIsSavingSettings(true);

    try {
      const nextSettings = await saveSettings(settingsDraft, managementApiKey);
      setSettings(nextSettings);
      setLastActionMessage(
        nextSettings.source === 'api'
          ? 'Settings saved through server API.'
          : 'Settings saved in mock fallback mode.',
      );
    } catch (error) {
      setErrorMessage(`Save settings failed: ${toErrorMessage(error)}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-950">
      <div className="mx-auto w-full max-w-6xl p-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/40">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">PayRail</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Developer Dashboard v1</h1>
              <p className="mt-2 text-sm text-slate-300">
                API-first dashboard with explicit fallback mocks for missing backend resources.
              </p>
            </div>

            <div className="w-full max-w-xl space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300" htmlFor="management-key-input">
                  Management API key
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="management-key-input"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                    value={managementKeyDraft}
                    onChange={(event) => setManagementKeyDraft(event.target.value)}
                    placeholder="payrail_live_..."
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
                    onClick={applyManagementKey}
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>Server base URL: {API_BASE_URL}</span>
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs font-medium text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
                  onClick={() => {
                    void refreshData();
                  }}
                >
                  Refresh all
                </button>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <p className="mt-4 rounded-md border border-rose-900/80 bg-rose-950/40 p-3 text-sm text-rose-100">
              {errorMessage}
            </p>
          ) : null}

          {lastActionMessage ? (
            <p className="mt-4 rounded-md border border-emerald-900/80 bg-emerald-950/40 p-3 text-sm text-emerald-100">
              {lastActionMessage}
            </p>
          ) : null}
        </header>

        <nav className="mt-6 flex flex-wrap gap-2">
          {dashboardPages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activePage === page.id
                  ? 'bg-cyan-500 text-slate-950'
                  : 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-400'
              }`}
              onClick={() => setActivePage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>

        {activePage === 'overview' ? (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Usage overview</h2>
              {overview ? <SourceBadge source={overview.source} /> : null}
            </div>

            {isLoadingOverview || !overview ? (
              <p className="mt-4 text-sm text-slate-300">Loading overview data…</p>
            ) : (
              <>
                {overview.note ? (
                  <p className="mt-3 rounded-md border border-amber-900/60 bg-amber-900/20 p-3 text-xs text-amber-100">
                    {overview.note}
                  </p>
                ) : null}

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Requests today</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {new Intl.NumberFormat('en-US').format(overview.totalRequestsToday)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">USDC earned</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatUsdc(overview.usdcEarnedToday)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Success rate</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatPercent(overview.successRate)}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-slate-400">
                  Last refreshed: {formatDateTime(overview.updatedAt)}
                </p>
              </>
            )}
          </section>
        ) : null}

        {activePage === 'transactions' ? (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Recent transactions</h2>
              {transactions ? <SourceBadge source={transactions.source} /> : null}
            </div>

            {isLoadingTransactions || !transactions ? (
              <p className="mt-4 text-sm text-slate-300">Loading transactions…</p>
            ) : (
              <>
                {transactions.note ? (
                  <p className="mt-3 rounded-md border border-amber-900/60 bg-amber-900/20 p-3 text-xs text-amber-100">
                    {transactions.note}
                  </p>
                ) : null}

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.12em] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Tx hash</th>
                        <th className="px-3 py-2 font-medium">Amount (USDC)</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-slate-200">
                      {transactions.transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-cyan-100">
                            {truncateHash(transaction.txHash)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {formatUsdc(transaction.amountUsdc)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 capitalize">
                            {transaction.status}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                            {formatDateTime(transaction.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        ) : null}

        {activePage === 'keys' ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">API key inventory</h2>
                {apiKeys ? <SourceBadge source={apiKeys.source} /> : null}
              </div>

              {!hasManagementKey ? (
                <p className="mt-4 rounded-md border border-amber-900/60 bg-amber-900/20 p-3 text-sm text-amber-100">
                  Enter a management API key (or create one below) to list and revoke keys.
                </p>
              ) : null}

              {isLoadingApiKeys ? (
                <p className="mt-4 text-sm text-slate-300">Loading API keys…</p>
              ) : null}

              {apiKeys?.note ? (
                <p className="mt-4 rounded-md border border-amber-900/60 bg-amber-900/20 p-3 text-xs text-amber-100">
                  {apiKeys.note}
                </p>
              ) : null}

              {apiKeys && apiKeys.keys.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.12em] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Label</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Created</th>
                        <th className="px-3 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-slate-200">
                      {apiKeys.keys.map((keyRecord) => (
                        <tr key={keyRecord.id}>
                          <td className="px-3 py-3">{keyRecord.label}</td>
                          <td className="px-3 py-3 capitalize">{keyRecord.status}</td>
                          <td className="px-3 py-3 text-slate-400">{formatDateTime(keyRecord.createdAt)}</td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              className="rounded-md border border-rose-800/80 px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => {
                                void handleRevokeApiKey(keyRecord.id);
                              }}
                              disabled={keyRecord.status !== 'active'}
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-base font-semibold text-white">Create API key</h3>
              <p className="mt-2 text-xs text-slate-400">
                Uses `POST /api/keys` when available; otherwise writes a local mock key for frontend flow
                validation.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block text-xs text-slate-300">
                  Developer name
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                    value={newKeyInput.developerName}
                    onChange={(event) =>
                      setNewKeyInput((current) => ({ ...current, developerName: event.target.value }))
                    }
                  />
                </label>

                <label className="block text-xs text-slate-300">
                  Developer email
                  <input
                    type="email"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                    value={newKeyInput.developerEmail}
                    onChange={(event) =>
                      setNewKeyInput((current) => ({ ...current, developerEmail: event.target.value }))
                    }
                  />
                </label>

                <label className="block text-xs text-slate-300">
                  Wallet address
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                    value={newKeyInput.walletAddress}
                    onChange={(event) =>
                      setNewKeyInput((current) => ({ ...current, walletAddress: event.target.value }))
                    }
                  />
                </label>

                <label className="block text-xs text-slate-300">
                  Key label
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                    value={newKeyInput.label}
                    onChange={(event) =>
                      setNewKeyInput((current) => ({ ...current, label: event.target.value }))
                    }
                  />
                </label>
              </div>

              <button
                type="button"
                className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  void handleCreateApiKey();
                }}
                disabled={isCreatingApiKey}
              >
                {isCreatingApiKey ? 'Creating…' : 'Create API key'}
              </button>

              {newlyCreatedApiKey ? (
                <div className="mt-4 rounded-lg border border-cyan-800/70 bg-cyan-950/30 p-3 text-xs text-cyan-100">
                  <p className="font-medium">Copy this API key now:</p>
                  <p className="mt-1 break-all font-mono">{newlyCreatedApiKey}</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activePage === 'settings' ? (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Settlement settings</h2>
              {settings ? <SourceBadge source={settings.source} /> : null}
            </div>

            {isLoadingSettings || !settings ? (
              <p className="mt-4 text-sm text-slate-300">Loading settings…</p>
            ) : (
              <>
                {settings.note ? (
                  <p className="mt-3 rounded-md border border-amber-900/60 bg-amber-900/20 p-3 text-xs text-amber-100">
                    {settings.note}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-4 md:max-w-2xl md:grid-cols-2">
                  <label className="block text-xs text-slate-300 md:col-span-2">
                    Payout wallet
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                      value={settingsDraft.walletAddress}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({ ...current, walletAddress: event.target.value }))
                      }
                    />
                  </label>

                  <label className="block text-xs text-slate-300">
                    Settlement schedule
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                      value={settingsDraft.settlementSchedule}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          settlementSchedule: event.target.value as 'hourly' | 'daily' | 'weekly',
                        }))
                      }
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    void handleSaveSettings();
                  }}
                  disabled={isSavingSettings}
                >
                  {isSavingSettings ? 'Saving…' : 'Save settings'}
                </button>
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
