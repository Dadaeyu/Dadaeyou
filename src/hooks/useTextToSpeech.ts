"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TextToSpeechCapabilities, TextToSpeechVoice } from "@/lib/tts/types";

type SpeakOptions = {
  onEnd?: () => void;
  onError?: (error: Error) => void;
  text: string;
  voice?: string;
};

const EMPTY_CAPABILITIES: TextToSpeechCapabilities = {
  available: false,
  defaultVoice: "",
  provider: "",
  voices: []
};

export function useTextToSpeech() {
  const [capabilities, setCapabilities] = useState<TextToSpeechCapabilities>(EMPTY_CAPABILITIES);
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const isUnlockedRef = useRef(false);
  const unlockPromiseRef = useRef<Promise<boolean> | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const playbackIdRef = useRef(0);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    return audio;
  }, []);

  const releaseAudioSource = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = "";
    }
  }, []);

  const unlock = useCallback(() => {
    if (isUnlockedRef.current) return Promise.resolve(true);
    if (unlockPromiseRef.current) return unlockPromiseRef.current;

    const audio = getAudio();
    audio.src = "/api/tts?unlock=1";

    const unlockPromise = audio
      .play()
      .then(() => {
        isUnlockedRef.current = true;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        unlockPromiseRef.current = null;
      });

    unlockPromiseRef.current = unlockPromise;
    return unlockPromise;
  }, [getAudio]);

  const stop = useCallback(() => {
    setStatus("idle");
    playbackIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    releaseAudioSource();
  }, [releaseAudioSource]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCapabilities() {
      if (typeof Audio === "undefined") return;

      try {
        const response = await fetch("/api/tts", {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) return;

        const data = (await response.json()) as TextToSpeechCapabilities;
        if (!controller.signal.aborted) {
          setCapabilities(data);
        }
      } catch {
        // The controls remain disabled when the TTS service is unavailable.
      }
    }

    void loadCapabilities();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(
    () => () => {
      stop();
      audioRef.current = null;
    },
    [stop]
  );

  const speak = useCallback(
    async ({ text, voice, onEnd, onError }: SpeakOptions) => {
      stop();

      setStatus("loading");
      const playbackId = playbackIdRef.current;
      const controller = new AbortController();
      requestControllerRef.current = controller;

      try {
        const isUnlocked = await unlock();
        if (!isUnlocked) {
          throw new Error("브라우저에서 음성 재생이 차단되었습니다.");
        }
        if (controller.signal.aborted || playbackIdRef.current !== playbackId) return;

        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(errorBody?.message || "음성 생성 요청에 실패했습니다.");
        }

        const audioBlob = await response.blob();
        if (controller.signal.aborted || playbackIdRef.current !== playbackId) return;

        releaseAudioSource();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = getAudio();
        audioUrlRef.current = audioUrl;
        audio.src = audioUrl;

        const finish = (callback?: () => void) => {
          if (playbackIdRef.current !== playbackId) return;
          setStatus("idle");
          releaseAudioSource();
          callback?.();
        };

        audio.onended = () => finish(onEnd);
        audio.onerror = () =>
          finish(() => onError?.(new Error("생성된 음성을 재생하지 못했습니다.")));

        await audio.play();
        if (!controller.signal.aborted && playbackIdRef.current === playbackId)
          setStatus("playing");
      } catch (error) {
        if (controller.signal.aborted || playbackIdRef.current !== playbackId) return;

        setStatus("idle");
        releaseAudioSource();
        onError?.(error instanceof Error ? error : new Error("음성 재생에 실패했습니다."));
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
      }
    },
    [getAudio, releaseAudioSource, stop, unlock]
  );

  return {
    status,
    defaultVoice: capabilities.defaultVoice,
    isAvailable: capabilities.available,
    provider: capabilities.provider,
    speak,
    stop,
    unlock,
    voices: capabilities.voices as TextToSpeechVoice[]
  };
}
