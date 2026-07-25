export const TELEMETRY_FIELDS = Object.freeze([
  'latency_ms',
  'time_to_first_token_ms',
  'input_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'output_tokens',
  'actual_cost_usd',
]);

export function normalizeTelemetry(telemetry = {}, {
  allowIncomplete = false,
  context = 'provider telemetry',
} = {}) {
  const complete = telemetry.complete !== false;
  if (!complete && !allowIncomplete) throw new Error(`${context} is incomplete`);
  const output = { complete };
  for (const field of TELEMETRY_FIELDS) {
    const value = telemetry[field];
    if (!complete && (value === undefined || value === null)) {
      output[field] = null;
      continue;
    }
    if (value === undefined || value === null) {
      throw new Error(`${context} requires non-negative ${field}`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`${context} requires non-negative ${field}`);
    }
    output[field] = number;
  }
  if (telemetry.source) output.source = String(telemetry.source);
  return output;
}
