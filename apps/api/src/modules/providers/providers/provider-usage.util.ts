import type { ProviderUsage } from "./provider-adapter";

export interface PartialProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  estimatedTokens?: boolean;
}

export function mergeProviderUsage(
  current: ProviderUsage | undefined,
  partial: PartialProviderUsage | undefined,
) {
  if (!partial) {
    return current;
  }

  const inputTokens = partial.inputTokens ?? current?.inputTokens ?? 0;
  const outputTokens = partial.outputTokens ?? current?.outputTokens ?? 0;
  const cacheReadTokens =
    partial.cacheReadTokens ?? current?.cacheReadTokens ?? 0;
  const cacheCreationTokens =
    partial.cacheCreationTokens ?? current?.cacheCreationTokens ?? 0;
  const reasoningTokens =
    partial.reasoningTokens ?? current?.reasoningTokens ?? 0;
  const totalTokens = normalizeTotalTokens(
    partial.totalTokens ?? current?.totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
  );

  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    cacheReadTokens === 0 &&
    cacheCreationTokens === 0 &&
    reasoningTokens === 0 &&
    totalTokens === 0
  ) {
    return current;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheCreationTokens > 0 ? { cacheCreationTokens } : {}),
    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
    ...(partial.estimatedTokens ?? current?.estimatedTokens
      ? { estimatedTokens: true }
      : {}),
  };
}

export function extractProviderUsage(data: unknown) {
  const candidates = usageCandidates(data);
  let usage: ProviderUsage | undefined;

  for (const candidate of candidates) {
    usage = mergeProviderUsage(usage, usageFromRecord(candidate));
  }

  return usage;
}

export function normalizeProviderUsage(usage: PartialProviderUsage | undefined) {
  if (!usage) {
    return undefined;
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheCreationTokens = usage.cacheCreationTokens ?? 0;
  const reasoningTokens = usage.reasoningTokens ?? 0;
  const totalTokens = normalizeTotalTokens(
    usage.totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
  );

  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    cacheReadTokens === 0 &&
    cacheCreationTokens === 0 &&
    reasoningTokens === 0 &&
    totalTokens === 0
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheCreationTokens > 0 ? { cacheCreationTokens } : {}),
    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
    ...(usage.estimatedTokens ? { estimatedTokens: true } : {}),
  };
}

export function numberValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : undefined;
  }
  return undefined;
}

export function recordValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function usageCandidates(value: unknown, depth = 0): Record<string, unknown>[] {
  const record = recordValue(value);
  if (!record || depth > 4) {
    return [];
  }

  const candidates = [record];
  for (const key of [
    "usage",
    "usage_metadata",
    "usageMetadata",
    "token_usage",
    "tokenUsage",
    "message",
    "delta",
    "response",
    "result",
  ]) {
    candidates.push(...usageCandidates(record[key], depth + 1));
  }

  return candidates;
}

