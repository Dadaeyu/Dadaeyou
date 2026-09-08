export const CHAT_REQUEST_TIMEOUT_MESSAGE = "답변이 늦어지고 있어요. 다시 시도해 주세요.";
export const CHAT_REQUEST_NETWORK_ERROR_MESSAGE =
  "요청 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
};

class ChatRequestApiError extends Error {}

export async function requestChatJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 90_000
): Promise<T> {
  const parentSignal = init.signal;
  if (parentSignal?.aborted) throw normalizeAbortReason(parentSignal.reason);

  const controller = new AbortController();
  const timeoutError = new Error(CHAT_REQUEST_TIMEOUT_MESSAGE);
  let abortReason: Error | DOMException | null = null;
  let rejectAbort: (reason: Error | DOMException) => void = () => undefined;
  let settled = false;

  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const timeoutId = setTimeout(() => {
    if (settled) return;
    abortReason = timeoutError;
    controller.abort(timeoutError);
    rejectAbort(timeoutError);
  }, timeoutMs);

  const handleParentAbort = () => {
    if (settled) return;
    const reason = normalizeAbortReason(parentSignal?.reason);
    abortReason = reason;
    controller.abort(reason);
    rejectAbort(reason);
  };

  parentSignal?.addEventListener("abort", handleParentAbort, { once: true });

  try {
    const response = await raceDetached(
      fetch(url, { ...init, signal: controller.signal }),
      abortPromise
    );
    const payload = await raceDetached(response.json() as Promise<unknown>, abortPromise);

    if (!response.ok)
      throw new ChatRequestApiError(readApiErrorMessage(payload) ?? "chat request failed");

    return payload as T;
  } catch (error) {
    if (error === timeoutError) throw timeoutError;
    if (abortReason && error === abortReason) throw abortReason;
    if (isAbortError(error)) throw error;
    if (error instanceof ChatRequestApiError && error.message !== "chat request failed")
      throw error;
    throw new Error(CHAT_REQUEST_NETWORK_ERROR_MESSAGE);
  } finally {
    settled = true;
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", handleParentAbort);
  }
}

async function raceDetached<T>(promise: Promise<T>, abortPromise: Promise<never>) {
  promise.catch(() => undefined);
  return Promise.race([promise, abortPromise]);
}

function readApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const { error, message } = payload as ApiErrorPayload;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (typeof message === "string" && message.trim()) return message.trim();
  return null;
}

function normalizeAbortReason(reason: unknown) {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string" && reason.trim()) return new Error(reason.trim());

  return new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
