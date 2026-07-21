// OpenAI Standard API pricing (USD per 1M tokens).
// Source: https://developers.openai.com/api/docs/pricing (Standard tier)
// cacheWrite: billed rate for cache_write_tokens (GPT-5.6+). Omit for models with no cache-write surcharge.

const DEFAULT_USD_TO_EUR = 0.87;

const MODEL_PRICING = {
  "gpt-5.6-sol": { input: 5, cached: 0.5, cacheWrite: 6.25, output: 30, cacheWritePremium: true },
  "gpt-5.6-terra": { input: 2.5, cached: 0.25, cacheWrite: 3.125, output: 15, cacheWritePremium: true },
  "gpt-5.6-luna": { input: 1, cached: 0.1, cacheWrite: 1.25, output: 6, cacheWritePremium: true },
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.5-pro": { input: 30, output: 180 },
  "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cached: 0.02, output: 1.25 },
  "gpt-5.4-pro": { input: 30, output: 180 },
  "gpt-5.2": { input: 1.75, cached: 0.175, output: 14 },
  "gpt-5.2-pro": { input: 21, output: 168 },
  "gpt-5.1": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cached: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cached: 0.005, output: 0.4 },
  "gpt-5-pro": { input: 15, output: 120 },
  "gpt-4.1": { input: 2, cached: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cached: 0.025, output: 0.4 },
  "gpt-4o": { input: 2.5, cached: 1.25, output: 10 },
  "gpt-4o-2024-05-13": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.6 },
  "o1": { input: 15, cached: 7.5, output: 60 },
  "o1-pro": { input: 150, output: 600 },
  "o3-pro": { input: 20, output: 80 },
  "o3": { input: 2, cached: 0.5, output: 8 },
  "o4-mini": { input: 1.1, cached: 0.275, output: 4.4 },
  "o3-mini": { input: 1.1, cached: 0.55, output: 4.4 },
  "o1-mini": { input: 1.1, cached: 0.55, output: 4.4 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4-turbo-2024-04-09": { input: 10, output: 30 },
  "gpt-4-0125-preview": { input: 10, output: 30 },
  "gpt-4-1106-preview": { input: 10, output: 30 },
  "gpt-4-1106-vision-preview": { input: 10, output: 30 },
  "gpt-4-0613": { input: 30, output: 60 },
  "gpt-4-0314": { input: 30, output: 60 },
  "gpt-4-32k": { input: 60, output: 120 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "gpt-3.5-turbo-0125": { input: 0.5, output: 1.5 },
  "gpt-3.5-turbo-1106": { input: 1, output: 2 },
  "gpt-3.5-turbo-0613": { input: 1.5, output: 2 },
  "gpt-3.5-0301": { input: 1.5, output: 2 },
  "gpt-3.5-turbo-instruct": { input: 1.5, output: 2 },
  "gpt-3.5-turbo-16k-0613": { input: 3, output: 4 },
  "davinci-002": { input: 2, output: 2 },
  "babbage-002": { input: 0.4, output: 0.4 }
};

const PRICING_KEYS_SORTED = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);

function stripModelSuffix(model) {
  return model
    .toLowerCase()
    .trim()
    .replace(/\s*\(<[^>]+>\)\s*$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}-preview$/, "");
}

function resolveModelPricing(model) {
  if (!model || typeof model !== "string") return null;

  const candidates = [model, stripModelSuffix(model)];
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().trim();
    if (MODEL_PRICING[normalized]) {
      return { key: normalized, ...MODEL_PRICING[normalized] };
    }
  }

  const normalized = stripModelSuffix(model);
  for (const key of PRICING_KEYS_SORTED) {
    if (normalized === key || normalized.startsWith(`${key}-`)) {
      return { key, ...MODEL_PRICING[key] };
    }
  }

  return null;
}

function clampCachedTokens(inputTokens, cachedTokens) {
  const input = typeof inputTokens === "number" && inputTokens > 0 ? inputTokens : 0;
  const cached = typeof cachedTokens === "number" && cachedTokens > 0 ? cachedTokens : 0;
  return Math.min(cached, input);
}

function calculateCostUsd(model, usage, usdToEur = DEFAULT_USD_TO_EUR) {
  const pricing = resolveModelPricing(model);
  if (!pricing) return null;

  const inTok = typeof usage?.inTok === "number" ? usage.inTok : null;
  const outTok = typeof usage?.outTok === "number" ? usage.outTok : null;
  const cachedTok = clampCachedTokens(inTok, usage?.cachedTok);
  const cacheWriteTok = typeof usage?.cacheWriteTok === "number" && usage.cacheWriteTok > 0 ? usage.cacheWriteTok : 0;

  if (inTok == null && outTok == null) return null;

  const input = inTok ?? 0;
  const output = outTok ?? 0;
  const uncached = Math.max(0, input - cachedTok);

  const inputRate = pricing.input / 1_000_000;
  const cachedRate = (typeof pricing.cached === "number" ? pricing.cached : pricing.input) / 1_000_000;
  const outputRate = pricing.output / 1_000_000;

  let cacheWriteRate;
  if (typeof pricing.cacheWrite === "number") {
    cacheWriteRate = pricing.cacheWrite / 1_000_000;
  } else if (pricing.cacheWritePremium) {
    cacheWriteRate = (pricing.input * 1.25) / 1_000_000;
  } else {
    cacheWriteRate = inputRate;
  }

  const uncachedCost = uncached * inputRate;
  const cachedCost = cachedTok * cachedRate;
  const cacheWriteCost = cacheWriteTok * cacheWriteRate;
  const outputCost = output * outputRate;
  const totalUsd = uncachedCost + cachedCost + cacheWriteCost + outputCost;

  return {
    totalUsd,
    totalEur: totalUsd * usdToEur,
    usdToEur,
    modelKey: pricing.key,
    pricing,
    breakdown: {
      uncached,
      cached: cachedTok,
      cacheWrite: cacheWriteTok,
      output,
      uncachedCost,
      cachedCost,
      cacheWriteCost,
      outputCost
    }
  };
}

function formatEur(amount) {
  if (amount == null || !Number.isFinite(amount)) return "…";
  if (amount === 0) return "€0.00";
  if (amount >= 1) return `€${amount.toFixed(2)}`;
  if (amount >= 0.01) return `€${amount.toFixed(4)}`;
  if (amount >= 0.0001) return `€${amount.toFixed(6)}`;
  return "<€0.0001";
}

function formatUsd(amount) {
  if (amount == null || !Number.isFinite(amount)) return "…";
  if (amount === 0) return "$0.00";
  if (amount >= 1) return `$${amount.toFixed(4)}`;
  if (amount >= 0.01) return `$${amount.toFixed(5)}`;
  return `$${amount.toFixed(6)}`;
}
