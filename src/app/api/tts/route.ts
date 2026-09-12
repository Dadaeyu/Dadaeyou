import { createTextToSpeechProvider, TextToSpeechProviderError } from "@/lib/tts/server";
import { readBoundedRequestBody } from "@/lib/server/read-bounded-request-body";
import {
  isAllowedTextToSpeechOrigin,
  resolveTextToSpeechClientKey
} from "@/lib/tts/server/client-identity";
import { enforceTextToSpeechRateLimit } from "@/lib/tts/server/rate-limit";
import {
  getTextToSpeechRequestBodySizeBytes,
  isTextToSpeechBodySizeAllowed,
  TTS_MAX_BODY_BYTES
} from "@/lib/tts/server/request-body";
import { withServerTiming } from "@/lib/performance/serverTiming";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 4096;
const SILENT_WAV = createSilentWav();

export function GET(request: Request) {
  if (new URL(request.url).searchParams.get("unlock") === "1") {
    return new Response(SILENT_WAV, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "audio/wav",
        "Content-Length": String(SILENT_WAV.byteLength)
      }
    });
  }

  try {
    const provider = createTextToSpeechProvider();

    return Response.json(provider.getCapabilities(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json(
      {
        available: false,
        defaultVoice: "",
        provider: "",
        voices: []
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}

export async function POST(request: Request) {
  return withServerTiming(() => handlePost(request));
}

async function handlePost(request: Request) {
  if (!isAllowedTextToSpeechOrigin(request)) {
    return Response.json({ message: "허용되지 않은 요청이에요." }, { status: 403 });
  }

  let body: unknown;

  if (!isTextToSpeechBodySizeAllowed(getTextToSpeechRequestBodySizeBytes(request.headers))) {
    return Response.json({ message: "요청 내용이 너무 길어요." }, { status: 413 });
  }

  try {
    const bodyResult = await readBoundedRequestBody(request, TTS_MAX_BODY_BYTES);
    if (!bodyResult.ok) {
      return Response.json({ message: "요청 내용이 너무 길어요." }, { status: 413 });
    }

    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json({ message: "올바른 요청 형식이 아니에요." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ message: "올바른 요청 형식이 아니에요." }, { status: 400 });
  }

  const { text: rawText, voice: rawVoice } = body as {
    text?: unknown;
    voice?: unknown;
  };
  const text = typeof rawText === "string" ? rawText.trim() : "";
  const voice = typeof rawVoice === "string" ? rawVoice.trim() : undefined;

  try {
    if (!text) {
      return Response.json({ message: "읽을 문장을 입력해 주세요." }, { status: 400 });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json(
        { message: `한 번에 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 읽을 수 있어요.` },
        { status: 400 }
      );
    }

    const clientKey = await resolveTextToSpeechClientKey(request);
    const rateLimit = enforceTextToSpeechRateLimit(clientKey);
    if (!rateLimit.allowed) {
      return Response.json(
        { message: "음성 요청이 많아요. 잠시 뒤 다시 시도해 주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const provider = createTextToSpeechProvider();
    const audio = await provider.synthesize({ text, voice }, { clientKey, signal: request.signal });

    return new Response(audio.stream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": audio.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) {
      return new Response(null, { status: 499 });
    }

    const status = error instanceof TextToSpeechProviderError ? error.status : 500;

    return Response.json(
      {
        message:
          status === 400
            ? "한 번에 읽을 수 있는 문장이 너무 길어요."
            : status === 402
              ? "이번 달 무료 음성 사용량을 모두 사용했어요."
              : status === 429
                ? "음성 요청이 많아요. 잠시 뒤 다시 시도해 주세요."
                : "음성을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요."
      },
      { status }
    );
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function createSilentWav() {
  const sampleRate = 8_000;
  const sampleCount = 400;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + sampleCount * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * bytesPerSample, true);

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
