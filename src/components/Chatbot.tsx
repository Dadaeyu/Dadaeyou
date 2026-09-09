"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAccessibility } from "@/context/AccessibilityContext";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import type { TourismSharedCourse } from "@/lib/supabase/types";
import { HomePlaceImage } from "@/features/home/HomePlaceImage";
import {
  buildInternalPlaceMapHref,
  buildRelatedCourseQuery,
  isCourseRecommendationRequest
} from "@/lib/chat/discoveryLinks";
import {
  formatChatAccessibilityText,
  formatChatDisplayText,
  getPublicChatSourceLabel
} from "@/lib/chat/presentation";
import { getChatScrollTarget } from "@/lib/chat/scrollTarget";
import { requestChatJson } from "@/lib/chat/client-request";
import {
  Accessibility,
  ArrowRight,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Route,
  Send,
  Star,
  Square,
  Volume2,
  VolumeX,
  X
} from "lucide-react";

type Confidence = "high" | "medium" | "low";

type ChatResponse = {
  message: string;
  card?: {
    title: string;
    rows: string[];
    source: string;
  };
  places?: PlaceRecommendation[];
  courses?: TourismSharedCourse[];
  chips: string[];
  confidence: Confidence;
  sources: string[];
  debug?: {
    analysis: QueryAnalysis;
    inputMessage?: string;
    rag?: RagDebug;
    searchTerms: string[];
    weather?: WeatherDebug;
  };
};

type PlaceRecommendation = {
  contentId: string | null;
  title: string;
  category: string | null;
  address: string | null;
  tel: string | null;
  activity: string;
  tourDetails?: string[];
  accessibility: string[];
  latitude: string | null;
  longitude: string | null;
  source: string | null;
};

type WeatherDebug = {
  items: Array<{
    cityAreaId: string | null;
    cityName: string | null;
    doName: string | null;
    kmaTci: string | null;
    tciGrade: string | null;
    tm: string | null;
    totalCityName: string | null;
  }>;
  request?: {
    cityAreaId?: string | null;
    currentDate: string;
    day: string;
    endpoint: string;
  };
  source: string;
  status: "not_requested" | "not_configured" | "ready" | "empty" | "unavailable";
  statusMessage: string;
};

type RagDebug = {
  dbMatches: Array<{
    category: string | null;
    chunkIndex: number | null;
    contentPreview: string | null;
    rank: number;
    similarity: number | null;
    source: string | null;
    title: string | null;
  }>;
  embedding?: {
    dimensions?: number;
    input?: string;
    model?: string;
    status: "created" | "failed" | "not_configured" | "skipped";
    vectorPreview?: number[];
    vectorPreviewNote?: string;
  };
  searchMode: "vector" | "keyword" | "none";
  statusMessage: string;
  vectorCandidateCount?: number;
};

type QueryAnalysis = {
  in_scope: boolean;
  scope_reason: string;
  intent: "recommend_place" | "check_accessibility" | "ask_info";
  accessibility_needs: string[];
  weather_sensitive: boolean;
  place_name: string | null;
  location: string | null;
  keywords: string[];
};

type Message =
  | {
      id: number;
      role: "assistant";
      content: ChatResponse;
    }
  | {
      id: number;
      role: "user";
      text: string;
    };

