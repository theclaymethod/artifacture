// Contract fixture only. Records produced through this adapter are marked
// synthetic by run.mjs and are rejected by select.mjs.
export const synthetic = true;

export async function invoke(request) {
  return {
    provider_response_id: `fixture:${request.prefix_manifest.prefix_id.slice(0, 12)}`,
    raw_text: JSON.stringify({
      verdicts: request.suffix.cases.map((entry) => ({
        state_id: entry.state_id,
        pass: true,
        findings: [],
      })),
    }),
    telemetry: {
      complete: true,
      latency_ms: 1,
      time_to_first_token_ms: 1,
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      actual_cost_usd: 0,
    },
  };
}
