# Provider adapter contract

`run.mjs` is provider-independent. A live adapter is a local ESM module that
exports:

```js
export async function invoke(request, context) {
  return {
    provider_response_id: "provider request id",
    raw_text: "{\"verdicts\":[...]}",
    telemetry: {
      complete: true,
      latency_ms: 1200,
      time_to_first_token_ms: 400,
      input_tokens: 1800,
      cache_read_tokens: 1200,
      cache_write_tokens: 0,
      output_tokens: 220,
      actual_cost_usd: 0.0014
    }
  };
}
```

The adapter translates the provider-neutral `request.prefix` and
`request.suffix` fields into one direct API call:

1. fixed `tools_json` definitions;
2. fixed system/verdict contract;
3. fixed shared instructions;
4. optional fixed design-system excerpt;
5. images in the manifest's stable order and exact detail setting;
6. provider cache breakpoint, when supported; and
7. exactly one criterion suffix.

The response must report actual provider telemetry. Use `0` only when the
provider explicitly reports zero; do not estimate tokens, cache reads, total
latency, time to first token, or cost. `actual_cost_usd` may be calculated from
provider-reported token counts only when the adapter records the exact dated
price source beside its code. Set `complete: true` only when every required
telemetry field is available. Provider failures are recorded with incomplete
telemetry and can never qualify a policy cell.

`context` contains request identity and adapter options only. It never contains
human labels or adjudication notes. Credentials remain in environment variables
owned by the adapter; the runner neither reads nor stores them.

`fixture-all-clean.mjs` exists only to exercise the plumbing. It exports
`synthetic = true`; those records cannot generate a production policy.
