import { AsyncLocalStorage } from "node:async_hooks";

export type ServerTimingMetric =
  | "total"
  | "usage"
  | "classify"
  | "retrieval"
  | "generation"
  | "tts-reserve"
  | "tts-synthesize"
  | "tts-finalize";

type Clock = () => number;

const MAX_DURATION_MS = 60 * 60 * 1_000;
const serverTimingStorage = new AsyncLocalStorage<ServerTiming>();

export class ServerTiming {
  private readonly durations = new Map<ServerTimingMetric, number>();
  private readonly now: Clock;
  private readonly totalStartedAt: number;

  constructor(now: Clock = () => performance.now()) {
    this.now = now;
    this.totalStartedAt = this.now();
  }

  async measure<T>(metric: ServerTimingMetric, operation: () => Promise<T>): Promise<T> {
    const startedAt = this.now();

    try {
      return await operation();
    } finally {
      this.record(metric, this.now() - startedAt);
    }
  }

  record(metric: ServerTimingMetric, durationMs: number) {
    const duration = sanitizeDuration(durationMs);
    this.durations.set(metric, (this.durations.get(metric) ?? 0) + duration);
  }

  finishTotal() {
    if (!this.durations.has("total")) {
      this.record("total", this.now() - this.totalStartedAt);
    }
  }

  toHeaderValue() {
    const entries = [...this.durations.entries()];
    entries.sort(([left], [right]) => {
      if (left === "total") return -1;
      if (right === "total") return 1;
      return 0;
    });

    return entries.map(([metric, duration]) => `${metric};dur=${duration.toFixed(1)}`).join(", ");
  }
}

export function getServerTiming() {
  return serverTimingStorage.getStore();
}

export async function withServerTiming(
  handler: (timing: ServerTiming) => Promise<Response>,
  now?: Clock
) {
  const timing = new ServerTiming(now);

  return serverTimingStorage.run(timing, async () => {
    try {
      const response = await handler(timing);
      timing.finishTotal();
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Server-Timing", timing.toHeaderValue());
      return response;
    } catch (error) {
      timing.finishTotal();
      throw error;
    }
  });
}

function sanitizeDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 0;
  return Math.round(Math.min(durationMs, MAX_DURATION_MS) * 10) / 10;
}