type ChatHistoryItem = {
  role: "assistant" | "user";
  content: string;
  placeTitles?: string[];
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  abort: () => void;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const INITIAL_RESPONSE: ChatResponse = {
  message: "어디로 가고 싶으세요? 필요한 조건까지 함께 찾아볼게요.",
  chips: [
    "다대유는 어떤 사이트야?",
    "어떻게 질문하면 돼?",
    "대전어린이회관 휠체어 가능해?",
    "유모차로 갈만한 문화시설"
  ],
  confidence: "high",
  sources: []
};

const DAIYU_AVATAR_SRC = "/daiyu-avatar.png";
const DAIYU_PROFILE_SRC = "/daiyu-profile.png";
const MAX_HISTORY_ITEMS = 10;

interface Props {
  onClose: () => void;
  accessibilityNeeds?: string[];
}

export default function Chatbot({ onClose, accessibilityNeeds = [] }: Props) {
  const { readAloud } = useAccessibility();
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", content: INITIAL_RESPONSE }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoTtsEnabled, setIsAutoTtsEnabled] = useState(readAloud);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [voiceInputStatus, setVoiceInputStatus] = useState("");
  const [requestNotice, setRequestNotice] = useState("");
  const [retryQuestion, setRetryQuestion] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const lastAutoSpokenMessageIdRef = useRef<number | null>(null);
  const nextIdRef = useRef(1);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const conversationModeRef = useRef(false);
  const conversationRestartTimerRef = useRef<number | null>(null);
  const isLoadingRef = useRef(false);
  const voiceSessionIdRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const pendingQuestionRef = useRef("");
  const pendingUserMessageIdRef = useRef<number | null>(null);
  const relatedRequestsRef = useRef(new Set<AbortController>());
  const speechRequestIdRef = useRef(0);
  const {
    status: ttsStatus,
    isAvailable: ttsSupported,
    speak: speakWithTts,
    stop: stopTts,
    unlock: unlockTts
  } = useTextToSpeech();

  function nextId() {
    nextIdRef.current += 1;
    return nextIdRef.current;
  }

  useEffect(() => {
    const relatedRequests = relatedRequestsRef.current;
    const timerId = window.setTimeout(() => {
      setSttSupported(Boolean(getSpeechRecognitionConstructor()));
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      clearConversationRestartTimer();
      recognitionRef.current?.abort();
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      for (const controller of relatedRequests) controller.abort();
      relatedRequests.clear();
    };
  }, []);

  useEffect(() => {
    conversationModeRef.current = isConversationMode;
  }, [isConversationMode]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    const scrollTarget = getChatScrollTarget(messages, isLoading);
    const messageList = messageListRef.current;

    if (!messageList) return;

    if (scrollTarget.kind === "message" && scrollAnchorRef.current) {
      const anchorRect = scrollAnchorRef.current.getBoundingClientRect();
      const listRect = messageList.getBoundingClientRect();
      const anchorTopInList = anchorRect.top - listRect.top + messageList.scrollTop;

      messageList.scrollTo({
        top: Math.max(0, anchorTopInList - 12),
        behavior: "smooth"
      });
      return;
    }

    messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const scrollTarget = getChatScrollTarget(messages, isLoading);
  const scrollTargetMessageId = scrollTarget.kind === "message" ? scrollTarget.messageId : null;

  const stopSpeech = useCallback(() => {
    stopTts();
    setSpeakingMessageId(null);
  }, [stopTts]);

  const stopVoiceInput = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const abortVoiceInput = useCallback(() => {
    voiceSessionIdRef.current += 1;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const startSpeech = useCallback(
    (messageId: number, text: string, onDone?: () => void) => {
      if (!ttsSupported) return;

      const finish = () => {
        setSpeakingMessageId((current) => (current === messageId ? null : current));
        onDone?.();
      };

      stopTts();
      setSpeakingMessageId(messageId);
      void speakWithTts({
        text,
        onEnd: finish,
        onError: (error) => {
          setVoiceInputStatus(error.message);
          finish();
        }
      });
    },
    [speakWithTts, stopTts, ttsSupported]
  );

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];

    if (
      !isAutoTtsEnabled ||
      !ttsSupported ||
      isLoading ||
      messages.length <= 1 ||
      latestMessage?.role !== "assistant" ||
      lastAutoSpokenMessageIdRef.current === latestMessage.id
    ) {
      return;
    }

    lastAutoSpokenMessageIdRef.current = latestMessage.id;
    startSpeech(latestMessage.id, latestMessage.content.message);
  }, [isAutoTtsEnabled, isLoading, messages, startSpeech, ttsSupported]);

  async function speakMessage(messageId: number, text: string) {
    if (speakingMessageId === messageId) {
      stopSpeech();
      return;
    }

    stopSpeech();
    const unlocked = await unlockTts();
    if (!unlocked) {
      setVoiceInputStatus("브라우저에서 음성 재생이 차단되었어요. 다시 눌러주세요.");
      return;
    }

    startSpeech(messageId, text);
  }

  async function toggleAutoTts() {
    if (!ttsSupported || isConversationMode) return;

    if (isAutoTtsEnabled) {
      setIsAutoTtsEnabled(false);
      stopSpeech();
      return;
    }

    stopSpeech();
    const unlocked = await unlockTts();
    if (!unlocked) {
      setVoiceInputStatus("브라우저에서 자동 읽기를 시작하지 못했어요. 다시 눌러주세요.");
      return;
    }

    setIsAutoTtsEnabled(true);
    const latestAssistantMessage = messages.findLast(
      (message): message is Extract<Message, { role: "assistant" }> => message.role === "assistant"
    );

    if (latestAssistantMessage) {
      lastAutoSpokenMessageIdRef.current = latestAssistantMessage.id;
      startSpeech(latestAssistantMessage.id, latestAssistantMessage.content.message);
    }
  }

  function startVoiceInput({ autoSubmit = false }: { autoSubmit?: boolean } = {}) {
    if (isLoadingRef.current) return;

    clearConversationRestartTimer();

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setVoiceInputStatus("이 브라우저는 음성 입력을 지원하지 않아요.");
      return;
    }

    stopSpeech();
    abortVoiceInput();

    const sessionId = voiceSessionIdRef.current + 1;
    voiceSessionIdRef.current = sessionId;
    const baseInput = !autoSubmit && input.trim() ? `${input.trimEnd()} ` : "";
    let latestTranscript = "";
    let finalTranscript = "";
    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsListening(true);
      setVoiceInputStatus(
        autoSubmit
          ? "대화 모드로 듣는 중이에요. 질문을 말해주세요."
          : "듣는 중이에요. 말하면 입력창에 바로 들어갑니다."
      );
    };
    recognition.onresult = (event) => {
      let currentFinalTranscript = "";
      let interimTranscript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";

        if (result.isFinal) {
          currentFinalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      latestTranscript = `${currentFinalTranscript}${interimTranscript}`.trim();
      if (currentFinalTranscript.trim()) {
        finalTranscript = currentFinalTranscript.trim();
      }
      setInput(`${baseInput}${latestTranscript}`.trimStart());
    };
    recognition.onerror = (event) => {
      if (voiceSessionIdRef.current !== sessionId) return;

      setIsListening(false);
      const message = getSpeechRecognitionErrorMessage(event.error);
      setVoiceInputStatus(message);

      if (
        autoSubmit &&
        conversationModeRef.current &&
        event.error !== "not-allowed" &&
        event.error !== "service-not-allowed" &&
        event.error !== "audio-capture"
      ) {
        scheduleConversationListening(1200);
      }
    };
    recognition.onend = () => {
      if (voiceSessionIdRef.current !== sessionId) return;

      recognitionRef.current = null;
      setIsListening(false);
      const voiceText = (finalTranscript || latestTranscript).trim();

      if (autoSubmit && conversationModeRef.current) {
        if (voiceText) {
          setVoiceInputStatus("질문을 보내는 중이에요.");
          void sendMessage(voiceText, { continueConversation: true });
          return;
        }

        setVoiceInputStatus("음성이 잘 들리지 않았어요. 다시 듣고 있어요.");
        scheduleConversationListening(900);
        return;
      }

      setVoiceInputStatus((current) => {
        if (current.startsWith("듣는 중")) return "음성 입력 완료. 확인 후 전송하세요.";
        return current;
      });
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceInputStatus("음성 입력을 시작하지 못했어요. 잠시 뒤 다시 눌러주세요.");
    }
  }

  function toggleVoiceInput() {
    if (isLoading) return;

    if (isListening) {
      stopVoiceInput();
      return;
    }

    startVoiceInput();
  }

  function toggleConversationMode() {
    if (!ttsSupported || !sttSupported) {
      setVoiceInputStatus("대화 모드는 음성 입력과 음성 읽어주기가 모두 준비되어야 쓸 수 있어요.");
      return;
    }

    const nextValue = !conversationModeRef.current;
    conversationModeRef.current = nextValue;
    setIsConversationMode(nextValue);

    if (!nextValue) {
      clearConversationRestartTimer();
      abortVoiceInput();
      stopSpeech();
      setVoiceInputStatus("대화 모드가 꺼졌어요.");
      return;
    }

    unlockTts();
    setIsAutoTtsEnabled(false);
    setInput("");
    setVoiceInputStatus("대화 모드가 켜졌어요. 질문을 말해주세요.");
    startVoiceInput({ autoSubmit: true });
  }

  function clearConversationRestartTimer() {
    if (conversationRestartTimerRef.current === null) return;

    window.clearTimeout(conversationRestartTimerRef.current);
    conversationRestartTimerRef.current = null;
  }

  function scheduleConversationListening(delay = 500) {
    clearConversationRestartTimer();

    if (!conversationModeRef.current) return;

    conversationRestartTimerRef.current = window.setTimeout(() => {
      conversationRestartTimerRef.current = null;
      if (!conversationModeRef.current || isLoadingRef.current) return;
      startVoiceInput({ autoSubmit: true });
    }, delay);
  }

  async function loadRelatedCourses(messageId: number, data: ChatResponse, question: string) {
    const contentIds = (data.places ?? []).flatMap((place) =>
      place.contentId ? [place.contentId] : []
    );
    const courseRequested = isCourseRecommendationRequest(question);
    if (!contentIds.length && !courseRequested) return;

    const controller = new AbortController();
    relatedRequestsRef.current.add(controller);
    try {
      const init = {
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store"
      } as const;
      let payload = await requestChatJson<{ items?: TourismSharedCourse[] }>(
        buildRelatedCourseQuery(contentIds),
        init,
        8_000
      );
      if (!payload.items?.length && courseRequested && contentIds.length) {
        payload = await requestChatJson<{ items?: TourismSharedCourse[] }>(
          buildRelatedCourseQuery([]),
          init,
          8_000
        );
      }
      if (controller.signal.aborted || !payload.items?.length) return;
      const courses = payload.items;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.role === "assistant"
            ? { ...message, content: { ...message.content, courses } }
            : message
        )
      );
    } catch {
      // 관련 코스를 받지 못해도 먼저 표시한 장소 답변은 유지한다.
    } finally {
      relatedRequestsRef.current.delete(controller);
    }
  }

  function cancelRequest() {
    const controller = activeRequestRef.current;
    if (!controller) return;
    activeRequestRef.current = null;
    controller.abort();
    speechRequestIdRef.current += 1;
    isLoadingRef.current = false;
    setIsLoading(false);
    setInput(pendingQuestionRef.current);
    setRetryQuestion(pendingQuestionRef.current);
    setRequestNotice("답변 요청을 취소했어요. 질문을 수정하거나 다시 시도할 수 있어요.");
    conversationModeRef.current = false;
    setIsConversationMode(false);
    clearConversationRestartTimer();
    abortVoiceInput();
    stopSpeech();
  }

  async function sendMessage(message: string, options: { continueConversation?: boolean } = {}) {
    const text = message.trim();
    if (!text || isLoadingRef.current) return;
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const speechRequestId = speechRequestIdRef.current + 1;
    speechRequestIdRef.current = speechRequestId;
    pendingQuestionRef.current = text;
    setRequestNotice("");
    setRetryQuestion("");
    const retryMessageId = pendingUserMessageIdRef.current;
    const history = buildChatHistory(messages.filter((entry) => entry.id !== retryMessageId));
    const userMessageId = retryMessageId ?? nextId();
    pendingUserMessageIdRef.current = userMessageId;
    const shouldReadTypedQuestion = readAloud && !options.continueConversation;
    const shouldUnlockTts =
      ttsSupported && (isAutoTtsEnabled || shouldReadTypedQuestion || options.continueConversation);

    abortVoiceInput();
    stopSpeech();
    const ttsUnlockPromise = shouldUnlockTts ? unlockTts() : Promise.resolve(true);
    setMessages((current) => [
      ...current.filter((entry) => entry.id !== retryMessageId),
      { id: userMessageId, role: "user", text }
    ]);
    setInput("");
    isLoadingRef.current = true;
    setIsLoading(true);

    void (async () => {
      const ttsUnlocked = await ttsUnlockPromise;
      if (speechRequestIdRef.current !== speechRequestId || controller.signal.aborted) return;
      if (shouldUnlockTts && !ttsUnlocked) {
        setVoiceInputStatus(
          "브라우저에서 자동 읽기를 시작하지 못했어요. 답변의 읽기 버튼을 눌러주세요."
        );
      } else if (shouldReadTypedQuestion && ttsSupported) {
        startSpeech(userMessageId, text);
      }
    })().catch(() => {
      if (speechRequestIdRef.current === speechRequestId && !controller.signal.aborted) {
        setVoiceInputStatus("음성 재생을 준비하지 못했어요. 답변의 읽기 버튼을 눌러주세요.");
      }
    });

    try {
      const data = await requestChatJson<ChatResponse>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, accessibilityNeeds, history }),
        signal: controller.signal
      });
      if (activeRequestRef.current !== controller || controller.signal.aborted) return;
      pendingUserMessageIdRef.current = null;
      const assistantMessageId = nextId();
      setMessages((current) => [
        ...current,
        { id: assistantMessageId, role: "assistant", content: data }
      ]);
      void loadRelatedCourses(assistantMessageId, data, text);

      if (options.continueConversation && conversationModeRef.current) {
        startSpeech(assistantMessageId, data.message, () => {
          if (conversationModeRef.current) {
            scheduleConversationListening();
          }
        });
      }
    } catch (error) {
      if (activeRequestRef.current !== controller || controller.signal.aborted) return;
      const notice =
        error instanceof Error ? error.message : "답변을 받지 못했어요. 다시 시도해 주세요.";
      setRequestNotice(notice);
      setRetryQuestion(text);
      setInput(text);
      conversationModeRef.current = false;
      setIsConversationMode(false);
      clearConversationRestartTimer();
      stopSpeech();
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function closeChat() {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    speechRequestIdRef.current += 1;
    for (const controller of relatedRequestsRef.current) controller.abort();
    relatedRequestsRef.current.clear();
    conversationModeRef.current = false;
    setIsConversationMode(false);
    clearConversationRestartTimer();
    abortVoiceInput();
    stopSpeech();
    onClose();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        closeChat();
      }}
      className="backdrop:bg-ink/45 shadow-navy-900/25 md:border-hairline fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white p-0 shadow-2xl open:grid md:inset-y-4 md:right-4 md:left-auto md:h-auto md:w-[min(440px,calc(100vw-2rem))] md:rounded-lg md:border"
      aria-label="다유 챗봇"
    >
      <div className="border-hairline border-b bg-white">
        <header className="flex min-h-16 items-center justify-between gap-4 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <DaiyuAvatar size="lg" variant="full" />
            <div className="min-w-0">
              <strong className="text-ink block text-base leading-tight font-semibold">다유</strong>
              <span className="text-steel mt-1 flex items-center gap-1.5 text-sm">
                <span className="bg-brand-500 h-2 w-2 rounded-full" aria-hidden="true" />
                {isLoading
                  ? "답변을 준비하고 있어요"
                  : isConversationMode
                    ? isListening
                      ? "대화 모드로 듣는 중"
                      : "대화 모드 대기 중"
                    : isAutoTtsEnabled
                      ? "자동 읽기 켜짐"
                      : "질문을 기다리고 있어요"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={closeChat}
            className="text-slate hover:bg-surface grid h-12 w-12 shrink-0 place-items-center rounded-md"
            aria-label="채팅창 닫기"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </header>

        <details className="border-hairline border-t px-4 py-2">
          <summary className="text-slate flex min-h-12 cursor-pointer items-center gap-2 text-sm font-medium select-none">
            <Accessibility className="text-brand-700 h-4 w-4" aria-hidden="true" />
            음성 부가 설정
            <span className="text-steel ml-auto text-xs">
              대화 {isConversationMode ? "켜짐" : "꺼짐"} · 자동 읽기{" "}
              {isAutoTtsEnabled ? "켜짐" : "꺼짐"}
            </span>
          </summary>
          <div className="grid gap-2 pb-2 sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                disabled={(!ttsSupported || !sttSupported) && !isConversationMode}
                onClick={toggleConversationMode}
                aria-pressed={isConversationMode}
                className={`min-h-12 w-full rounded-md border px-3 text-left text-sm font-medium disabled:opacity-45 ${
                  isConversationMode
                    ? "border-gold-500 bg-gold-50 text-gold-900"
                    : "border-hairline text-slate bg-white"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    대화모드
                  </span>
                  <span>{isConversationMode ? "켜짐" : "꺼짐"}</span>
                </span>
              </button>
            </div>
            <button
              type="button"
              disabled={!ttsSupported || isConversationMode}
              onClick={toggleAutoTts}
              aria-pressed={isAutoTtsEnabled}
              aria-label={isAutoTtsEnabled ? "답변 자동 읽기 끄기" : "답변 자동 읽기 켜기"}
              className={`min-h-12 rounded-md border px-3 text-left text-sm font-medium disabled:opacity-45 ${
                isAutoTtsEnabled
                  ? "border-brand-600 bg-brand-50 text-brand-900"
                  : "border-hairline text-slate bg-white"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  {isAutoTtsEnabled ? (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-4 w-4" aria-hidden="true" />
                  )}
                  자동 읽기
                </span>
                <span>{isAutoTtsEnabled ? "켜짐" : "꺼짐"}</span>
              </span>
            </button>
          </div>
        </details>
      </div>

      <div
        ref={messageListRef}
        className="min-h-0 space-y-4 overflow-y-auto bg-[#f6faf8] px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-7"
        aria-live="polite"
      >
        {messages.map((message) => {
          return message.role === "user" ? (
            <div
              key={message.id}
              ref={message.id === scrollTargetMessageId ? scrollAnchorRef : null}
              className="flex justify-end"
            >
              <div className="from-navy-800 to-brand-800 shadow-brand-900/10 max-w-[78%] rounded-2xl rounded-br-md bg-gradient-to-br px-4 py-3 text-[16px] leading-relaxed font-semibold break-words whitespace-pre-wrap text-white shadow-md">
                {message.text}
              </div>
            </div>
          ) : (
            <div key={message.id}>
              <AssistantMessage
                messageId={message.id}
                response={message.content}
                disabled={isLoading || isConversationMode}
                isSpeaking={speakingMessageId === message.id}
                isPreparing={speakingMessageId === message.id && ttsStatus === "loading"}
                onChipClick={sendMessage}
                onSpeak={speakMessage}
                onStopSpeaking={stopSpeech}
                ttsSupported={ttsSupported}
              />
            </div>
          );
        })}
        {requestNotice && (
          <div className="border-hairline rounded-lg border bg-gray-50 p-3">
            <p role="status" className="text-ink text-sm leading-relaxed">
              {requestNotice}
            </p>
            <button
              type="button"
              onClick={() => void sendMessage(retryQuestion)}
              disabled={isLoading || !retryQuestion}
              className="border-hairline text-ink mt-2 min-h-11 rounded-md border bg-white px-4 text-sm font-semibold disabled:opacity-40"
            >
              같은 질문 다시 시도
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <DaiyuAvatar />
            <div
              role="status"
              className="text-brand-800 flex min-h-12 items-center gap-2 rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3 text-sm font-medium shadow-sm"
            >
              <LoaderCircle
                className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>다유가 답변을 준비하고 있어요</span>
            </div>
            <button
              type="button"
              onClick={cancelRequest}
              className="border-hairline text-steel min-h-11 rounded-md border bg-white px-3 text-sm font-medium"
            >
              답변 요청 취소
            </button>
          </div>
        ) : null}
      </div>

      <form
        className="border-hairline flex items-center gap-2 border-t bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:gap-2.5 sm:px-5"
        onSubmit={handleSubmit}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={500}
          placeholder={
            isConversationMode
              ? isLoading
                ? "답변을 준비하는 중이에요..."
                : isListening
                  ? "대화 모드로 듣는 중이에요..."
                  : "대화 모드가 켜져 있어요"
              : isListening
                ? "듣는 중이에요..."
                : "메시지를 입력하세요..."
          }
          aria-label="질문 입력"
          disabled={isLoading || isConversationMode}
          className="focus:border-brand-400 text-ink min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[16px] transition-colors placeholder:text-gray-600 focus:bg-white disabled:opacity-60"
        />
        <button
          type="button"
          disabled={isLoading || (!sttSupported && !isConversationMode)}
          onClick={isConversationMode ? toggleConversationMode : toggleVoiceInput}
          aria-pressed={isConversationMode || isListening}
          aria-label={
            isConversationMode
              ? "대화 모드 끄기"
              : isListening
                ? "음성 입력 중지"
                : "음성으로 질문 입력"
          }
          title={
            isConversationMode
              ? "대화 모드 끄기"
              : sttSupported
                ? isListening
                  ? "음성 입력 중지"
                  : "음성으로 질문 입력"
                : "이 브라우저는 음성 입력을 지원하지 않아요"
          }
          className={`inline-flex h-12 w-12 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-0 text-[12px] font-extrabold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 min-[390px]:w-auto min-[390px]:min-w-[98px] min-[390px]:px-3 ${
            isConversationMode || isListening
              ? "border-red-300 bg-red-500 shadow-red-500/20 hover:bg-red-600"
              : "border-brand-800 bg-brand-800 shadow-brand-900/15 hover:bg-brand-900"
          }`}
        >
          {isConversationMode || isListening ? (
            <MicOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Mic className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="hidden min-[390px]:inline">
            {isConversationMode ? "대화 종료" : isListening ? "듣기 중지" : "음성입력"}
          </span>
        </button>
        <button
          type="submit"
          disabled={isLoading || isConversationMode || !input.trim()}
          className="from-navy-800 to-brand-800 shadow-brand-900/20 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-all hover:scale-105 disabled:scale-100 disabled:opacity-40"
          aria-label="전송"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="sr-only" aria-live="polite">
          {voiceInputStatus}
        </span>
      </form>
    </dialog>
  );
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;

  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

function buildChatHistory(messages: Message[]): ChatHistoryItem[] {
  return messages.slice(-MAX_HISTORY_ITEMS).map((message): ChatHistoryItem => {
    if (message.role === "user") {
      return { role: "user", content: message.text };
    }

    const placeTitles = message.content.places
      ?.map((place) => place.title.trim())
      .filter(Boolean)
      .slice(0, 5);

    return {
      role: "assistant",
      content: message.content.message,
      ...(placeTitles?.length ? { placeTitles } : {})
    };
  });
}

function getSpeechRecognitionErrorMessage(error?: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "마이크 권한이 필요해요. 브라우저 권한을 허용한 뒤 다시 눌러주세요.";
    case "no-speech":
      return "음성이 잘 들리지 않았어요. 마이크를 다시 눌러 말해 주세요.";
    case "audio-capture":
      return "마이크를 찾지 못했어요. 기기 입력 설정을 확인해 주세요.";
    case "network":
      return "음성 인식 연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.";
    default:
      return "음성 입력을 다시 시도해 주세요.";
  }
}

function DaiyuAvatar({
  size = "md",
  variant = "profile",
  className = ""
}: {
  size?: "md" | "lg";
  variant?: "profile" | "full";
  className?: string;
}) {
  const sizeClass = size === "lg" ? "h-14 w-14 rounded-2xl" : "h-11 w-11 rounded-2xl";
  const imageSize = size === "lg" ? 56 : 44;
  const imageSrc = variant === "full" ? DAIYU_AVATAR_SRC : DAIYU_PROFILE_SRC;

  return (
    <span
      className={`${sizeClass} shadow-brand-500/20 ring-brand-100 shrink-0 overflow-hidden bg-white shadow-sm ring-1 ${className}`}
      aria-hidden="true"
    >
      <Image
        src={imageSrc}
        alt=""
        width={imageSize}
        height={imageSize}
        className="h-full w-full object-contain p-0.5"
        draggable={false}
      />
    </span>
  );
}

function PlaceRecommendationList({ places }: { places: PlaceRecommendation[] }) {
  return (
    <section className="mt-5 border-t border-gray-100 pt-5" aria-label="추천 장소">
      {places.length > 1 ? (
        <div className="mb-3">
          <h3 className="text-[15px] font-extrabold text-gray-950">추천 장소</h3>
          <p className="mt-1 text-[12px] leading-relaxed font-semibold text-gray-500">
            방문 목적과 이동 편의 정보를 함께 비교해 보세요.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {places.map((place, index) => {
          const placeKey = `${place.source || place.title}-${index}`;
          const sourceLabel = getPublicChatSourceLabel(place.source);

          return (
            <article
              key={placeKey}
              className="overflow-hidden rounded-[1.25rem] border border-gray-200 bg-gray-50/70 shadow-sm"
            >
              <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-5">
                <h4 className="text-[17px] leading-snug font-extrabold text-gray-950">
                  {formatChatDisplayText(place.title)}
                </h4>

                {place.address || place.tel ? (
                  <dl className="mt-3 grid gap-1.5 text-[12px] leading-relaxed text-gray-600">
                    {place.address ? (
                      <div className="grid grid-cols-[2.5rem_1fr] gap-2">
                        <dt className="font-extrabold text-gray-800">주소</dt>
                        <dd>{formatChatDisplayText(place.address)}</dd>
                      </div>
                    ) : null}
                    {place.tel ? (
                      <div className="grid grid-cols-[2.5rem_1fr] gap-2">
                        <dt className="font-extrabold text-gray-800">문의</dt>
                        <dd>{formatChatDisplayText(place.tel)}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                {place.address || place.latitude || place.contentId ? (
                  <Link
                    href={buildInternalPlaceMapHref(place)}
                    className="border-brand-200 text-brand-800 hover:border-brand-400 hover:bg-brand-50 mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-[12px] font-extrabold transition-colors"
                    aria-label={`${formatChatDisplayText(place.title)} 다대유 지도에서 보기`}
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    다대유 지도에서 보기
                  </Link>
                ) : null}
              </div>

              <div className="grid gap-5 px-4 py-4 sm:px-5">
                <div>
                  <h5 className="text-[13px] font-extrabold text-gray-950">
                    이곳에서 할 수 있는 것
                  </h5>
                  <p className="mt-1.5 text-[13px] leading-6 font-semibold whitespace-pre-line text-gray-700">
                    {formatChatDisplayText(place.activity)}
                  </p>
                </div>

                {place.tourDetails?.length ? (
                  <PlaceDetailSection title="방문 정보" items={place.tourDetails} tone="warm" />
                ) : null}

                <PlaceDetailSection
                  title="이동 편의 정보"
                  items={
                    place.accessibility.length
                      ? place.accessibility
                      : [
                          "공개된 이동 편의 정보가 충분하지 않아요. 방문 전 안내처에서 출입구와 이동 동선을 확인해 주세요."
                        ]
                  }
                  tone="brand"
                />

                <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                  <h5 className="text-[12px] font-extrabold text-gray-900">방문 전에</h5>
                  <ul className="mt-2 grid gap-1.5 text-[12px] leading-relaxed text-gray-600">
                    {getPlaceCheckItems(place).map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                        <span>{formatChatDisplayText(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {sourceLabel ? (
                  <p className="border-t border-gray-200 pt-3 text-[11px] leading-relaxed font-semibold text-gray-500">
                    정보 기준: {sourceLabel}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlaceDetailSection({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "brand" | "warm";
}) {
  return (
    <div>
      <h5 className="text-[13px] font-extrabold text-gray-950">{title}</h5>
      <ul className="mt-2 grid gap-2 text-[13px] leading-6 text-gray-700">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                tone === "brand" ? "bg-brand-500" : "bg-amber-500"
              }`}
            />
            <span className="whitespace-pre-line">
              {tone === "brand" ? formatChatAccessibilityText(item) : formatChatDisplayText(item)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function getPlaceCheckItems(place: PlaceRecommendation) {
  return [
    "운영시간과 편의시설은 현장 상황에 따라 달라질 수 있어요.",
    place.tel
      ? `출발 전 ${formatChatDisplayText(place.tel)}로 이용 가능 여부를 확인해 주세요.`
      : "출발 전 공식 홈페이지나 안내처에서 이용 가능 여부를 확인해 주세요."
  ];
}

function CourseRecommendationList({ courses }: { courses: TourismSharedCourse[] }) {
  return (
    <section className="mt-5 border-t border-gray-100 pt-5" aria-label="추천 공개 코스">
      <div className="mb-3">
        <h3 className="text-[15px] font-extrabold text-gray-950">함께 둘러보기 좋은 코스</h3>
        <p className="mt-1 text-[12px] leading-relaxed font-semibold text-gray-500">
          다대유에 공개된 코스 중에서 골랐어요.
        </p>
      </div>

      <div className="grid gap-3">
        {courses.map((course) => {
          const image = course.places.find((place) => place.firstimage)?.firstimage ?? null;
          const placeTrail = course.places
            .slice(0, 3)
            .map((place) => place.title)
            .join(" · ");

          return (
            <Link
              key={course.course_id}
              href={`/course/${course.course_id}`}
              className="group border-hairline hover:border-brand-300 focus-visible:outline-brand-600 grid min-h-28 grid-cols-[7rem_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`${course.course_nm} 코스 자세히 보기`}
            >
              <span className="bg-surface relative block min-h-28 overflow-hidden">
                <HomePlaceImage
                  src={image}
                  fallbackSources={course.places.map((place) => place.firstimage)}
                  alt={course.course_nm}
                  compactFallback
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
                />
              </span>

              <span className="flex min-w-0 flex-col p-3.5">
                <strong className="line-clamp-2 text-[14px] leading-snug font-extrabold text-gray-950">
                  {course.course_nm}
                </strong>
                {placeTrail ? (
                  <span className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed font-semibold text-gray-500">
                    {placeTrail}
                  </span>
                ) : null}
                <span className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-extrabold text-gray-600">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-800">
                    <Star className="h-3 w-3" aria-hidden="true" />
                    {course.average_rating.toFixed(1)}
                    {course.review_count ? ` · 후기 ${course.review_count}` : ""}
                  </span>
                  <span className="bg-brand-50 text-brand-800 inline-flex items-center gap-1 rounded-full px-2 py-1">
                    <Heart className="h-3 w-3" aria-hidden="true" />
                    {course.like_count}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
                    <Route className="h-3 w-3" aria-hidden="true" />
                    {course.place_count || course.places.length}곳
                  </span>
                </span>
                <span className="text-brand-800 mt-auto inline-flex items-center justify-end gap-1 pt-2 text-[12px] font-extrabold">
                  코스 자세히 보기
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function AssistantMessage({
  messageId,
  response,
  disabled,
  isSpeaking,
  isPreparing,
  onChipClick,
  onSpeak,
  onStopSpeaking,
  ttsSupported
}: {
  messageId: number;
  response: ChatResponse;
  disabled: boolean;
  isSpeaking: boolean;
  isPreparing: boolean;
  onChipClick: (message: string) => Promise<void>;
  onSpeak: (messageId: number, text: string) => void;
  onStopSpeaking: () => void;
  ttsSupported: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <DaiyuAvatar className="mt-1" />
      <div className="min-w-0 flex-1 rounded-[1.4rem] rounded-bl-md border border-gray-200 bg-white px-4 py-4 text-sm leading-relaxed text-gray-800 shadow-sm shadow-gray-200/60 sm:px-5 sm:py-5">
        <div className="-mt-1 mb-1 flex justify-end">
          <button
            type="button"
            disabled={!ttsSupported}
            onClick={() => {
              if (isSpeaking) {
                onStopSpeaking();
                return;
              }
              onSpeak(messageId, response.message);
            }}
            className="border-brand-200 text-brand-800 hover:border-brand-400 hover:bg-brand-50 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-500"
            aria-label={
              isPreparing ? "음성 생성 취소" : isSpeaking ? "답변 음성 중지" : "답변 음성 재생"
            }
            title={
              isPreparing
                ? "음성 준비 중 · 누르면 취소"
                : isSpeaking
                  ? "음성 재생 중지"
                  : "답변 음성 재생"
            }
          >
            {isPreparing ? (
              <LoaderCircle
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : isSpeaking ? (
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{isPreparing ? "준비 중 · 취소" : isSpeaking ? "읽기 중지" : "답변 읽기"}</span>
          </button>
        </div>
        {isPreparing && (
          <p role="status" className="mb-2 text-xs text-gray-600">
            음성을 준비하고 있어요. 긴 답변은 시간이 더 걸릴 수 있어요.
          </p>
        )}
        <p
          data-speakable
          className="text-[15px] leading-7 font-semibold whitespace-pre-line text-gray-950 sm:text-[16px] sm:leading-7"
        >
          {formatChatDisplayText(response.message)}
        </p>
        {!ttsSupported ? (
          <span className="mt-2 block text-[12px] font-semibold text-gray-600">
            현재 음성 읽어주기를 사용할 수 없어요.
          </span>
        ) : null}

        {response.places?.length ? <PlaceRecommendationList places={response.places} /> : null}

        {response.courses?.length ? <CourseRecommendationList courses={response.courses} /> : null}

        {response.chips.length > 0 ? (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <span className="mb-2 block text-[12px] font-extrabold text-gray-500">다음 질문</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {response.chips.map((chip) => (
                <button
                  type="button"
                  key={chip}
                  disabled={disabled}
                  onClick={() => void onChipClick(chip)}
                  className="border-brand-100 text-brand-900 hover:border-brand-300 hover:bg-brand-50 min-h-12 rounded-xl border bg-white px-3.5 py-3 text-left text-[13px] leading-snug font-bold transition-colors disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
