export const TOKEN_FIELDS = ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'cachedContentTokenCount', 'toolUsePromptTokenCount', 'totalTokenCount'] as const;
type TokenField = typeof TOKEN_FIELDS[number];
export type TokenCounts = Record<TokenField, number | null>;
export type UsageCall = { id: string; model: string; documentId: string; section: number; attempt: number; at: string; requestFailed: boolean; tokens: TokenCounts };
export type UsageSummary = { model: string; startedAt: string; updatedAt: string; calls: number; retries: number; failedRequests: number; missingUsageCalls: number; tokens: TokenCounts; reportedCalls: Record<TokenField, number> };
export function tokenCounts(metadata: Partial<Record<TokenField, number>> | undefined): TokenCounts {
  return Object.fromEntries(TOKEN_FIELDS.map(key => [key, Number.isSafeInteger(metadata?.[key]) && metadata![key]! >= 0 ? metadata![key] : null])) as TokenCounts;
}
export function emptyUsage(model: string, startedAt: string): UsageSummary {
  return { model, startedAt, updatedAt: startedAt, calls: 0, retries: 0, failedRequests: 0, missingUsageCalls: 0,
    tokens: tokenCounts(undefined), reportedCalls: Object.fromEntries(TOKEN_FIELDS.map(key => [key, 0])) as Record<TokenField, number> };
}
export function addUsage(summary: UsageSummary, call: UsageCall): UsageSummary {
  const next = { ...summary, tokens: { ...summary.tokens }, reportedCalls: { ...summary.reportedCalls } };
  next.calls++; next.retries += Number(call.attempt > 1); next.failedRequests += Number(call.requestFailed);
  next.missingUsageCalls += Number(call.tokens.totalTokenCount === null);
  next.updatedAt = call.at > next.updatedAt ? call.at : next.updatedAt;
  for (const key of TOKEN_FIELDS) if (call.tokens[key] !== null) {
    next.tokens[key] = (next.tokens[key] ?? 0) + call.tokens[key]!;
    next.reportedCalls[key]++;
  }
  // Use Gemini's total. Cached input is a subset of prompt tokens, not an addition.
  return next;
}
export interface UsageLedger {
  list(): Promise<UsageCall[]>;
  saveCall(call: UsageCall): Promise<UsageCall>;
  saveSummary(summary: UsageSummary): Promise<void>;
}
export class UsageTracker {
  private seen = new Set<string>();
  summary: UsageSummary;
  constructor(private ledger: UsageLedger, model: string, startedAt: string) { this.summary = emptyUsage(model, startedAt); }
  async load() {
    for (const call of await this.ledger.list()) this.include(call);
    await this.ledger.saveSummary(this.summary);
  }
  private include(call: UsageCall) {
    if (this.seen.has(call.id)) return;
    this.summary = addUsage(this.summary, call); this.seen.add(call.id);
  }
  async record(call: UsageCall) {
    this.include(await this.ledger.saveCall(call));
    await this.ledger.saveSummary(this.summary);
  }
}
