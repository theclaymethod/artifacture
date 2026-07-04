# Task: Code Walkthrough

Create a visual explainer that teaches how this queue draining function works. Explain the control flow, the safety invariants, and the important edge cases. Embed or reference the code as needed, but the main value should be visual structure.

```ts
type Job = {
  id: string;
  attempts: number;
  run: () => Promise<void>;
};

type QueueState = {
  pending: Job[];
  running: Set<string>;
  failed: Map<string, Error>;
};

export async function drainQueue(
  state: QueueState,
  concurrency: number,
  maxAttempts = 3,
) {
  const workers = Array.from({ length: concurrency }, async () => {
    while (state.pending.length > 0) {
      const job = state.pending.shift();
      if (!job || state.running.has(job.id)) continue;

      state.running.add(job.id);
      try {
        await job.run();
        state.failed.delete(job.id);
      } catch (error) {
        job.attempts += 1;
        if (job.attempts < maxAttempts) {
          state.pending.push(job);
        } else {
          state.failed.set(job.id, error as Error);
        }
      } finally {
        state.running.delete(job.id);
      }
    }
  });

  await Promise.all(workers);
  return {
    pending: state.pending.length,
    running: state.running.size,
    failed: state.failed.size,
  };
}
```

## Must Cover

- How `concurrency` creates multiple worker loops.
- Why `running` prevents duplicate execution by job ID.
- What happens on success, retryable failure, and terminal failure.
- Why `finally` matters.
- What the returned counts mean.