function usageFromRecord(record: Record<string, unknown>) {
  const inputTokens = firstNumber([
    record.prompt_tokens,
    record.promptTokens,
    record.input_tokens,
    record.inputTokens,
    record.prompt_token_count,
    record.promptTokenCount,
    record.input_token_count,
    record.inputTokenCount,
  ]);
  const outputTokens = firstNumber([
    record.completion_tokens,
    record.completionTokens,
    record.output_tokens,
    record.outputTokens,
    record.candidates_token_count,
    record.candidatesTokenCount,
    record.output_token_count,
    record.outputTokenCount,
    record.generated_tokens,
    record.generatedTokens,
  ]);
  const cacheCreationInputTokens = firstNumber([
    record.cache_creation_input_tokens,
    record.cacheCreationInputTokens,
  ]);
  const cacheCreationDetailTokens = firstNumber([
    record.cache_creation_tokens,
    record.cacheCreationTokens,
    record.cached_creation_tokens,
    record.cachedCreationTokens,
  ]);
  const cacheReadInputTokens = firstNumber([
    record.cache_read_input_tokens,
    record.cacheReadInputTokens,
  ]);
  const cacheReadDetailTokens = firstNumber([
    record.cache_read_tokens,
    record.cacheReadTokens,
    record.cached_tokens,
    record.cachedTokens,
    record.prompt_cache_hit_tokens,
    record.promptCacheHitTokens,
  ]);
  const reasoningTokens = firstNumber([
    record.reasoning_tokens,
    record.reasoningTokens,
    record.thinking_tokens,
    record.thinkingTokens,
  ]);
  const nestedInputTokenDetails = recordValue(record.input_tokens_details);
  const nestedInputTokenDetailsCamel = recordValue(record.inputTokensDetails);
  const nestedPromptTokenDetails = recordValue(record.prompt_tokens_details);
  const nestedPromptTokenDetailsCamel = recordValue(record.promptTokensDetails);
  const nestedCompletionTokenDetails = recordValue(record.completion_tokens_details);
  const nestedCompletionTokenDetailsCamel = recordValue(
    record.completionTokensDetails,
  );
  const nestedCacheCreation = recordValue(record.cache_creation);
  const detailsCacheReadTokens = firstNumber([
    nestedInputTokenDetails?.cached_tokens,
    nestedInputTokenDetails?.cachedTokens,
    nestedPromptTokenDetails?.cached_tokens,
    nestedPromptTokenDetails?.cachedTokens,
    nestedInputTokenDetailsCamel?.cached_tokens,
    nestedInputTokenDetailsCamel?.cachedTokens,
    nestedPromptTokenDetailsCamel?.cached_tokens,
    nestedPromptTokenDetailsCamel?.cachedTokens,
  ]);
  const detailsCacheCreationTokens = firstNumber([
    nestedInputTokenDetails?.cached_creation_tokens,
    nestedInputTokenDetails?.cachedCreationTokens,
    nestedInputTokenDetails?.cache_creation_tokens,
    nestedInputTokenDetails?.cacheCreationTokens,
    nestedPromptTokenDetails?.cached_creation_tokens,
    nestedPromptTokenDetails?.cachedCreationTokens,
    nestedPromptTokenDetails?.cache_creation_tokens,
    nestedPromptTokenDetails?.cacheCreationTokens,
    nestedInputTokenDetailsCamel?.cached_creation_tokens,
    nestedInputTokenDetailsCamel?.cachedCreationTokens,
    nestedInputTokenDetailsCamel?.cache_creation_tokens,
    nestedInputTokenDetailsCamel?.cacheCreationTokens,
    nestedPromptTokenDetailsCamel?.cached_creation_tokens,
    nestedPromptTokenDetailsCamel?.cachedCreationTokens,
    nestedPromptTokenDetailsCamel?.cache_creation_tokens,
    nestedPromptTokenDetailsCamel?.cacheCreationTokens,
    nestedCacheCreation?.ephemeral_5m_input_tokens,
    nestedCacheCreation?.ephemeral5mInputTokens,
    nestedCacheCreation?.ephemeral_1h_input_tokens,
    nestedCacheCreation?.ephemeral1hInputTokens,
  ]);
  const detailsReasoningTokens = firstNumber([
    nestedCompletionTokenDetails?.reasoning_tokens,
    nestedCompletionTokenDetails?.reasoningTokens,
    nestedCompletionTokenDetailsCamel?.reasoning_tokens,
    nestedCompletionTokenDetailsCamel?.reasoningTokens,
  ]);
  const cacheReadTokens =
    cacheReadInputTokens ?? cacheReadDetailTokens ?? detailsCacheReadTokens;
  const cacheCreationTokens =
    cacheCreationInputTokens ??
    cacheCreationDetailTokens ??
    detailsCacheCreationTokens;
  const cacheTokensExcludedFromInput =
    cacheReadInputTokens !== undefined || cacheCreationInputTokens !== undefined;
  const totalTokens =
    firstNumber([
      record.total_tokens,
      record.totalTokens,
      record.total_token_count,
      record.totalTokenCount,
      record.token_count,
      record.tokenCount,
      record.tokens,
    ]) ??
    sumTokens([
      inputTokens,
      outputTokens,
      cacheTokensExcludedFromInput ? cacheCreationTokens : undefined,
      cacheTokensExcludedFromInput ? cacheReadTokens : undefined,
    ]);

  return normalizeProviderUsage({
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheCreationTokens,
    reasoningTokens: reasoningTokens ?? detailsReasoningTokens,
  });
}

function firstNumber(values: unknown[]) {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== undefined) {
      return number;
    }
  }
  return undefined;
}

function sumTokens(values: Array<number | undefined>) {
  let total = 0;
  let hasValue = false;

  for (const value of values) {
    if (value !== undefined) {
      total += value;
      hasValue = true;
    }
  }

  return hasValue ? total : undefined;
}

function normalizeTotalTokens(
  value: number | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheCreationTokens = 0,
) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
}
