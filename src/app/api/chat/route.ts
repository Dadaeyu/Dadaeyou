import { NextResponse } from "next/server";
import {
  fetchTourWeather,
  formatWeatherItem,
  type TourWeatherDebug,
  type TourWeatherResult
} from "@/lib/tour-weather";
import {
  asksForSingleRecommendation,
  resolveRequestedRecommendationLimit,
  selectDiverseItems
} from "@/lib/chat/recommendationDiversity";
import { filterRowsByAccessibilityEvidence } from "@/lib/chat/accessibilityEvidence";
import {
  formatChatAccessibilityText,
  formatChatDisplayText,
  getPublicChatSourceLabel,
  shouldReturnChatPlaceCards,
  uniqueChatSuggestions
} from "@/lib/chat/presentation";
import {
  CHAT_MAX_BODY_BYTES,
  CHAT_MAX_MESSAGE_LENGTH,
  getRequestBodySizeBytes,
  isAllowedChatOrigin,
  isChatBodySizeAllowed,
  isChatMessageLengthAllowed,
  isValidChatClassifierEnvelope,
  resolveChatRateLimitPerMinute,
  stripChatDebugForPolicy
} from "@/lib/chat/request-policy";
import { resolveChatClientKey, ChatIdentityError } from "@/lib/chat/server/request-identity";
import { reserveChatUsage, ChatUsageError } from "@/lib/chat/server/usage";
import { createFixedWindowRateLimiter } from "@/lib/server/fixed-window-rate-limit";
import { readBoundedRequestBody } from "@/lib/server/read-bounded-request-body";
import { createTimeoutSignal } from "@/lib/server/timeout-signal";
import { getKnowledgeContentId } from "@/lib/chat/discoveryLinks";
import { shouldUseGroundedRecommendation } from "@/lib/chat/groundedRecommendation";
import {
  filterRowsByAllowedContentIds,
  filterRowsByExplicitCategories,
  resolveSessionChatCategories,
  resolveSessionChatTheme,
  type ExplicitChatTheme
} from "@/lib/chat/topicRelevance";
import { getBakeryChatKnowledgeRows } from "@/lib/theme/bakeryTheme";

type Confidence = "high" | "medium" | "low";

type ChatResponse = {
  message: string;
  card?: {
    title: string;
    rows: string[];
    source: string;
  };
  places?: PlaceCard[];
  chips: string[];
  confidence: Confidence;
  sources: string[];
  debug?: {
    analysis: QueryAnalysis;
    inputMessage?: string;
    rag?: RagDebug;
    searchTerms: string[];
    weather?: TourWeatherDebug;
  };
};

type PlaceCard = {
  contentId: string | null;
  title: string;
  category: string | null;
  address: string | null;
  tel: string | null;
  activity: string;
  tourDetails: string[];
  accessibility: string[];
  latitude: string | null;
  longitude: string | null;
  source: string | null;
};

type DeepSeekChatResponse = {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type OpenAIEmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

type KnowledgeRow = {
  id?: string | null;
  document_id?: string | null;
  chunk_index?: number | null;
  title?: string | null;
  category?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  similarity?: number | null;
  source?: string | null;
  tags?: string[] | null;
  updated_at?: string | null;
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
  requested_categories: string[];
  requested_theme: ExplicitChatTheme | null;
};

const CHAT_ACCESSIBILITY_NEEDS = [
  "wheelchair",
  "stroller",
  "elderly",
  "visual_impairment",
  "hearing_impairment",
  "mobility_access",
  "step_free",
  "accessible_toilet",
  "accessible_parking",
  "public_transport",
  "short_distance",
  "easy_explanation"
] as const;

type ChatHistoryItem = {
  role: "assistant" | "user";
  content: string;
  placeTitles: string[];
};

type ConversationContext = {
  history: ChatHistoryItem[];
  previousPlaceTitles: string[];
  seenPlaceTitles: string[];
  referencedPlaceTitle: string | null;
  isFollowUp: boolean;
  wantsDifferentPlaces: boolean;
};

type KnowledgeResult = {
  status: "not_configured" | "ready" | "empty" | "unavailable";
  rows: KnowledgeRow[];
  message: string;
  searchMode: "vector" | "keyword" | "none";
  debug?: RagDebug;
  embeddingModel?: string;
  fallbackReason?: string;
};

type EmbeddingDebug = {
  dimensions?: number;
  input?: string;
  model?: string;
  status: "created" | "failed" | "not_configured" | "skipped";
  vectorPreview?: number[];
  vectorPreviewNote?: string;
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
  embedding?: EmbeddingDebug;
  searchMode: "vector" | "keyword" | "none";
  statusMessage: string;
  vectorCandidateCount?: number;
};

type VectorReadiness = {
  ready: boolean;
  message: string;
};

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const SUPPORTED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);
const KNOWLEDGE_CANDIDATE_LIMIT = 500;
const KNOWLEDGE_RESULT_LIMIT = 5;
const VECTOR_CANDIDATE_LIMIT = 40;
const VECTOR_READINESS_TTL_MS = 60_000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_CONTENT_LENGTH = 1_000;
const MAX_CONTEXT_PLACE_TITLES = 5;
const EXTERNAL_FETCH_TIMEOUT_MS = 20_000;
const SITE_GUIDE_CHIPS = ["왜 만들었어?", "어떻게 질문하면 돼?", "데이터 출처는 어디야?"];
const FALLBACK_CHIPS = [
  "다대유는 어떤 사이트야?",
  "대전어린이회관 휠체어 가능해?",
  "대전한밭도서관 접근성 알려줘"
];

const chatRateLimiter = createFixedWindowRateLimiter({
  maxRequests: resolveChatRateLimitPerMinute,
  maxTrackedClients: 1_000,
  windowMs: 60_000
});

let vectorReadinessCache: {
  checkedAt: number;
  key: string;
  result: VectorReadiness;
} | null = null;

const GENERIC_SEARCH_TERMS = new Set([
  "대전",
  "추천",
  "여행",
  "장소",
  "어디",
  "오늘",
  "날씨",
  "정보",
  "알려줘"
]);

const CATEGORY_ALIASES: Record<string, string[]> = {
  관광지: ["관광", "관광지", "여행지", "공원", "산책", "코스"],
  문화시설: ["문화", "문화시설", "박물관", "미술관", "도서관", "전시"],
  음식점: ["음식", "음식점", "식당", "맛집", "카페", "밥"],
  쇼핑: ["쇼핑", "시장", "백화점", "상점"],
  숙박: ["숙박", "호텔", "숙소", "레지던스"],
  레포츠: ["레포츠", "운동", "체육", "캠핑"],
  공중화장실: ["화장실", "장애인화장실", "장애인 화장실", "공중화장실", "변기"],
  장애인주차장: ["장애인주차장", "장애인 주차장", "장애인 주차", "주차장", "주차"]
};

const ACCESSIBILITY_RULES: Record<string, { tags: string[]; fields: string[]; terms: string[] }> = {
  wheelchair: {
    tags: ["wheelchair", "mobility_access"],
    fields: [
      "parking",
      "publictransport",
      "route",
      "wheelchair",
      "exit",
      "elevator",
      "restroom",
      "auditorium",
      "room",
      "handicapetc"
    ],
    terms: ["휠체어", "장애인", "경사로", "엘리베이터", "화장실", "접근로"]
  },
  mobility_access: {
    tags: ["wheelchair", "mobility_access"],
    fields: ["parking", "publictransport", "route", "exit", "elevator", "restroom"],
    terms: ["이동약자", "장애인", "경사로", "엘리베이터", "화장실", "접근로"]
  },
  step_free: {
    tags: ["wheelchair", "mobility_access"],
    fields: ["route", "exit", "entrance", "elevator", "wheelchair"],
    terms: ["계단 없음", "단차 없음", "턱 없음", "무단차", "접근로", "경사로", "엘리베이터"]
  },
  accessible_toilet: {
    tags: ["wheelchair", "mobility_access"],
    fields: ["restroom", "toilet"],
    terms: ["장애인 화장실", "장애인화장실", "화장실"]
  },
  accessible_parking: {
    tags: ["wheelchair", "mobility_access"],
    fields: ["parking"],
    terms: ["장애인 주차", "장애인주차장", "전용 주차", "교통약자 주차"]
  },
  public_transport: {
    tags: ["mobility_access"],
    fields: ["publictransport", "public_transport"],
    terms: ["대중교통", "저상버스", "버스", "정류장", "역"]
  },
  short_distance: {
    tags: ["mobility_access"],
    fields: ["parking", "publictransport", "route", "exit", "elevator", "restroom"],
    terms: ["짧은 동선", "가까운", "근처", "이동거리", "동선", "휴식"]
  },
  easy_explanation: {
    tags: [],
    fields: ["parking", "publictransport", "route", "exit", "elevator", "restroom"],
    terms: ["쉬운 설명", "간단히", "핵심", "안내", "정보"]
  },
  elderly: {
    tags: ["mobility_access"],
    fields: ["publictransport", "route", "exit", "elevator", "restroom"],
    terms: ["이동약자", "계단", "경사로", "엘리베이터", "휴식"]
  },
  stroller: {
    tags: ["stroller"],
    fields: ["stroller", "lactationroom", "babysparechair", "infantsfamilyetc", "elevator"],
    terms: ["유모차", "수유실", "유아", "엘리베이터"]
  },
  visual_impairment: {
    tags: ["visual_impairment"],
    fields: [
      "braileblock",
      "helpdog",
      "guidehuman",
      "audioguide",
      "bigprint",
      "brailepromotion",
      "guidesystem",
      "blindhandicapetc"
    ],
    terms: ["점자", "보조견", "오디오", "안내요원", "시각장애"]
  },
  hearing_impairment: {
    tags: ["hearing_impairment"],
    fields: ["signguide", "videoguide", "hearingroom", "hearinghandicapetc"],
    terms: ["수화", "자막", "청각장애"]
  }
};

const systemPrompt = [
  "너는 대전 무장애 여행 앱 '다유'의 챗봇이다.",
  "사용자에게 이동약자, 휠체어, 유모차, 고령자 관점의 여행 정보를 한국어로 실용적으로 답한다.",
  "한국인이 일상 대화에서 쓰는 자연스러운 존댓말과 해요체로 답한다.",
  "친절하되 지나치게 감탄하거나 사용자의 말을 되풀이하지 않는다.",
  "짧은 질문에는 짧게 답하고, 결론을 먼저 말한 뒤 필요한 이유만 덧붙인다.",
  "'접근성 관련 편의 항목', '관련 근거가 확인돼요', '재확인 권장'처럼 보고서나 행정 안내문 같은 표현은 쓰지 않는다.",
  "정보 출처의 한계를 말할 때는 '공개된 안내를 보면', '방문 전에는 한 번 더 확인해 주세요'처럼 쉬운 말로 쓴다.",
  "같은 어미와 '확인해 주세요', '함께', '차근차근' 같은 표현을 반복하지 않는다.",
  "'가능해유', '좋아유', '그려유', '있어유'처럼 노골적인 방언형 어미는 쓰지 않는다.",
  "모든 문장 끝에 '~유'를 붙이는 식의 과장된 사투리는 절대 쓰지 않는다.",
  "억지스러운 사투리나 장난스러운 말투는 피한다.",
  "공개 안내 자료가 제공되면 그 내용을 우선 사용한다.",
  "근거 데이터에 없는 내용은 확정 정보처럼 단정하지 말고 방문 전 확인이 필요한 부분을 분명히 말한다.",
  "'갈 수 있어요', '이용 가능해요', '편리한 곳이에요'처럼 현장 상태까지 보장하는 표현은 피한다. 대신 '현재 공개된 정보에서는 관련 근거가 확인돼요', '확인된 항목은 이래요'처럼 근거의 범위를 먼저 밝힌다.",
  "특정 장소의 가능 여부를 물어도 답변 첫 문장부터 단정하지 않는다. 확인된 출입구, 엘리베이터, 화장실 등의 항목과 방문 전 다시 확인할 부분을 구분해서 말한다.",
  "추천 카드에 없는 사진, 이미지, 지도 캡처, 실시간 혼잡도 같은 정보를 제공한다고 말하지 않는다.",
  "기상청 관광기후지수 데이터가 제공되면 날씨 조건을 보조 근거로 반영하되, 실시간 현장 날씨를 직접 확인한 것처럼 말하지 않는다.",
  "날씨 데이터가 제공되지 않으면 현재 날씨를 알고 있다고 말하지 않는다.",
  "장소를 추천할 때는 접근성만 나열하지 말고, 각 장소가 어떤 곳인지, 가서 무엇을 볼 수 있는지, 누구에게 맞는지, 왜 가볼 만한지도 함께 말한다.",
  "말풍선 답변은 긴 상세 설명이 아니라 추천 판단 요약이다. 자세한 관광정보와 접근성 목록은 아래 추천 카드에서 확인하게 한다.",
  "원본 데이터의 HTML 태그, 내부 source ID, API·모델명, DB·검색 방식은 사용자 답변에 절대 노출하지 않는다.",
  "사용자가 쉬운 설명을 원하면 행정 용어를 피하고, 핵심 결론과 방문 전 확인할 점을 짧은 문장으로 나눈다.",
  "사용자가 짧은 동선이나 가까운 곳을 원하면 출입통로, 엘리베이터, 주차, 대중교통처럼 이동 부담을 줄이는 근거를 우선한다.",
  "추천 장소 설명은 관광지 성격과 '가서 할 수 있는 것'을 먼저 짧게 말하고, 그다음 사용자의 접근성 조건과 직접 관련된 핵심 근거만 붙인다.",
  "추천 답변에서는 관광지 정보와 접근성 정보가 모두 보여야 하지만, 본문에는 장소별 핵심 1~2문장만 쓴다.",
  "운영시간, 요금, 주차, 편의시설, 문의처는 본문에 길게 나열하지 말고 카드에서 확인하도록 안내한다.",
  "예: '천연기념물센터는 자연유산 표본과 전시를 실내에서 천천히 둘러볼 수 있는 곳이고, 휠체어 접근로와 장애인 화장실 근거도 있어요.'처럼 활동과 접근성을 함께 말한다.",
  "접근성 정보만 여러 문장 나열하고 활동 설명을 빼먹는 답변은 실패다.",
  "장소 추천은 사용자가 더 많이 요청하지 않으면 보통 2곳만 고르고, 각 장소마다 장소 성격, 볼거리나 할 일, 접근성 핵심 근거를 한 문장으로 압축한다.",
  "추천 질문에서 근거 후보가 2곳 이상 있으면 답변 본문에도 최소 2곳을 포함한다. 한 장소만 길게 쓰지 말고 장소별로 한 문장씩 비교한다.",
  "사용자의 접근성 조건과 직접 관련된 근거를 먼저 말한다. 예를 들어 시각장애 질문은 점자블록, 보조견, 안내요원, 오디오 가이드 같은 근거를 우선하고, 휠체어 정보는 보조 정보로만 다룬다.",
  "특정 장소 가능 여부 질문은 추천을 늘리지 말고 해당 장소의 가능 근거와 주의할 점을 먼저 답한다.",
  "최근 대화가 제공되면 '그중', '후보지', '첫 번째', '거기' 같은 표현을 직전 답변의 장소와 조건에 연결해서 답한다.",
  "후속 질문에는 앞 대화를 기억하고 있다는 것이 자연스럽게 드러나도록 '앞에서 본 후보 중에서는'처럼 맥락을 짧게 밝혀도 좋다.",
  "방문 활동은 제공된 제목, 분류, 내용, 방문 활동 힌트, 관광지 상세 정보 안에서만 말하고, 근거 없는 체험 프로그램이나 편의시설은 지어내지 않는다.",
  "단순 확인 질문은 2~4문장으로 답하고, 추천 질문은 전체 3~4문장으로 답한다.",
  "마크다운, 굵게 표시, 번호 목록은 쓰지 말고 일반 문장으로만 답한다."
].join(" ");

const classifierPrompt = [
  "사용자의 대전 여행 질문을 검색용 JSON으로만 분류한다.",
  "반드시 유효한 JSON 객체 하나만 출력한다.",
  "다른 설명, 마크다운, 코드블록은 출력하지 않는다.",
  "대전 무장애 여행, 접근성, 이동약자 여행, 장소 추천, 여행 코스, 여행 중 날씨 고려와 관련 있으면 in_scope를 true로 둔다.",
  "인사, 챗봇 사용법, 다유 서비스 설명처럼 앱 대화 시작에 필요한 질문도 in_scope를 true로 둔다.",
  "코딩, 과제, 투자, 정치, 일반 잡담, 여행과 무관한 지식 질문은 in_scope를 false로 둔다.",
  "scope_reason은 범위 판단 이유를 한국어 짧은 문장으로 쓴다.",
  "intent는 recommend_place, check_accessibility, ask_info 중 하나다.",
  "accessibility_needs는 wheelchair, stroller, elderly, visual_impairment, hearing_impairment, mobility_access, step_free, accessible_toilet, accessible_parking, public_transport, short_distance, easy_explanation 중 필요한 값만 넣는다.",
  "날씨, 오늘, 비, 더위, 추위, 미세먼지처럼 현재 조건이 필요하면 weather_sensitive를 true로 둔다.",
  "대전 앱이므로 location이 없으면 대전으로 둔다.",
  "place_name은 특정 장소명이 있으면 문자열, 없으면 null이다.",
  "keywords는 DB 검색에 쓸 한국어 핵심어 3~8개다.",
  "현재 질문에 '그중', '후보지', '첫 번째', '두 번째', '거기' 같은 표현이 있으면 최근 대화의 추천 후보와 조건을 이어서 해석한다.",
  "후속 질문은 새 질문으로 떼어내지 말고 이전 추천 장소와 사용자 조건을 검색어에 반영한다."
].join(" ");

function createErrorResponse(message: string): ChatResponse {
  return {
    message,
    chips: FALLBACK_CHIPS,
    confidence: "low",
    sources: []
  };
}

function createUnavailableResponse(message: string): ChatResponse {
  return {
    message,
    chips: FALLBACK_CHIPS,
    confidence: "low",
    sources: []
  };
}

function jsonChatResponse(response: ChatResponse, init?: ResponseInit) {
  return NextResponse.json(stripChatDebugForPolicy(response), init);
}

function jsonChatError(message: string, status: number, retryAfterSeconds?: number) {
  return NextResponse.json(
    { error: message },
    {
      headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
      status
    }
  );
}

function getPublicChatGuardMessage(error: ChatIdentityError | ChatUsageError) {
  if (error.status === 429) {
    return "오늘 이 요청 식별값에서 사용할 수 있는 챗봇 요청 횟수를 넘었어요. 잠시 뒤 다시 이용해 주세요.";
  }
  if (error.status === 402) {
    return "현재 챗봇 사용량이 한도에 도달했어요. 나중에 다시 이용해 주세요.";
  }
  return "현재 챗봇을 안전하게 처리하기 위한 서버 설정을 확인하는 중이에요. 잠시 뒤 다시 이용해 주세요.";
}

function createStaticSiteFaqResponse(message: string): ChatResponse | null {
  const compactMessage = normalizeStaticFaqText(message);

  if (
    includesAny(compactMessage, [
      "넌누구",
      "너는누구",
      "너누구",
      "누구니",
      "정체가뭐",
      "이름이뭐",
      "네이름"
    ])
  ) {
    return createSiteGuideResponse({
      message:
        "안녕하세요, 저는 다유예요. 대전에서 가볼 곳을 찾고, 휠체어나 유모차로 이동하기 괜찮은지 미리 살펴드려요. 궁금한 장소나 필요한 조건을 편하게 말씀해 주세요.",
      rows: [
        "이름: 다유",
        "역할: 대전 여행지와 접근성 정보 안내",
        "원칙: 확인된 정보와 방문 전 확인사항을 구분해 설명"
      ]
    });
  }

  if (
    isConversationalPhrase(compactMessage, [
      "안녕",
      "안녕하세요",
      "하이",
      "헬로",
      "반가워",
      "반갑습니다",
      "좋은아침",
      "잘지내",
      "잘지냈어",
      "다유안녕",
      "안녕다유"
    ])
  ) {
    return createConversationalResponse(
      "안녕하세요! 대전에서 가보고 싶은 곳이 있나요? 휠체어나 유모차처럼 이동할 때 필요한 조건도 같이 찾아드릴게요."
    );
  }

  if (
    isConversationalPhrase(compactMessage, [
      "고마워",
      "고마워요",
      "감사",
      "감사해요",
      "감사합니다",
      "도움됐어",
      "도움됐어요"
    ])
  ) {
    return createConversationalResponse(
      "도움이 됐다니 다행이에요. 또 궁금한 곳이 생기면 편하게 물어보세요."
    );
  }

  if (
    isConversationalPhrase(compactMessage, [
      "잘가",
      "잘가요",
      "안녕히",
      "다음에봐",
      "또보자",
      "또봐"
    ])
  ) {
    return createConversationalResponse(
      "좋아요, 다음에 또 봐요! 대전 여행을 준비할 때 언제든 찾아주세요."
    );
  }

  if (
    includesAny(compactMessage, [
      "어떤사이트",
      "무슨사이트",
      "뭐하는사이트",
      "뭐하는앱",
      "뭐하는서비스",
      "다대유뭐",
      "다유뭐",
      "사이트소개",
      "서비스소개"
    ])
  ) {
    return createSiteGuideResponse({
      message:
        "다대유는 대전 여행지와 이동 편의 정보를 한곳에서 찾아보는 서비스예요. 휠체어 출입구, 유모차 대여, 엘리베이터처럼 방문 전에 궁금한 내용을 미리 확인할 수 있어요. 여행지를 고른 뒤 지도와 추천 코스도 이어서 볼 수 있고요.",
      rows: [
        "대상: 대전 여행을 준비하는 누구나",
        "핵심: 접근성 정보와 여행지 탐색",
        "챗봇: 장소 추천과 방문 전 확인사항 정리"
      ]
    });
  }

  if (
    includesAny(compactMessage, ["왜만들", "만든이유", "기획의도", "서비스목적", "취지", "왜필요"])
  ) {
    return createSiteGuideResponse({
      message:
        "여행지 정보는 많지만 휠체어 출입구나 유모차 대여처럼 꼭 필요한 내용은 여러 곳에 흩어져 있잖아요. 다대유는 이런 정보를 한곳에 모아, 대전 여행을 조금 더 쉽게 계획할 수 있도록 만든 서비스예요.",
      rows: [
        "문제: 접근성 정보가 여러 곳에 흩어져 있음",
        "목표: 방문 전 확인 부담 줄이기",
        "방향: 모두가 함께 계획할 수 있는 대전 여행"
      ]
    });
  }

  if (
    includesAny(compactMessage, [
      "어떻게써",
      "사용법",
      "이용방법",
      "질문하면",
      "뭐물어",
      "뭘물어",
      "어떤질문",
      "질문예시",
      "뭐할수있",
      "무엇을할수있",
      "도와줄수있",
      "뭘도와"
    ])
  ) {
    return createSiteGuideResponse({
      message:
        "장소와 필요한 조건을 같이 말해주면 가장 정확하게 찾을 수 있어요. 예를 들어 '대전어린이회관은 휠체어로 갈 수 있어?', '유모차로 가기 좋은 문화시설 추천해줘'처럼 물어보세요. 아직 장소를 정하지 못했다면 원하는 지역이나 실내·실외 여부만 알려줘도 괜찮아요.",
      rows: [
        "장소 확인: 특정 여행지 접근성 질문",
        "조건 추천: 휠체어, 유모차, 고령자, 날씨",
        "주의: DB 근거가 없으면 추측하지 않음"
      ]
    });
  }

  if (
    includesAny(compactMessage, ["누가써", "누구를위한", "사용자", "대상", "장애인만", "비장애인"])
  ) {
    return createSiteGuideResponse({
      message:
        "다대유는 장애인만을 위한 서비스로 좁히기보다, 이동이 편한 여행을 준비하고 싶은 모두를 위한 서비스에 가까워요. 휠체어 이용자, 유모차를 끄는 가족, 고령자와 함께 가는 여행자, 처음 가는 장소가 걱정되는 사람도 편하게 쓸 수 있어요. 누구랑 가든 먼저 동선을 살펴보면 마음이 조금 놓이니까요.",
      rows: [
        "휠체어 이용자와 보호자",
        "유모차 동반 가족과 고령자 동반 여행자",
        "방문 전 동선을 미리 보고 싶은 사용자"
      ]
    });
  }

  if (
    includesAny(compactMessage, [
      "데이터출처",
      "정보출처",
      "근거",
      "믿을만",
      "어디서가져",
      "공공데이터"
    ])
  ) {
    return createSiteGuideResponse({
      message:
        "한국관광공사의 관광·무장애 여행정보와 대전시가 공개한 화장실, 장애인 주차장, 문화관광 정보를 함께 확인하고 있어요. 운영 여부나 편의시설은 달라질 수 있으니, 중요한 방문 전에는 공식 홈페이지나 안내처에 한 번 더 확인해 주세요.",
      rows: [
        "한국관광공사 관광·무장애 여행정보",
        "대전시 공공데이터",
        "운영 정보는 방문 전 재확인 권장"
      ]
    });
  }

  return null;
}

function createConversationalResponse(message: string): ChatResponse {
  return {
    message,
    chips: ["다대유는 어떤 사이트야?", "어떻게 질문하면 돼?", "유모차로 갈만한 문화시설"],
    confidence: "high",
    sources: []
  };
}

function createSiteGuideResponse({
  message,
  rows
}: {
  message: string;
  rows: string[];
}): ChatResponse {
  return {
    message,
    card: {
      title: "다대유 안내",
      rows,
      source: "고정 서비스 안내"
    },
    chips: [...SITE_GUIDE_CHIPS, "대전어린이회관 휠체어 가능해?"],
    confidence: "high",
    sources: []
  };
}

function normalizeStaticFaqText(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s!?.,~…'"“”‘’]+/g, "");
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function isConversationalPhrase(value: string, phrases: string[]) {
  return phrases.includes(value);
}

function normalizeDaiyuTone(value: string) {
  return formatChatDisplayText(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/있어유/g, "있어요")
    .replace(/없어유/g, "없어요")
    .replace(/좋아유/g, "좋아요")
    .replace(/가능해유/g, "가능해요")
    .replace(/괜찮아유/g, "괜찮아요")
    .replace(/맞아유/g, "맞아요")
    .replace(/해봐유/g, "해보세요")
    .replace(/봐유/g, "봐요")
    .replace(/예유/g, "예요")
    .replace(/^네,?\s*가능해요[.!]?\s*/u, "현재 공개된 정보에서는 이용 가능한 근거가 확인돼요. ")
    .replace(/현재 공개된 정보에서는/gu, "공개된 안내를 보면")
    .replace(/관련 근거가 확인돼요/gu, "관련 안내가 있어요")
    .replace(/접근성 관련 편의 항목/gu, "이동할 때 참고할 정보")
    .replace(/재확인/gu, "다시 확인")
    .replace(/휠체어 이용이 편리한 곳이에요[.!]?/gu, "휠체어로 방문할 때 참고할 정보가 있어요.");
}

function createOutOfScopeResponse(analysis: QueryAnalysis): ChatResponse {
  return {
    message:
      "저는 대전 여행지와 이동 편의 정보를 찾아드리는 다유예요. 이 질문은 제가 정확하게 답하기 어려워요. 대전 여행지나 휠체어·유모차 이동, 장애인 화장실 같은 내용을 물어보면 바로 찾아볼게요.",
    card: {
      title: "질문 범위 안내",
      rows: [
        "도움 가능: 대전 여행지, 접근성, 무장애 코스",
        `판단: ${analysis.scope_reason}`,
        "처리: 여행 범위 질문만 답변"
      ],
      source: "다유 안내"
    },
    chips: FALLBACK_CHIPS,
    confidence: "high",
    sources: [],
    debug: {
      analysis,
      searchTerms: buildSearchTerms(analysis)
    }
  };
}

function createNoKnowledgeResponse({
  analysis,
  inputMessage,
  knowledge,
  searchTerms,
  weather
}: {
  analysis: QueryAnalysis;
  inputMessage: string;
  knowledge: KnowledgeResult;
  searchTerms: string[];
  weather?: TourWeatherResult;
}): ChatResponse {
  const hasNoMatchingEvidence = knowledge.message.includes("조건 일치 없음");
  const target = analysis.place_name ? `'${analysis.place_name}'에 대한` : "질문 조건에 맞는";

  return {
    message: hasNoMatchingEvidence
      ? `지금 가지고 있는 자료에서는 ${target} 접근성 정보를 찾지 못했어요. 정확하지 않은 내용을 추측해서 말씀드릴 수는 없어서 여기서는 판단하지 않을게요. 방문을 계획하고 있다면 해당 장소의 공식 홈페이지나 안내전화로 확인해 주세요.`
      : "지금은 여행 정보를 불러오지 못했어요. 잠시 뒤 다시 물어봐 주세요.",
    card: {
      title: hasNoMatchingEvidence ? "찾은 정보가 없어요" : "정보를 불러오지 못했어요",
      rows: hasNoMatchingEvidence
        ? [
            "현재 연결된 자료에서는 확인되지 않아요",
            "확인되지 않은 내용은 추측하지 않아요",
            "방문 전 공식 안내를 확인해 주세요"
          ]
        : [
            "여행 정보를 잠시 불러오지 못했어요",
            "확인되지 않은 내용은 답하지 않아요",
            "잠시 뒤 다시 질문해 주세요"
          ],
      source: "다대유 여행 정보"
    },
    chips: [
      "대전어린이회관 휠체어 가능해?",
      "유모차로 갈만한 문화시설",
      "대전한밭도서관 접근성 알려줘"
    ],
    confidence: "low",
    sources: [],
    debug: {
      analysis,
      inputMessage,
      rag: knowledge.debug,
      searchTerms,
      ...getWeatherDebugPayload(weather)
    }
  };
}

function createSuccessResponse({
  message,
  inputMessage,
  knowledge,
  analysis,
  conversationContext,
  searchTerms,
  weather
}: {
  message: string;
  inputMessage: string;
  knowledge: KnowledgeResult;
  analysis: QueryAnalysis;
  conversationContext: ConversationContext;
  searchTerms: string[];
  weather?: TourWeatherResult;
}): ChatResponse {
  const evidenceRows = shouldFilterRowsByAccessibilityEvidence(analysis)
    ? filterRowsByAccessibilityEvidence(knowledge.rows, analysis.accessibility_needs)
    : knowledge.rows;
  if (shouldFilterRowsByAccessibilityEvidence(analysis) && !evidenceRows.length) {
    return createNoKnowledgeResponse({
      analysis,
      inputMessage,
      knowledge: {
        ...knowledge,
        rows: [],
        message: "조건 일치 없음: 요청한 접근성 근거를 확인할 수 없음"
      },
      searchTerms,
      weather
    });
  }
  const prioritizedPlaces = prioritizeConversationPlaces(
    buildPlaceCards(evidenceRows),
    conversationContext
  );
  const recommendationLimit = resolveRequestedRecommendationLimit(inputMessage, {
    defaultLimit: 2,
    maxLimit: 5
  });
  const messagePlaces = shouldUseGroundedRecommendation(analysis.intent, prioritizedPlaces.length)
    ? prioritizedPlaces.slice(0, recommendationLimit)
    : analysis.intent === "check_accessibility" || analysis.intent === "ask_info"
      ? prioritizedPlaces.slice(0, 1)
      : prioritizedPlaces;
  const places = shouldReturnChatPlaceCards({
    intent: analysis.intent,
    isFollowUp: conversationContext.isFollowUp,
    hasPlaces: messagePlaces.length > 0
  })
    ? messagePlaces
    : [];
  const placeFollowUpChips = places
    .flatMap((place) => buildPlaceFollowUps(place.title, place.category))
    .slice(0, 3);
  const responseMessage = shouldUseGroundedRecommendation(analysis.intent, messagePlaces.length)
    ? createCompactRecommendationMessage({
        analysis,
        inputMessage,
        conversationContext,
        places: messagePlaces
      })
    : analysis.intent === "check_accessibility" && messagePlaces.length
      ? createGroundedAccessibilityCheckMessage(messagePlaces[0], analysis.accessibility_needs)
      : message;
  const normalizedInput = normalizeStaticFaqText(inputMessage);
  const chips = uniqueChatSuggestions(
    [
      ...placeFollowUpChips,
      "유모차 기준으로 다시 추천해줘",
      "문화시설만 더 추천해줘",
      "장애인 화장실 있는 곳 알려줘"
    ],
    8
  )
    .filter((suggestion) => normalizeStaticFaqText(suggestion) !== normalizedInput)
    .slice(0, 4);

  return {
    message: responseMessage,
    places,
    chips,
    confidence: "medium",
    sources: [],
    debug: {
      analysis,
      inputMessage,
      rag: knowledge.debug,
      searchTerms,
      ...getWeatherDebugPayload(weather)
    }
  };
}

function shouldFilterRowsByAccessibilityEvidence(analysis: QueryAnalysis) {
  if (!analysis.accessibility_needs.length) return false;
  return analysis.intent === "recommend_place" || analysis.intent === "check_accessibility";
}

function prioritizeConversationPlaces(places: PlaceCard[], context: ConversationContext) {
  if (context.wantsDifferentPlaces) {
    return selectDiverseItems({
      items: places,
      getTitle: (place) => place.title,
      limit: places.length,
      seenTitles: context.seenPlaceTitles
    });
  }

  if (!context.isFollowUp || !context.previousPlaceTitles.length) return places;

  const placesByTitle = new Map(
    places.map((place) => [normalizeConversationReferenceText(place.title), place])
  );
  const contextTitles = context.referencedPlaceTitle
    ? [context.referencedPlaceTitle]
    : context.previousPlaceTitles;
  const previousPlaces = contextTitles.flatMap((title) => {
    const place = placesByTitle.get(normalizeConversationReferenceText(title));
    return place ? [place] : [];
  });

  return previousPlaces.length ? previousPlaces : places;
}

function createGroundedAccessibilityCheckMessage(place: PlaceCard, needs: string[]) {
  const facts = place.accessibility
    .map((item) => item.trim().replace(/[.。]$/, ""))
    .filter(Boolean)
    .slice(0, 2);

  if (!facts.length) {
    return `지금 확인할 수 있는 안내만으로는 ${place.title}의 이동 편의 정보를 충분히 알기 어려워요. 방문 전 공식 안내처에 동선을 확인해 주세요.`;
  }

  return [
    `공개된 안내에서 ${place.title}의 ${getAccessibilityInfoLabel(needs)} 정보를 찾았어요.`,
    joinAccessibilityFacts(facts),
    place.tel
      ? `시설 상황은 바뀔 수 있으니 방문 전에는 안내처(${place.tel})에 한 번 더 확인해 주세요.`
      : "시설 상황은 바뀔 수 있으니 방문 전에는 공식 안내처에 한 번 더 확인해 주세요."
  ].join(" ");
}

function getAccessibilityInfoLabel(needs: string[]) {
  if (needs.includes("stroller")) return "유모차 이용";
  if (needs.includes("accessible_toilet")) return "장애인 화장실";
  if (needs.includes("accessible_parking")) return "장애인 주차";
  if (needs.includes("public_transport")) return "대중교통";
  if (needs.includes("step_free")) return "계단 없는 이동";
  if (needs.includes("visual_impairment")) return "시각장애인 편의";
  if (needs.includes("hearing_impairment")) return "청각장애인 편의";
  if (needs.includes("elderly")) return "이동 편의";
  return "휠체어 이용";
}

function joinAccessibilityFacts(items: string[]) {
  const sentences = items.map(formatAccessibilityFact);
  if (sentences.length < 2) return sentences[0] || "";

  const firstSentence = sentences[0]
    .replace(/있다고 나와 있어요\.$/u, "있다고 안내돼 있고,")
    .replace(/있어요\.$/u, "있고,")
    .replace(/가능해요\.$/u, "가능하고,");

  return `${firstSentence} ${sentences[1]}`;
}

function createCompactRecommendationMessage({
  analysis,
  inputMessage,
  conversationContext,
  places
}: {
  analysis: QueryAnalysis;
  inputMessage: string;
  conversationContext: ConversationContext;
  places: PlaceCard[];
}) {
  const recommendedPlaces = places;
  const location = analysis.location?.trim() || "대전";
  const [firstPlace, secondPlace] = recommendedPlaces;
  const isFollowUp = conversationContext.isFollowUp;

  if (!firstPlace) {
    return "현재 조건에 맞는 장소를 찾지 못했어요.";
  }

  if (!secondPlace) {
    return [
      isFollowUp
        ? `앞에서 본 후보 중에서는 ${withObjectParticle(firstPlace.title)} 먼저 확인해보세요.`
        : `${getRecommendationLead(analysis, location)} ${withObjectParticle(firstPlace.title)} 먼저 살펴보세요.`,
      createCompactPlaceRecommendationSentence(firstPlace, analysis.accessibility_needs),
      "운영 시간과 자세한 편의시설은 아래 카드에서 볼 수 있어요."
    ].join(" ");
  }

  if (conversationContext.wantsDifferentPlaces) {
    const seenTitles = new Set(
      conversationContext.seenPlaceTitles.map(normalizeConversationReferenceText)
    );
    const allNew = recommendedPlaces.every(
      (place) => !seenTitles.has(normalizeConversationReferenceText(place.title))
    );
    const selectedPlaces = recommendedPlaces;
    const lead =
      selectedPlaces.length === 1
        ? `${allNew ? "앞에서 본 곳은 빼고" : "이번에는"} ${withObjectParticle(firstPlace.title)} 추천할게요.`
        : `${allNew ? "앞에서 본 곳과 겹치지 않게" : "이번에는"} ${joinSelectedPlaceNames(selectedPlaces)} 살펴보세요.`;

    return [
      lead,
      ...selectedPlaces.map((place) =>
        createCompactPlaceRecommendationSentence(place, analysis.accessibility_needs)
      ),
      "운영 시간과 자세한 편의시설은 아래 카드에서 볼 수 있어요."
    ].join(" ");
  }

  if (isFollowUp && (asksForSingleRecommendation(inputMessage) || !secondPlace)) {
    return [
      `앞에서 본 후보 중에서는 ${withObjectParticle(firstPlace.title)} 가장 먼저 추천할게요.`,
      createCompactPlaceRecommendationSentence(firstPlace, analysis.accessibility_needs),
      "운영 시간과 자세한 편의시설은 아래 카드에서 볼 수 있어요."
    ].join(" ");
  }

  return [
    isFollowUp
      ? `앞에서 본 후보 중에서는 ${joinSelectedPlaceNames(recommendedPlaces)} 먼저 비교해볼 만해요.`
      : `${getRecommendationLead(analysis, location)} ${joinSelectedPlaceNames(recommendedPlaces)} 먼저 살펴보세요.`,
    ...recommendedPlaces.map((place) =>
      createCompactPlaceRecommendationSentence(place, analysis.accessibility_needs)
    ),
    "운영 시간과 자세한 편의시설은 아래 카드에서 볼 수 있어요."
  ].join(" ");
}

function joinPlaceNames(firstTitle: string, secondTitle: string) {
  return `${firstTitle}${getKoreanParticle(firstTitle, "과", "와")} ${secondTitle}${getKoreanParticle(secondTitle, "을", "를")}`;
}

function joinSelectedPlaceNames(places: PlaceCard[]) {
  if (places.length === 1) return withObjectParticle(places[0].title);
  if (places.length === 2) return joinPlaceNames(places[0].title, places[1].title);

  const [firstPlace, secondPlace] = places;
  return `${firstPlace.title}, ${secondPlace.title} 등 ${places.length}곳을`;
}

function withObjectParticle(value: string) {
  return `${value}${getKoreanParticle(value, "을", "를")}`;
}

function withTopicParticle(value: string) {
  return `${value}${getKoreanParticle(value, "은", "는")}`;
}

function getKoreanParticle(
  value: string,
  withFinalConsonant: string,
  withoutFinalConsonant: string
) {
  return hasFinalConsonant(value) ? withFinalConsonant : withoutFinalConsonant;
}

function hasFinalConsonant(value: string) {
  const lastHangul = Array.from(value.trim())
    .reverse()
    .find((char) => {
      const code = char.charCodeAt(0);
      return code >= 0xac00 && code <= 0xd7a3;
    });

  if (!lastHangul) return false;

  return (lastHangul.charCodeAt(0) - 0xac00) % 28 !== 0;
}

function createCompactPlaceRecommendationSentence(place: PlaceCard, needs: string[]) {
  const activity = place.activity.trim().replace(/[.。]$/, "");
  const activitySentence = `${
    normalizeForSearch(activity).startsWith(normalizeForSearch(place.title))
      ? activity
      : `${withTopicParticle(place.title)} ${activity}`
  }${activity.endsWith("곳") ? "이에요." : "예요."}`;
  const accessibilityFact = getPreferredAccessibilityFact(place.accessibility, needs);

  return accessibilityFact
    ? `${activitySentence} ${formatAccessibilityFact(accessibilityFact)}`
    : `${activitySentence} 자세한 이동 편의 정보는 아래 카드에서 확인할 수 있어요.`;
}

function getRecommendationLead(analysis: QueryAnalysis, location: string) {
  if (analysis.accessibility_needs.includes("stroller")) {
    return "유모차로 방문할 곳을 찾는다면";
  }
  if (analysis.accessibility_needs.includes("short_distance")) {
    return "이동거리가 짧은 곳을 찾는다면";
  }
  if (analysis.accessibility_needs.includes("accessible_toilet")) {
    return "장애인 화장실 정보를 함께 보고 싶다면";
  }
  if (analysis.accessibility_needs.includes("accessible_parking")) {
    return "장애인 주차 정보를 함께 보고 싶다면";
  }
  if (analysis.accessibility_needs.includes("public_transport")) {
    return "대중교통으로 이동할 곳을 찾는다면";
  }
  if (
    analysis.accessibility_needs.includes("wheelchair") ||
    analysis.accessibility_needs.includes("mobility_access") ||
    analysis.accessibility_needs.includes("step_free")
  ) {
    return "휠체어 이동을 고려하고 있다면";
  }
  if (analysis.accessibility_needs.includes("elderly")) {
    return "걷는 부담이 적은 곳을 찾는다면";
  }
  if (analysis.accessibility_needs.includes("visual_impairment")) {
    return "시각장애인 편의 정보를 함께 보고 싶다면";
  }
  if (analysis.accessibility_needs.includes("hearing_impairment")) {
    return "청각장애인 편의 정보를 함께 보고 싶다면";
  }

  return `${location}에서 가볼 곳을 찾는다면`;
}

function getPreferredAccessibilityFact(items: string[], needs: string[]) {
  const preferredLabels = needs.includes("stroller")
    ? ["유모차", "엘리베이터", "출입통로", "수유실"]
    : needs.includes("accessible_toilet")
      ? ["장애인 화장실", "화장실"]
      : needs.includes("accessible_parking")
        ? ["장애인 주차", "주차"]
        : needs.includes("public_transport")
          ? ["대중교통", "버스", "정류장", "접근로"]
          : needs.includes("step_free")
            ? ["출입통로", "엘리베이터", "접근로"]
            : needs.includes("short_distance")
              ? ["출입통로", "엘리베이터", "장애인 주차", "주차", "휴식"]
              : needs.includes("visual_impairment")
                ? ["점자블록", "보조견", "안내요원", "오디오 가이드"]
                : needs.includes("hearing_impairment")
                  ? ["수화", "자막", "청각"]
                  : ["출입통로", "엘리베이터", "장애인 주차", "장애인 화장실"];

  return (
    preferredLabels
      .map((label) => items.find((item) => item.startsWith(`${label}:`)))
      .find((item): item is string => Boolean(item)) || items[0]
  );
}

function formatAccessibilityFact(item: string) {
  const [rawLabel, ...rawDetailParts] = formatChatAccessibilityText(item).split(":");
  const label = rawLabel.trim();
  const detail = rawDetailParts
    .join(":")
    .trim()
    .replace(/_(?:무장애|시각장애인|청각장애인|지체장애인)?\s*편의시설/gu, "")
    .replace(/동반가능/gu, "동반 가능")
    .replace(/대여가능/gu, "대여 가능");
  const sentenceDetail = detail.replace(/\s*\n+\s*/gu, " ").replace(/[\t ]{2,}/gu, " ");

  if (label === "접근로" && sentenceDetail.includes("대중교통")) {
    const stop = detail.match(/대중교통:\s*([^\n.!?]+)/u)?.[1]?.trim();
    const lowFloorBus = detail.match(/저상버스:\s*([^\n.!?]+)/u)?.[1]?.trim();
    const transitDetails = [
      stop ? (stop.endsWith("정류장") ? stop : `${stop} 정류장`) : null,
      lowFloorBus ? `저상버스 ${lowFloorBus}` : null
    ].filter((value): value is string => Boolean(value));

    return transitDetails.length
      ? `대중교통으로 갈 수 있고, ${transitDetails.join("과 ")} 이용 정보가 안내돼 있어요.`
      : "대중교통으로 갈 수 있다고 안내돼 있어요.";
  }

  if (/주출입구.*단차가 없어.*휠체어 접근 가능함/u.test(sentenceDetail)) {
    return "주출입구에 단차가 없어 휠체어로 들어갈 수 있다고 나와 있어요.";
  }
  if (/주출입구.*턱이 없어.*휠체어 접근 가능함/u.test(sentenceDetail)) {
    return "주출입구에 턱이 없어 휠체어로 들어갈 수 있다고 나와 있어요.";
  }
  if (/장애인\s*전용\s*주차구역\s*있음\(지하\)/u.test(sentenceDetail)) {
    return "지하에 장애인 전용 주차구역이 있어요.";
  }
  if (/장애인\s*전용\s*주차구역\s*있음/u.test(sentenceDetail)) {
    return "장애인 전용 주차구역이 있어요.";
  }
  if (/엘리베이터.*있음/u.test(sentenceDetail)) {
    return "엘리베이터가 있어요.";
  }
  if (/장애인\s*전용?\s*화장실.*있음/u.test(sentenceDetail)) {
    return "장애인 화장실이 있어요.";
  }
  if (/유모차.*무료\s*대여\s*가능/u.test(sentenceDetail)) {
    return "안내데스크에서 유모차를 무료로 빌릴 수 있어요.";
  }
  if (/유모차.*대여\s*가능/u.test(sentenceDetail)) {
    return "유모차를 빌릴 수 있어요.";
  }

  const naturalDetail = sentenceDetail
    .replace(/가능함$/u, "가능해요")
    .replace(/있음$/u, "있어요")
    .replace(/구비$/u, "갖춰져 있어요");

  return `${withTopicParticle(label)} ${naturalDetail}${/[.!?]$/u.test(naturalDetail) ? "" : "."}`;
}

function buildPlaceCards(rows: KnowledgeRow[]): PlaceCard[] {
  const groupedRows = new Map<string, KnowledgeRow[]>();

  for (const row of rows) {
    const title = getRowText(row, "title") || "제목 없음";
    const normalizedTitle = normalizeForSearch(title);
    if (!normalizedTitle) continue;

    const group = groupedRows.get(normalizedTitle) || [];
    group.push(row);
    groupedRows.set(normalizedTitle, group);
  }

  return Array.from(groupedRows.values())
    .map((placeRows) => {
      const title = formatChatDisplayText(
        getFirstTextFromRows(placeRows, (row) => getRowText(row, "title")) || "제목 없음"
      );
      const contentId = getFirstTextFromRows(placeRows, (row) =>
        getKnowledgeContentId(row.metadata)
      );
      const category = cleanOptionalChatText(getBestPlaceCategory(placeRows));
      const address = cleanOptionalChatText(getFirstTextFromRows(placeRows, getRowAddress));
      const tel = cleanOptionalChatText(getFirstTextFromRows(placeRows, getRowTel));
      const latitude = getFirstTextFromRows(placeRows, getRowLatitude);
      const longitude = getFirstTextFromRows(placeRows, getRowLongitude);
      const rawSource = getFirstTextFromRows(placeRows, (row) => getRowText(row, "source"));
      const accessibility = Array.from(
        new Set(placeRows.flatMap((row) => buildPlaceAccessibilitySummary(row)))
      ).slice(0, 6);

      return {
        contentId,
        title,
        category,
        address,
        tel,
        activity: getMergedActivityHint(placeRows),
        tourDetails: buildPlaceTourDetails(placeRows),
        accessibility,
        latitude,
        longitude,
        source: getPublicChatSourceLabel(rawSource)
      };
    })
    .slice(0, 5);
}

function cleanOptionalChatText(value: string | null) {
  if (!value) return null;
  return formatChatDisplayText(value) || null;
}

function getFirstTextFromRows(rows: KnowledgeRow[], getter: (row: KnowledgeRow) => string | null) {
  for (const row of rows) {
    const value = getter(row);
    if (value) return value;
  }
  return null;
}

function getBestPlaceCategory(rows: KnowledgeRow[]) {
  const categories = rows
    .map((row) => getRowText(row, "category"))
    .filter((category): category is string => Boolean(category));

  return (
    categories.find((category) => category === "관광지") ||
    categories.find((category) => !["공중화장실", "장애인주차장"].includes(category)) ||
    categories[0] ||
    null
  );
}

function getRowAddress(row: KnowledgeRow) {
  const metadata = row.metadata || {};
  return (
    textMetadataValue(metadata.address) ||
    [metadata.road_address, metadata.detail_address]
      .map(textMetadataValue)
      .filter(Boolean)
      .join(" ") ||
    null
  );
}

function getRowTel(row: KnowledgeRow) {
  const metadata = row.metadata || {};
  return (
    textMetadataValue(metadata.tel) ||
    textMetadataValue(metadata.manage_phone) ||
    textMetadataValue(metadata.refadNo) ||
    null
  );
}

function getRowLatitude(row: KnowledgeRow) {
  const metadata = row.metadata || {};
  return (
    textMetadataValue(metadata.latitude) ||
    textMetadataValue(metadata.mapy) ||
    textMetadataValue(metadata.mapLat) ||
    null
  );
}

function getRowLongitude(row: KnowledgeRow) {
  const metadata = row.metadata || {};
  return (
    textMetadataValue(metadata.longitude) ||
    textMetadataValue(metadata.mapx) ||
    textMetadataValue(metadata.mapLot) ||
    null
  );
}

function getMergedActivityHint(rows: KnowledgeRow[]) {
  const title = getFirstTextFromRows(rows, (row) => getRowText(row, "title")) || "";
  const summary = getFirstTextFromRows(rows, (row) => {
    const value = textMetadataValue(row.metadata?.summary);
    return isUsefulTourSummary(value, title) ? value : null;
  });
  const activity =
    getFirstTextFromRows(rows, getRowActivityHint) ||
    "방문 목적과 동선을 함께 확인해볼 수 있는 장소";

  return formatChatDisplayText(summary ? `${summary} ${activity}` : activity);
}

function buildPlaceTourDetails(rows: KnowledgeRow[]) {
  const details = rows.flatMap((row) => {
    const metadata = row.metadata || {};
    const title = getRowText(row, "title") || "";
    const summary = textMetadataValue(metadata.summary);

    return [
      isUsefulTourSummary(summary, title) ? `개요: ${summary}` : null,
      textMetadataValue(metadata.operating_time)
        ? `운영시간: ${textMetadataValue(metadata.operating_time)}`
        : null,
      textMetadataValue(metadata.fee) ? `이용요금: ${textMetadataValue(metadata.fee)}` : null,
      textMetadataValue(metadata.parking_facility)
        ? `주차: ${textMetadataValue(metadata.parking_facility)}`
        : null,
      textMetadataValue(metadata.convenience_facility)
        ? `편의시설: ${textMetadataValue(metadata.convenience_facility)}`
        : null
    ];
  });

  return Array.from(
    new Set(
      details
        .filter((detail): detail is string => Boolean(detail))
        .map(formatChatDisplayText)
        .filter(Boolean)
    )
  ).slice(0, 5);
}

function isUsefulTourSummary(summary: string | null, title: string) {
  if (!summary || summary.length < 10) return false;

  const normalizedSummary = normalizeForSearch(summary);
  const normalizedTitle = normalizeForSearch(title);
  return Boolean(normalizedSummary && normalizedSummary !== normalizedTitle);
}

function buildPlaceAccessibilitySummary(row: KnowledgeRow) {
  const metadata = row.metadata || {};
  const accessibility = getRowAccessibility(row);
  const items = Object.entries(accessibility)
    .filter(([, value]) => value)
    .slice(0, 4)
    .map(([key, value]) => formatChatAccessibilityText(`${getAccessibilityLabel(key)}: ${value}`));

  const structuredItems = [
    textMetadataValue(metadata.parking_facility)
      ? `주차: ${textMetadataValue(metadata.parking_facility)}`
      : null,
    textMetadataValue(metadata.convenience_facility)
      ? `편의시설: ${textMetadataValue(metadata.convenience_facility)}`
      : null,
    textMetadataValue(metadata.men_disabled_bowl_num) ||
    textMetadataValue(metadata.women_disabled_bowl_num)
      ? `장애인 화장실: 남자 대변기 ${
          textMetadataValue(metadata.men_disabled_bowl_num) || "0"
        }개, 여성 대변기 ${textMetadataValue(metadata.women_disabled_bowl_num) || "0"}개`
      : null
  ].filter((item): item is string => Boolean(item));

  return Array.from(
    new Set([...items, ...structuredItems].map(formatChatAccessibilityText).filter(Boolean))
  ).slice(0, 4);
}

function getAccessibilityLabel(key: string) {
  const labels: Record<string, string> = {
    parking: "장애인 주차",
    publictransport: "대중교통",
    route: "접근로",
    wheelchair: "휠체어",
    exit: "출입통로",
    elevator: "엘리베이터",
    restroom: "장애인 화장실",
    braileblock: "점자블록",
    helpdog: "보조견",
    guidehuman: "안내요원",
    audioguide: "오디오 가이드",
    stroller: "유모차",
    lactationroom: "수유실"
  };

  return labels[key] || key;
}

function buildPlaceFollowUps(title: string, category: string | null) {
  if (category === "공중화장실") {
    return [`${title} 장애인 화장실 자세히 알려줘`, `${title} 위치 알려줘`];
  }

  if (category === "장애인주차장") {
    return [`${title} 위치 자세히 알려줘`, `${title} 주변 여행지 추천해줘`];
  }

  return [`${title} 자세히 알려줘`, `${title} 휠체어 가능해?`];
}

function getSupabaseConfig() {
  const rawUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  const schema = (process.env.SUPABASE_SCHEMA || "chatbot").trim();
  const rawTable = (process.env.SUPABASE_CHAT_TABLE || "chunks").trim();
  const [schemaFromTable, tableFromTable] = rawTable.includes(".") ? rawTable.split(".", 2) : [];

  return {
    key,
    schema: schemaFromTable || schema,
    table: tableFromTable || rawTable,
    url: normalizeSupabaseRestUrl(rawUrl)
  };
}

function normalizeSupabaseRestUrl(rawUrl: string) {
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    return rawUrl.includes("/rest/v1") ? rawUrl.replace(/\/$/, "") : `${parsed.origin}/rest/v1`;
  } catch {
    return "";
  }
}

function getDeepSeekModel() {
  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
  return SUPPORTED_MODELS.has(model) ? model : DEFAULT_MODEL;
}

function getEmbeddingConfig() {
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS || DEFAULT_EMBEDDING_DIMENSIONS);

  return {
    apiKey: (process.env.OPENAI_API_KEY || process.env.EMBEDDING_API_KEY || "").trim(),
    dimensions:
      Number.isInteger(dimensions) && dimensions > 0 ? dimensions : DEFAULT_EMBEDDING_DIMENSIONS,
    model: (process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim()
  };
}

function getWeatherDebugPayload(weather?: TourWeatherResult) {
  if (!weather || weather.status === "not_requested") return {};
  return { weather: weather.debug };
}

function getSupabaseHeaders(config: ReturnType<typeof getSupabaseConfig>, extra?: HeadersInit) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    "Accept-Profile": config.schema,
    "Content-Profile": config.schema,
    ...(extra || {})
  };
}

function normalizeChatHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value.slice(-MAX_HISTORY_ITEMS).flatMap((item): ChatHistoryItem[] => {
    if (!item || typeof item !== "object") return [];

    const record = item as Record<string, unknown>;
    if (record.role !== "assistant" && record.role !== "user") return [];

    const content =
      typeof record.content === "string"
        ? record.content.trim().slice(0, MAX_HISTORY_CONTENT_LENGTH)
        : "";
    if (!content) return [];

    const placeTitles = Array.isArray(record.placeTitles)
      ? Array.from(
          new Set(
            record.placeTitles
              .filter((title): title is string => typeof title === "string")
              .map((title) => title.trim().slice(0, 80))
              .filter(Boolean)
          )
        ).slice(0, MAX_CONTEXT_PLACE_TITLES)
      : [];

    return [{ role: record.role, content, placeTitles }];
  });
}

function createConversationContext(
  history: ChatHistoryItem[],
  message: string
): ConversationContext {
  const previousAssistantMessage = [...history]
    .reverse()
    .find((item) => item.role === "assistant" && item.placeTitles.length);
  const previousPlaceTitles = previousAssistantMessage?.placeTitles || [];
  const seenPlaceTitles = Array.from(
    new Set(history.filter((item) => item.role === "assistant").flatMap((item) => item.placeTitles))
  );
  const referencedPlaceTitle = resolveReferencedPlaceTitle(message, previousPlaceTitles);
  const compactMessage = normalizeConversationReferenceText(message);
  const wantsDifferentPlaces = asksForDifferentPlaces(compactMessage);
  const isFollowUp =
    previousPlaceTitles.length > 0 &&
    (wantsDifferentPlaces ||
      Boolean(referencedPlaceTitle) ||
      includesAny(compactMessage, [
        "후보지",
        "후보중",
        "그중",
        "이중",
        "이곳중",
        "여기서",
        "앞에서",
        "아까",
        "방금",
        "추천한곳",
        "추천해준곳",
        "추천해준",
        "그곳",
        "거기",
        "첫번째",
        "두번째",
        "세번째",
        "1번",
        "2번",
        "3번",
        "다시추천",
        "휠체어",
        "유모차",
        "장애인",
        "주차",
        "화장실",
        "엘리베이터",
        "실내",
        "비오는날",
        "1박2일",
        "당일",
        "코스",
        "동선"
      ]));

  return {
    history,
    previousPlaceTitles,
    seenPlaceTitles,
    referencedPlaceTitle,
    isFollowUp,
    wantsDifferentPlaces
  };
}

function asksForDifferentPlaces(compactMessage: string) {
  return includesAny(compactMessage, [
    "다른곳",
    "다른데",
    "다른장소",
    "또다른",
    "말고",
    "빼고",
    "겹치지않",
    "새로운곳",
    "새장소",
    "더추천",
    "또추천",
    "다시추천"
  ]);
}

function resolveReferencedPlaceTitle(message: string, placeTitles: string[]) {
  if (!placeTitles.length) return null;

  const compactMessage = normalizeConversationReferenceText(message);
  const explicitlyNamedPlace = placeTitles.find((title) =>
    compactMessage.includes(normalizeConversationReferenceText(title))
  );
  if (explicitlyNamedPlace) return explicitlyNamedPlace;

  const ordinalIndex = [
    ["첫번째", "첫째", "1번"],
    ["두번째", "둘째", "2번"],
    ["세번째", "셋째", "3번"]
  ].findIndex((patterns) => includesAny(compactMessage, patterns));

  if (ordinalIndex >= 0) return placeTitles[ordinalIndex] || null;

  if (placeTitles.length === 1 && includesAny(compactMessage, ["그곳", "거기", "여기", "이곳"])) {
    return placeTitles[0];
  }

  return null;
}

function normalizeConversationReferenceText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s!?.,'"]/g, "");
}

function applyConversationContext(
  analysis: QueryAnalysis,
  message: string,
  context: ConversationContext
): QueryAnalysis {
  if (!context.isFollowUp) return analysis;

  const compactMessage = normalizeConversationReferenceText(message);
  const asksForCandidateRecommendation = includesAny(compactMessage, [
    "추천",
    "어디",
    "어느",
    "제일",
    "가장",
    "골라",
    "고르"
  ]);
  const inheritedNeeds = fallbackAnalysis(
    formatConversationHistory(context.history)
  ).accessibility_needs;
  const currentNeeds = fallbackAnalysis(message).accessibility_needs;

  return {
    ...analysis,
    in_scope: true,
    scope_reason: context.wantsDifferentPlaces
      ? "이전 추천과 겹치지 않는 새 장소 요청"
      : "직전 추천 후보를 이어서 묻는 후속 질문",
    intent: context.wantsDifferentPlaces
      ? "recommend_place"
      : context.referencedPlaceTitle
        ? analysis.intent
        : asksForCandidateRecommendation
          ? "recommend_place"
          : analysis.intent,
    place_name: context.wantsDifferentPlaces ? null : context.referencedPlaceTitle,
    location: analysis.location || "대전",
    accessibility_needs: currentNeeds.length
      ? currentNeeds
      : analysis.accessibility_needs.length
        ? analysis.accessibility_needs
        : inheritedNeeds,
    keywords: Array.from(
      new Set([
        ...(context.wantsDifferentPlaces
          ? []
          : context.referencedPlaceTitle
            ? [context.referencedPlaceTitle]
            : context.previousPlaceTitles),
        ...analysis.keywords
      ])
    ).slice(0, 8)
  };
}

function formatConversationHistory(history: ChatHistoryItem[]) {
  if (!history.length) return "";

  return history
    .slice(-6)
    .map((item) => {
      const speaker = item.role === "user" ? "사용자" : "다유";
      const placeContext = item.placeTitles.length
        ? ` (추천 후보: ${item.placeTitles.join(", ")})`
        : "";
      return `${speaker}: ${item.content}${placeContext}`;
    })
    .join("\n");
}

function createChatCompletionHistory(history: ChatHistoryItem[]) {
  return history.slice(-6).map((item) => ({
    role: item.role,
    content:
      item.role === "assistant" && item.placeTitles.length
        ? `${item.content}\n추천 후보: ${item.placeTitles.join(", ")}`
        : item.content
  }));
}

async function classifyQuestion({
  apiKey,
  history,
  message,
  model
}: {
  apiKey: string;
  history: ChatHistoryItem[];
  message: string;
  model: string;
}): Promise<QueryAnalysis | null> {
  try {
    const response = await fetchWithTimeout(DEEPSEEK_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: classifierPrompt },
          {
            role: "user",
            content: [
              "다음 질문을 JSON으로 분류해.",
              "예시 출력:",
              '{"in_scope":true,"scope_reason":"대전 무장애 여행지 추천 질문","intent":"recommend_place","accessibility_needs":["wheelchair"],"weather_sensitive":true,"place_name":null,"location":"대전","keywords":["휠체어","장애인","날씨","추천"]}',
              ...(history.length ? ["최근 대화:", formatConversationHistory(history)] : []),
              `현재 질문: ${message}`
            ].join("\n")
          }
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        max_tokens: 300,
        temperature: 0,
        stream: false
      })
    });

    if (!response.ok) return null;

    const data = (await response.json()) as DeepSeekChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as unknown;
    if (!isValidChatClassifierEnvelope(parsed)) return null;
    return normalizeAnalysis(parsed, message);
  } catch {
    return null;
  }
}

function normalizeAnalysis(value: unknown, message: string): QueryAnalysis {
  const input = typeof value === "object" && value ? value : {};
  const record = input as Record<string, unknown>;
  const fallback = fallbackAnalysis(message);
  const intent =
    record.intent === "recommend_place" ||
    record.intent === "check_accessibility" ||
    record.intent === "ask_info"
      ? record.intent
      : fallback.intent;
  const allowedNeeds = new Set<string>(CHAT_ACCESSIBILITY_NEEDS);
  const accessibilityNeeds = Array.isArray(record.accessibility_needs)
    ? record.accessibility_needs
        .filter((item): item is string => typeof item === "string")
        .filter((item) => allowedNeeds.has(item))
    : fallback.accessibility_needs;
  const keywords = Array.isArray(record.keywords)
    ? record.keywords
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : fallback.keywords;

  return {
    in_scope: typeof record.in_scope === "boolean" ? record.in_scope : fallback.in_scope,
    scope_reason:
      typeof record.scope_reason === "string" && record.scope_reason.trim()
        ? record.scope_reason.trim()
        : fallback.scope_reason,
    intent,
    accessibility_needs: accessibilityNeeds,
    weather_sensitive:
      typeof record.weather_sensitive === "boolean"
        ? record.weather_sensitive
        : fallback.weather_sensitive,
    place_name:
      typeof record.place_name === "string" && record.place_name.trim()
        ? record.place_name.trim()
        : null,
    location:
      typeof record.location === "string" && record.location.trim()
        ? record.location.trim()
        : "대전",
    keywords,
    requested_categories: [],
    requested_theme: null
  };
}

function fallbackAnalysis(message: string): QueryAnalysis {
  const keywords = Array.from(
    new Set(
      message
        .split(/[\s,.;!?]+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 2)
        .slice(0, 8)
    )
  );

  return {
    in_scope: true,
    scope_reason: "분류 모델 실패 시 기본 대전 여행 상담으로 처리",
    intent:
      message.includes("어디") || message.includes("추천")
        ? "recommend_place"
        : message.includes("가능") || message.includes("갈 수")
          ? "check_accessibility"
          : "ask_info",
    accessibility_needs:
      message.includes("짧은 동선") || message.includes("가까운") || message.includes("근처")
        ? ["short_distance"]
        : message.includes("쉬운 설명") || message.includes("쉽게") || message.includes("간단")
          ? ["easy_explanation"]
          : message.includes("휠체어") || message.includes("장애인")
            ? ["wheelchair"]
            : [],
    weather_sensitive:
      message.includes("오늘") || message.includes("날씨") || message.includes("비"),
    place_name: null,
    location: "대전",
    keywords,
    requested_categories: [],
    requested_theme: null
  };
}

function normalizeProfileAccessibilityNeeds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowedNeeds = new Set<string>(CHAT_ACCESSIBILITY_NEEDS);
  return Array.from(
    new Set(
      value.filter((item): item is string => typeof item === "string" && allowedNeeds.has(item))
    )
  );
}

function rankKnowledgeRows(
  rows: KnowledgeRow[],
  analysis: QueryAnalysis,
  searchTerms: string[],
  allowedContentIds: string[] | null
) {
  const categoryRows = filterRowsByExplicitCategories(rows, analysis.requested_categories);
  const relevantRows = allowedContentIds
    ? filterRowsByAllowedContentIds(categoryRows, allowedContentIds)
    : categoryRows;
  const placeName = normalizeForSearch(analysis.place_name || "");
  const placeMatchedRows = placeName
    ? relevantRows.filter((row) => rowMatchesPlaceName(row, placeName))
    : [];

  if (placeName && analysis.intent === "check_accessibility" && !placeMatchedRows.length) {
    return [];
  }

  const candidates = placeMatchedRows.length ? placeMatchedRows : relevantRows;
  const desiredCategories = getDesiredCategories(searchTerms);
  const usefulTerms = searchTerms.filter(isUsefulRankingTerm);

  return candidates
    .map((row) => ({
      row,
      score: scoreKnowledgeRow({
        row,
        analysis,
        desiredCategories,
        placeName,
        searchTerms: usefulTerms
      })
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (getRowText(left.row, "title") || "").localeCompare(
        getRowText(right.row, "title") || "",
        "ko-KR"
      );
    })
    .map(({ row }) => row);
}

function scoreKnowledgeRow({
  row,
  analysis,
  desiredCategories,
  placeName,
  searchTerms
}: {
  row: KnowledgeRow;
  analysis: QueryAnalysis;
  desiredCategories: string[];
  placeName: string;
  searchTerms: string[];
}) {
  const title = normalizeForSearch(getRowText(row, "title") || "");
  const category = getRowText(row, "category") || "";
  const normalizedCategory = normalizeForSearch(category);
  const tags = getRowTags(row).map(normalizeForSearch);
  const accessibility = getRowAccessibility(row);
  const accessibilityText = normalizeForSearch(Object.values(accessibility).join(" "));
  const rowText = buildRowSearchText(row);
  let score = 0;

  if (placeName) {
    if (title.includes(placeName)) score += 90;
    else if (rowText.includes(placeName)) score += 35;
  }

  if (desiredCategories.length) {
    score += desiredCategories.includes(category) ? 35 : -18;
  } else if (analysis.intent === "recommend_place") {
    if (["관광지", "문화시설"].includes(category)) score += 8;
  }

  for (const term of searchTerms) {
    const normalizedTerm = normalizeForSearch(term);
    if (!normalizedTerm) continue;

    if (title.includes(normalizedTerm)) score += 14;
    if (normalizedCategory.includes(normalizedTerm)) score += 10;
    if (tags.some((tag) => tag.includes(normalizedTerm))) score += 10;
    if (accessibilityText.includes(normalizedTerm)) score += 9;
    if (rowText.includes(normalizedTerm)) score += 3;
  }

  for (const need of analysis.accessibility_needs) {
    score += scoreAccessibilityNeed({
      need,
      rowText,
      tags,
      accessibility
    });
  }

  if (analysis.weather_sensitive) {
    if (["문화시설", "쇼핑", "숙박", "음식점"].includes(category)) score += 14;
    if (["관광지", "레포츠"].includes(category)) score -= 6;
    if (rowText.includes("실내") || rowText.includes("우천")) score += 12;
  }

  if (category === "공중화장실") {
    score += asksForToilet(searchTerms) ? 45 : -35;
    if (analysis.intent === "recommend_place" && !asksForToilet(searchTerms)) score -= 25;
  }

  if (category === "장애인주차장") {
    score += asksForParking(searchTerms) ? 45 : -35;
    if (analysis.intent === "recommend_place" && !asksForParking(searchTerms)) score -= 25;
  }

  return score;
}

function asksForToilet(searchTerms: string[]) {
  const normalized = searchTerms.map(normalizeForSearch).join(" ");
  return (
    normalized.includes("화장실") ||
    normalized.includes("변기") ||
    normalized.includes("공중화장실")
  );
}

function asksForParking(searchTerms: string[]) {
  const normalized = searchTerms.map(normalizeForSearch).join(" ");
  return normalized.includes("주차");
}

function scoreAccessibilityNeed({
  need,
  rowText,
  tags,
  accessibility
}: {
  need: string;
  rowText: string;
  tags: string[];
  accessibility: Record<string, string>;
}) {
  const rule = ACCESSIBILITY_RULES[need];
  if (!rule) return 0;

  let score = 0;
  if (rule.tags.some((tag) => tags.includes(tag))) score += 22;

  for (const field of rule.fields) {
    if (accessibility[field]) score += 11;
  }

  for (const term of rule.terms) {
    if (rowText.includes(normalizeForSearch(term))) score += 5;
  }

  return score;
}

function getDesiredCategories(searchTerms: string[]) {
  const normalizedTerms = searchTerms.map(normalizeForSearch).filter(Boolean);
  return Object.entries(CATEGORY_ALIASES)
    .filter(([, aliases]) =>
      aliases.some((alias) => {
        const normalizedAlias = normalizeForSearch(alias);
        return normalizedTerms.some(
          (term) => term.includes(normalizedAlias) || normalizedAlias.includes(term)
        );
      })
    )
    .map(([category]) => category);
}

function isUsefulRankingTerm(term: string) {
  const normalized = normalizeForSearch(term);
  return normalized.length >= 2 && !GENERIC_SEARCH_TERMS.has(normalized);
}

function rowMatchesPlaceName(row: KnowledgeRow, normalizedPlaceName: string) {
  const title = normalizeForSearch(getRowText(row, "title") || "");
  return (
    title.includes(normalizedPlaceName) || buildRowSearchText(row).includes(normalizedPlaceName)
  );
}

function buildRowSearchText(row: KnowledgeRow) {
  const metadata = row.metadata || {};
  const metadataValues = [
    getRowText(row, "title"),
    getRowText(row, "category"),
    getRowText(row, "source"),
    row.content,
    ...getRowTags(row),
    ...Object.values(getRowAccessibility(row)),
    textMetadataValue(metadata.address),
    textMetadataValue(metadata.tel)
  ];

  return normalizeForSearch(metadataValues.filter(Boolean).join(" "));
}

function getRowAccessibility(row: KnowledgeRow) {
  const value = row.metadata?.accessibility;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, textMetadataValue(item)])
      .filter(([, item]) => item)
  );
}

function textMetadataValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeForSearch(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    signal: createTimeoutSignal(EXTERNAL_FETCH_TIMEOUT_MS, init.signal ?? undefined)
  });
}

async function createQueryEmbedding({
  apiKey,
  dimensions,
  input,
  model
}: {
  apiKey: string;
  dimensions: number;
  input: string;
  model: string;
}) {
  const response = await fetchWithTimeout(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input,
      dimensions
    })
  });

  if (!response.ok) {
    throw new Error("OpenAI embedding request failed.");
  }

  const data = (await response.json()) as OpenAIEmbeddingResponse;
  const embedding = data.data
    ?.slice()
    .sort((left, right) => (left.index || 0) - (right.index || 0))[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== dimensions) {
    throw new Error("OpenAI embedding response was invalid.");
  }

  return embedding;
}

function buildEmbeddingInput(analysis: QueryAnalysis, searchTerms: string[]) {
  return [
    `질문 의도: ${analysis.intent}`,
    `지역: ${analysis.location || "대전"}`,
    analysis.place_name ? `장소명: ${analysis.place_name}` : null,
    analysis.accessibility_needs.length
      ? `접근성 조건: ${analysis.accessibility_needs.join(", ")}`
      : null,
    analysis.weather_sensitive ? "날씨/실내 조건 고려" : null,
    analysis.requested_categories.length
      ? `요청 범주: ${analysis.requested_categories.join(", ")}`
      : null,
    analysis.requested_theme === "bakery" ? "요청 테마: 빵지순례" : null,
    analysis.keywords.length ? `핵심어: ${analysis.keywords.join(", ")}` : null,
    searchTerms.length ? `검색어: ${searchTerms.join(", ")}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function getVectorFailureMessage(status: number, text: string) {
  const lowerText = text.toLocaleLowerCase("ko-KR");

  if (
    lowerText.includes("match_chunks") ||
    lowerText.includes("function") ||
    lowerText.includes("schema cache")
  ) {
    return "pgvector RPC match_chunks 준비 필요";
  }

  if (lowerText.includes("embedding") || lowerText.includes("vector")) {
    return "chunks.embedding 컬럼 또는 vector 설정 확인 필요";
  }

  if (status === 401 || status === 403) {
    return "Supabase service role 권한 확인 필요";
  }

  return "pgvector 검색 호출 실패";
}

function getRequestedFacilityCategory(searchTerms: string[]) {
  if (asksForToilet(searchTerms)) return "공중화장실";
  if (asksForParking(searchTerms)) return "장애인주차장";
  return null;
}

function hasCategory(rows: KnowledgeRow[], category: string) {
  return rows.some((row) => getRowText(row, "category") === category);
}

async function enrichRowsWithMatchingTitles(
  config: ReturnType<typeof getSupabaseConfig>,
  rows: KnowledgeRow[]
) {
  const params = new URLSearchParams({
    select: "*",
    limit: String(KNOWLEDGE_CANDIDATE_LIMIT),
    order: "created_at.asc"
  });

  try {
    const response = await fetchWithTimeout(
      `${config.url}/${encodeURIComponent(config.table)}?${params.toString()}`,
      {
        headers: getSupabaseHeaders(config, { Accept: "application/json" }),
        cache: "no-store"
      }
    );

    if (!response.ok) return rows;

    const candidateRows = (await response.json()) as KnowledgeRow[];
    return mergeRowsWithMatchingTitles(rows, candidateRows);
  } catch {
    return rows;
  }
}

function mergeRowsWithMatchingTitles(primaryRows: KnowledgeRow[], candidateRows: KnowledgeRow[]) {
  const primaryTitleSet = new Set(
    primaryRows.map((row) => normalizeForSearch(getRowText(row, "title") || "")).filter(Boolean)
  );
  const matchingRows = candidateRows.filter((row) =>
    primaryTitleSet.has(normalizeForSearch(getRowText(row, "title") || ""))
  );
  const usedKeys = new Set<string>();
  const mergedRows: KnowledgeRow[] = [];

  for (const row of primaryRows) {
    addUniqueKnowledgeRow(mergedRows, usedKeys, row);

    const normalizedTitle = normalizeForSearch(getRowText(row, "title") || "");
    for (const matchingRow of matchingRows) {
      if (normalizeForSearch(getRowText(matchingRow, "title") || "") !== normalizedTitle) continue;
      addUniqueKnowledgeRow(mergedRows, usedKeys, matchingRow);
    }
  }

  return mergedRows;
}

function addUniqueKnowledgeRow(rows: KnowledgeRow[], usedKeys: Set<string>, row: KnowledgeRow) {
  const key =
    row.id ||
    getRowText(row, "source") ||
    `${getRowText(row, "title") || ""}:${(row.content || "").slice(0, 80)}`;

  if (!key || usedKeys.has(key)) return;
  usedKeys.add(key);
  rows.push(row);
}

function createEmbeddingDebug({
  dimensions,
  input,
  model,
  status,
  vector
}: {
  dimensions?: number;
  input?: string;
  model?: string;
  status: EmbeddingDebug["status"];
  vector?: number[];
}): EmbeddingDebug {
  return {
    dimensions,
    input,
    model,
    status,
    vectorPreview: vector
      ? vector.slice(0, 12).map((value) => Number(value.toFixed(6)))
      : undefined,
    vectorPreviewNote: vector ? `전체 ${vector.length}차원 중 앞 12개만 표시` : undefined
  };
}

function createRagDebug({
  embedding,
  rows,
  searchMode,
  statusMessage,
  vectorCandidateCount
}: {
  embedding?: EmbeddingDebug;
  rows: KnowledgeRow[];
  searchMode: KnowledgeResult["searchMode"];
  statusMessage: string;
  vectorCandidateCount?: number;
}): RagDebug {
  return {
    dbMatches: rows.map((row, index) => ({
      category: getRowText(row, "category"),
      chunkIndex: row.chunk_index ?? null,
      contentPreview: row.content ? row.content.slice(0, 180) : null,
      rank: index + 1,
      similarity: typeof row.similarity === "number" ? Number(row.similarity.toFixed(6)) : null,
      source: getRowText(row, "source"),
      title: getRowText(row, "title")
    })),
    embedding,
    searchMode,
    statusMessage,
    vectorCandidateCount
  };
}

async function checkVectorReadiness(
  config: ReturnType<typeof getSupabaseConfig>,
  dimensions: number
): Promise<VectorReadiness> {
  const cacheKey = `${config.url}|${config.schema}|${config.table}|${dimensions}`;
  const now = Date.now();

  if (
    vectorReadinessCache &&
    vectorReadinessCache.key === cacheKey &&
    now - vectorReadinessCache.checkedAt < VECTOR_READINESS_TTL_MS
  ) {
    return vectorReadinessCache.result;
  }

  const result = await fetchVectorReadiness(config, dimensions);
  vectorReadinessCache = {
    checkedAt: now,
    key: cacheKey,
    result
  };

  return result;
}

async function fetchVectorReadiness(
  config: ReturnType<typeof getSupabaseConfig>,
  dimensions: number
): Promise<VectorReadiness> {
  const params = new URLSearchParams({
    select: "id",
    limit: "1",
    embedding: "not.is.null"
  });

  try {
    const embeddedRowsResponse = await fetchWithTimeout(
      `${config.url}/${encodeURIComponent(config.table)}?${params.toString()}`,
      {
        headers: getSupabaseHeaders(config, { Accept: "application/json" }),
        next: { revalidate: 60 }
      }
    );

    if (!embeddedRowsResponse.ok) {
      const text = await embeddedRowsResponse.text();
      return {
        ready: false,
        message: getVectorFailureMessage(embeddedRowsResponse.status, text)
      };
    }

    const embeddedRows = (await embeddedRowsResponse.json()) as unknown[];
    if (!embeddedRows.length) {
      return {
        ready: false,
        message: "chunks.embedding 데이터 없음"
      };
    }

    const rpcResponse = await fetchWithTimeout(`${config.url}/rpc/match_chunks`, {
      method: "POST",
      headers: getSupabaseHeaders(config),
      body: JSON.stringify({
        query_embedding: Array.from({ length: dimensions }, () => 0),
        match_count: 1
      })
    });

    if (!rpcResponse.ok) {
      const text = await rpcResponse.text();
      return {
        ready: false,
        message: getVectorFailureMessage(rpcResponse.status, text)
      };
    }

    return {
      ready: true,
      message: "pgvector 준비됨"
    };
  } catch {
    return {
      ready: false,
      message: "pgvector 준비 상태 확인 실패"
    };
  }
}

async function fetchKnowledge(
  analysis: QueryAnalysis,
  seenPlaceTitles: string[] = []
): Promise<KnowledgeResult> {
  const config = getSupabaseConfig();

  if (!config.url || !config.key || !config.schema || !config.table) {
    return {
      status: "not_configured",
      rows: [],
      message: "환경변수 미설정",
      searchMode: "none",
      debug: createRagDebug({
        rows: [],
        searchMode: "none",
        statusMessage: "환경변수 미설정"
      })
    };
  }

  const searchTerms = buildSearchTerms(analysis);
  let allowedContentIds: string[] | null = null;

  if (analysis.requested_theme === "bakery") {
    try {
      const bakeryRows = await getBakeryChatKnowledgeRows();
      allowedContentIds = bakeryRows.map((row) => row.metadata.contentid);
      const unseenRows = bakeryRows.filter(
        (row) =>
          !seenPlaceTitles.some(
            (seenTitle) => normalizeForSearch(seenTitle) === normalizeForSearch(row.title)
          )
      );
      const unseenTitles = new Set(unseenRows.map((row) => normalizeForSearch(row.title)));
      const candidates = unseenRows.length
        ? [
            ...unseenRows,
            ...bakeryRows.filter((row) => !unseenTitles.has(normalizeForSearch(row.title)))
          ]
        : bakeryRows;
      const rankedRows = rankKnowledgeRows(
        candidates,
        analysis,
        searchTerms,
        allowedContentIds
      ).slice(0, 5);

      if (rankedRows.length) {
        return {
          status: "ready",
          rows: rankedRows,
          message: `${rankedRows.length}개 빵집 장소 데이터 조회`,
          searchMode: "keyword",
          debug: createRagDebug({
            rows: rankedRows,
            searchMode: "keyword",
            statusMessage: "다대유 빵집 장소 데이터 사용"
          })
        };
      }
    } catch {
      return {
        status: "unavailable",
        rows: [],
        message: "빵집 테마 조회 실패",
        searchMode: "none",
        debug: createRagDebug({
          rows: [],
          searchMode: "none",
          statusMessage: "빵집 테마 조회 실패"
        })
      };
    }

    if (!allowedContentIds.length) {
      return {
        status: "empty",
        rows: [],
        message: "빵집 테마 조건 일치 없음",
        searchMode: "none",
        debug: createRagDebug({
          rows: [],
          searchMode: "none",
          statusMessage: "빵집 테마 조건 일치 없음"
        })
      };
    }
  }

  const vectorKnowledge = await fetchVectorKnowledge(
    config,
    analysis,
    searchTerms,
    seenPlaceTitles,
    allowedContentIds
  );
  if (vectorKnowledge.status === "ready") {
    const facilityCategory = getRequestedFacilityCategory(searchTerms);
    if (facilityCategory && !hasCategory(vectorKnowledge.rows, facilityCategory)) {
      const facilityKnowledge = await fetchKeywordKnowledge(
        config,
        analysis,
        searchTerms,
        seenPlaceTitles,
        allowedContentIds
      );
      if (
        facilityKnowledge.status === "ready" &&
        hasCategory(facilityKnowledge.rows, facilityCategory)
      ) {
        const fallbackDebug =
          facilityKnowledge.debug ||
          createRagDebug({
            rows: facilityKnowledge.rows,
            searchMode: "keyword",
            statusMessage: facilityKnowledge.message
          });

        return {
          ...facilityKnowledge,
          debug: {
            ...fallbackDebug,
            embedding: vectorKnowledge.debug?.embedding,
            statusMessage: `${facilityKnowledge.message} / facility fallback: vector 후보에 ${facilityCategory} 없음`
          },
          fallbackReason: `vector 후보에 ${facilityCategory} 없음`
        };
      }
    }

    return vectorKnowledge;
  }

  const keywordKnowledge = await fetchKeywordKnowledge(
    config,
    analysis,
    searchTerms,
    seenPlaceTitles,
    allowedContentIds
  );
  if (keywordKnowledge.status === "ready" && vectorKnowledge.status !== "not_configured") {
    const fallbackDebug =
      keywordKnowledge.debug ||
      createRagDebug({
        rows: keywordKnowledge.rows,
        searchMode: "keyword",
        statusMessage: keywordKnowledge.message
      });

    return {
      ...keywordKnowledge,
      debug: {
        ...fallbackDebug,
        embedding: vectorKnowledge.debug?.embedding,
        statusMessage: `${keywordKnowledge.message} / fallback: ${vectorKnowledge.message}`
      },
      fallbackReason: vectorKnowledge.message
    };
  }

  return keywordKnowledge;
}

async function fetchVectorKnowledge(
  config: ReturnType<typeof getSupabaseConfig>,
  analysis: QueryAnalysis,
  searchTerms: string[],
  seenPlaceTitles: string[],
  allowedContentIds: string[] | null
): Promise<KnowledgeResult> {
  const embedding = getEmbeddingConfig();

  if (!embedding.apiKey) {
    return {
      status: "not_configured",
      rows: [],
      message: "OpenAI embedding 키 미설정",
      searchMode: "none",
      debug: createRagDebug({
        embedding: createEmbeddingDebug({
          status: "not_configured"
        }),
        rows: [],
        searchMode: "none",
        statusMessage: "OpenAI embedding 키 미설정"
      })
    };
  }

  try {
    const embeddingInput = buildEmbeddingInput(analysis, searchTerms);
    const readiness = await checkVectorReadiness(config, embedding.dimensions);
    if (!readiness.ready) {
      return {
        status: readiness.message.includes("데이터 없음") ? "empty" : "unavailable",
        rows: [],
        message: readiness.message,
        searchMode: "none",
        debug: createRagDebug({
          embedding: createEmbeddingDebug({
            dimensions: embedding.dimensions,
            input: embeddingInput,
            model: embedding.model,
            status: "skipped"
          }),
          rows: [],
          searchMode: "none",
          statusMessage: readiness.message
        }),
        embeddingModel: embedding.model
      };
    }

    const queryEmbedding = await createQueryEmbedding({
      apiKey: embedding.apiKey,
      dimensions: embedding.dimensions,
      input: embeddingInput,
      model: embedding.model
    });
    const embeddingDebug = createEmbeddingDebug({
      dimensions: embedding.dimensions,
      input: embeddingInput,
      model: embedding.model,
      status: "created",
      vector: queryEmbedding
    });

    const response = await fetchWithTimeout(`${config.url}/rpc/match_chunks`, {
      method: "POST",
      headers: getSupabaseHeaders(config),
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_count: VECTOR_CANDIDATE_LIMIT
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        status: "unavailable",
        rows: [],
        message: getVectorFailureMessage(response.status, text),
        searchMode: "none",
        debug: createRagDebug({
          embedding: embeddingDebug,
          rows: [],
          searchMode: "none",
          statusMessage: getVectorFailureMessage(response.status, text)
        }),
        embeddingModel: embedding.model
      };
    }

    const rows = (await response.json()) as KnowledgeRow[];

    if (!rows.length) {
      return {
        status: "empty",
        rows: [],
        message: "pgvector 검색 결과 없음",
        searchMode: "vector",
        debug: createRagDebug({
          embedding: embeddingDebug,
          rows: [],
          searchMode: "vector",
          statusMessage: "pgvector 검색 결과 없음",
          vectorCandidateCount: 0
        }),
        embeddingModel: embedding.model
      };
    }

    const rankedRows = selectDiverseItems({
      items: rankKnowledgeRows(rows, analysis, searchTerms, allowedContentIds),
      getTitle: (row) => getRowText(row, "title") || "",
      limit: KNOWLEDGE_RESULT_LIMIT,
      seenTitles: seenPlaceTitles
    });

    if (!rankedRows.length) {
      return {
        status: "empty",
        rows: [],
        message: `pgvector ${rows.length}개 후보 중 조건 일치 없음`,
        searchMode: "vector",
        debug: createRagDebug({
          embedding: embeddingDebug,
          rows,
          searchMode: "vector",
          statusMessage: `pgvector ${rows.length}개 후보 중 조건 일치 없음`,
          vectorCandidateCount: rows.length
        }),
        embeddingModel: embedding.model
      };
    }

    const enrichedRows = await enrichRowsWithMatchingTitles(config, rankedRows);
    const enrichmentCount = enrichedRows.length - rankedRows.length;

    return {
      status: "ready",
      rows: enrichedRows,
      message:
        enrichmentCount > 0
          ? `pgvector ${rows.length}개 후보 중 ${rankedRows.length}건 사용, 관광지 상세 ${enrichmentCount}건 보강`
          : `pgvector ${rows.length}개 후보 중 ${rankedRows.length}건 사용`,
      searchMode: "vector",
      debug: createRagDebug({
        embedding: embeddingDebug,
        rows: enrichedRows,
        searchMode: "vector",
        statusMessage:
          enrichmentCount > 0
            ? `pgvector ${rows.length}개 후보 중 ${rankedRows.length}건 사용, 관광지 상세 ${enrichmentCount}건 보강`
            : `pgvector ${rows.length}개 후보 중 ${rankedRows.length}건 사용`,
        vectorCandidateCount: rows.length
      }),
      embeddingModel: embedding.model
    };
  } catch {
    return {
      status: "unavailable",
      rows: [],
      message: "embedding 또는 pgvector 검색 실패",
      searchMode: "none",
      debug: createRagDebug({
        embedding: createEmbeddingDebug({
          dimensions: embedding.dimensions,
          input: buildEmbeddingInput(analysis, searchTerms),
          model: embedding.model,
          status: "failed"
        }),
        rows: [],
        searchMode: "none",
        statusMessage: "embedding 또는 pgvector 검색 실패"
      }),
      embeddingModel: embedding.model
    };
  }
}

async function fetchKeywordKnowledge(
  config: ReturnType<typeof getSupabaseConfig>,
  analysis: QueryAnalysis,
  searchTerms: string[],
  seenPlaceTitles: string[],
  allowedContentIds: string[] | null
): Promise<KnowledgeResult> {
  const params = new URLSearchParams({
    select: "*",
    limit: String(KNOWLEDGE_CANDIDATE_LIMIT),
    order: "created_at.asc"
  });

  try {
    const response = await fetchWithTimeout(
      `${config.url}/${encodeURIComponent(config.table)}?${params.toString()}`,
      {
        headers: getSupabaseHeaders(config, { Accept: "application/json" }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return {
        status: "unavailable",
        rows: [],
        message:
          response.status === 406
            ? `${config.schema} schema 미노출`
            : `${config.table} 테이블 확인 필요`,
        searchMode: "keyword",
        debug: createRagDebug({
          rows: [],
          searchMode: "keyword",
          statusMessage:
            response.status === 406
              ? `${config.schema} schema 미노출`
              : `${config.table} 테이블 확인 필요`
        })
      };
    }

    const rows = (await response.json()) as KnowledgeRow[];

    if (!rows.length) {
      return {
        status: "empty",
        rows: [],
        message: `${config.schema}.${config.table} 데이터 없음`,
        searchMode: "keyword",
        debug: createRagDebug({
          rows: [],
          searchMode: "keyword",
          statusMessage: `${config.schema}.${config.table} 데이터 없음`
        })
      };
    }

    const rankedRows = selectDiverseItems({
      items: rankKnowledgeRows(rows, analysis, searchTerms, allowedContentIds),
      getTitle: (row) => getRowText(row, "title") || "",
      limit: KNOWLEDGE_RESULT_LIMIT,
      seenTitles: seenPlaceTitles
    });

    if (!rankedRows.length) {
      return {
        status: "empty",
        rows: [],
        message: `${config.schema}.${config.table} ${rows.length}개 후보 중 조건 일치 없음`,
        searchMode: "keyword",
        debug: createRagDebug({
          rows,
          searchMode: "keyword",
          statusMessage: `${config.schema}.${config.table} ${rows.length}개 후보 중 조건 일치 없음`
        })
      };
    }

    const enrichedRows = mergeRowsWithMatchingTitles(rankedRows, rows);
    const enrichmentCount = enrichedRows.length - rankedRows.length;

    return {
      status: "ready",
      rows: enrichedRows,
      message:
        enrichmentCount > 0
          ? `${config.schema}.${config.table} ${rows.length}개 후보 중 ${rankedRows.length}건 사용, 관광지 상세 ${enrichmentCount}건 보강`
          : `${config.schema}.${config.table} ${rows.length}개 후보 중 ${rankedRows.length}건 사용`,
      searchMode: "keyword",
      debug: createRagDebug({
        rows: enrichedRows,
        searchMode: "keyword",
        statusMessage:
          enrichmentCount > 0
            ? `${config.schema}.${config.table} ${rows.length}개 후보 중 ${rankedRows.length}건 사용, 관광지 상세 ${enrichmentCount}건 보강`
            : `${config.schema}.${config.table} ${rows.length}개 후보 중 ${rankedRows.length}건 사용`
      })
    };
  } catch {
    return {
      status: "unavailable",
      rows: [],
      message: "연결 실패",
      searchMode: "keyword",
      debug: createRagDebug({
        rows: [],
        searchMode: "keyword",
        statusMessage: "연결 실패"
      })
    };
  }
}

function buildSearchTerms(analysis: QueryAnalysis) {
  return Array.from(
    new Set(
      [
        analysis.place_name,
        analysis.location,
        ...analysis.requested_categories,
        ...(analysis.requested_theme === "bakery"
          ? ["빵집", "베이커리", "제과점", "빵지순례"]
          : []),
        ...analysis.keywords,
        ...analysis.accessibility_needs.flatMap((need) =>
          need === "wheelchair"
            ? ["휠체어", "장애인", "경사로", "엘리베이터"]
            : need === "stroller"
              ? ["유모차", "수유실", "엘리베이터"]
              : need === "short_distance"
                ? ["짧은 동선", "가까운", "근처", "이동거리", "휴식"]
                : need === "easy_explanation"
                  ? ["쉬운 설명", "간단한 안내", "핵심 정보", "안내"]
                  : need === "accessible_toilet"
                    ? ["장애인 화장실", "화장실"]
                    : need === "accessible_parking"
                      ? ["장애인 주차", "전용 주차", "주차장"]
                      : need === "public_transport"
                        ? ["대중교통", "저상버스", "정류장"]
                        : need === "step_free"
                          ? ["계단 없음", "단차 없음", "접근로", "경사로", "엘리베이터"]
                          : need === "elderly" || need === "mobility_access"
                            ? ["이동약자", "계단", "경사로", "휴식"]
                            : [need]
        ),
        analysis.weather_sensitive ? "실내" : null,
        analysis.weather_sensitive ? "우천" : null
      ]
        .filter((term): term is string => Boolean(term))
        .map((term) => term.trim())
        .filter(Boolean)
    )
  ).slice(0, 10);
}

function formatWeatherContext(weather?: TourWeatherResult) {
  if (!weather || weather.status === "not_requested") return null;

  if (weather.status !== "ready" || !weather.items.length) {
    return [
      "기상청 관광기후지수 데이터:",
      `상태: ${weather.message}`,
      "주의: 현재 날씨를 확인했다고 말하지 않는다."
    ].join("\n");
  }

  return [
    "기상청 관광기후지수 데이터:",
    ...weather.items.map((item, index) => `${index + 1}. ${formatWeatherItem(item)}`),
    "주의: 관광기후지수는 추천 보조 근거로만 사용하고, 방문 전 실제 기상 상황 확인을 권장한다."
  ].join("\n");
}

function formatKnowledgeContext(knowledge: KnowledgeResult, weather?: TourWeatherResult) {
  const weatherContext = formatWeatherContext(weather);

  if (!knowledge.rows.length) {
    return [weatherContext, "현재 확인할 수 있는 공개 안내 자료가 충분하지 않다."]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    weatherContext,
    "확인된 공개 안내 자료:",
    ...knowledge.rows.map((row, index) =>
      [
        `${index + 1}. ${formatChatDisplayText(getRowText(row, "title") || "장소")}`,
        `이곳에서 할 수 있는 것: ${formatChatDisplayText(getRowActivityHint(row))}`,
        buildPlaceTourDetails([row]).length
          ? `방문 정보: ${buildPlaceTourDetails([row]).join(" / ")}`
          : null,
        row.content ? `안내 내용: ${formatChatDisplayText(row.content)}` : null
      ]
        .filter(Boolean)
        .join("\n")
    )
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getRowText(row: KnowledgeRow, key: "title" | "category" | "source") {
  const direct = row[key];
  const metadataValue = row.metadata?.[key];
  return typeof direct === "string"
    ? direct
    : typeof metadataValue === "string"
      ? metadataValue
      : null;
}

function getRowActivityHint(row: KnowledgeRow) {
  const title = getRowText(row, "title") || "";
  const category = getRowText(row, "category") || "";
  const sourceText = getRowText(row, "source") || "";
  const content = row.content || "";
  const sourceType = textMetadataValue(row.metadata?.source_type);
  const searchableText = normalizeForSearch([title, category, sourceText, content].join(" "));

  if (category === "공중화장실" || sourceType === "public_toilet") {
    return "여행 중 가까운 역사 화장실과 장애인용 변기 수를 확인해 동선 중간 휴식 지점으로 잡을 수 있는 곳";
  }

  if (category === "장애인주차장" || sourceType === "accessible_parking") {
    return "차량 이동 시 목적지 주변 주차 가능성을 먼저 확인하고 하차 동선을 줄이는 데 참고할 수 있는 위치 정보";
  }

  if (includesAny(searchableText, ["트래블라운지", "관광안내", "안내소", "여행안내"])) {
    return "여행 정보를 확인하고, 동선이나 코스를 정리하며, 현장 안내를 받을 수 있는 곳";
  }

  if (includesAny(searchableText, ["아쿠아리움", "수족관"])) {
    return "실내에서 해양 생물 전시를 관람하고, 날씨 영향이 적은 동선으로 쉬어갈 수 있는 곳";
  }

  if (includesAny(searchableText, ["천연기념물센터", "천연기념물", "자연유산"])) {
    return "천연기념물과 자연유산 표본, 생태 전시를 실내에서 천천히 관람하며 대전의 자연 콘텐츠를 살펴볼 수 있는 곳";
  }

  if (includesAny(searchableText, ["한밭도서관", "도서관"])) {
    return "자료실에서 책과 전시 자료를 살펴보고, 조용한 실내 공간에서 쉬어가며 여행 동선을 정리할 수 있는 곳";
  }

  if (includesAny(searchableText, ["과학공원", "과학관", "엑스포", "천문", "화폐박물관"])) {
    return "과학, 전시, 체험형 콘텐츠를 둘러보며 실내외 관람 동선을 계획해볼 수 있는 곳";
  }

  if (includesAny(searchableText, ["수목원", "공원", "정원", "호수", "숲", "둘레길", "산책"])) {
    return "천천히 산책하고 쉬면서 자연 경관을 둘러볼 수 있는 곳";
  }

  if (includesAny(searchableText, ["박물관", "미술관", "전시", "문화시설", "기념관"])) {
    return "실내에서 전시와 문화 자료를 천천히 둘러볼 수 있는 곳";
  }

  if (includesAny(searchableText, ["시장", "쇼핑", "상점", "백화점", "몰"])) {
    return "상점 구경, 쇼핑, 먹거리 탐색을 함께 할 수 있는 곳";
  }

  if (includesAny(searchableText, ["음식점", "식당", "카페", "맛집", "빵", "성심당"])) {
    return "식사나 간식을 즐기고 잠시 쉬어갈 수 있는 곳";
  }

  if (includesAny(searchableText, ["축제", "공연", "행사"])) {
    return "행사 분위기와 공연, 현장 프로그램을 확인해볼 수 있는 곳";
  }

  if (includesAny(searchableText, ["체험", "레포츠", "액티비티", "놀이", "어린이"])) {
    return "가벼운 체험이나 가족 단위 활동을 살펴볼 수 있는 곳";
  }

  if (category) {
    return `${category} 성격의 장소라 방문 목적에 맞는 관람이나 휴식을 계획해볼 수 있는 곳`;
  }

  return "방문 목적과 동선을 함께 확인해볼 수 있는 장소";
}

function getRowTags(row: KnowledgeRow) {
  const metadataTags = row.metadata?.tags;
  if (Array.isArray(row.tags)) return row.tags;
  if (Array.isArray(metadataTags)) {
    return metadataTags.filter((tag): tag is string => typeof tag === "string");
  }
  return [];
}

export async function POST(request: Request) {
  try {
    if (
      !isAllowedChatOrigin({
        configuredOrigins: process.env.CHAT_ALLOWED_ORIGINS,
        origin: request.headers.get("origin"),
        requestOrigin: new URL(request.url).origin
      })
    ) {
      return jsonChatError("허용되지 않은 요청 출처예요.", 403);
    }

    if (!isChatBodySizeAllowed(getRequestBodySizeBytes(request.headers))) {
      return jsonChatError("질문 내용이 너무 길어요. 조금 짧게 줄여서 다시 보내 주세요.", 413);
    }

    const bodyResult = await readBoundedRequestBody(request, CHAT_MAX_BODY_BYTES);
    if (!bodyResult.ok) {
      return jsonChatError("질문 내용이 너무 길어요. 조금 짧게 줄여서 다시 보내 주세요.", 413);
    }
    const rawBody = bodyResult.text;

    let body: {
      message?: unknown;
      accessibilityNeeds?: unknown;
      history?: unknown;
    };

    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return jsonChatError("요청 형식을 읽지 못했어요. 다시 시도해 주세요.", 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = normalizeChatHistory(body.history);
    const conversationContext = createConversationContext(history, message);
    const profileAccessibilityNeeds = normalizeProfileAccessibilityNeeds(body.accessibilityNeeds);

    if (!message) {
      return jsonChatError("질문을 입력해 주세요.", 400);
    }

    if (!isChatMessageLengthAllowed(message)) {
      return jsonChatError(`질문은 ${CHAT_MAX_MESSAGE_LENGTH}자 이내로 입력해 주세요.`, 400);
    }

    const clientKey = await resolveChatClientKey(request);
    const rateLimit = chatRateLimiter.enforce(`chat:${clientKey}`);
    if (!rateLimit.allowed) {
      return jsonChatError(
        "요청이 잠시 많아요. 조금 뒤 다시 질문해 주세요.",
        429,
        Math.max(1, rateLimit.retryAfterSeconds)
      );
    }

    const staticSiteFaqResponse = createStaticSiteFaqResponse(message);
    if (staticSiteFaqResponse) {
      return jsonChatResponse(staticSiteFaqResponse);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    const model = getDeepSeekModel();

    if (!apiKey) {
      return jsonChatResponse(
        createUnavailableResponse(
          "현재 챗봇 답변 생성 기능을 사용할 수 없어요. 잠시 뒤 다시 이용해 주세요."
        ),
        { status: 503 }
      );
    }

    await reserveChatUsage(clientKey);

    const classifiedAnalysis = await classifyQuestion({
      apiKey,
      history,
      message,
      model
    });
    if (!classifiedAnalysis) {
      return jsonChatResponse(
        createUnavailableResponse(
          "질문 분류를 안전하게 완료하지 못했어요. 정확하지 않은 추천을 만들지 않도록 여기서 멈출게요. 잠시 뒤 다시 질문해 주세요."
        ),
        { status: 503 }
      );
    }

    const contextualAnalysis = applyConversationContext(
      classifiedAnalysis,
      message,
      conversationContext
    );
    const requestedCategories = resolveSessionChatCategories(message, history);
    const requestedTheme = resolveSessionChatTheme(message, history);
    const hasRecommendationCue = /(추천|갈\s*만|코스|일정|1박|당일|어디|둘러|위주)/u.test(message);
    const analysis: QueryAnalysis = {
      ...contextualAnalysis,
      in_scope:
        contextualAnalysis.in_scope || requestedCategories.length > 0 || requestedTheme !== null,
      intent:
        !contextualAnalysis.place_name &&
        (requestedTheme !== null || (requestedCategories.length > 0 && hasRecommendationCue))
          ? "recommend_place"
          : contextualAnalysis.intent,
      accessibility_needs: Array.from(
        new Set([...contextualAnalysis.accessibility_needs, ...profileAccessibilityNeeds])
      ),
      keywords: Array.from(
        new Set([
          ...contextualAnalysis.keywords,
          ...requestedCategories,
          ...(requestedTheme === "bakery" ? ["빵집", "베이커리", "빵지순례"] : [])
        ])
      ).slice(0, 12),
      requested_categories: requestedCategories,
      requested_theme: requestedTheme
    };

    if (!analysis.in_scope) {
      return jsonChatResponse(createOutOfScopeResponse(analysis));
    }

    const searchTerms = buildSearchTerms(analysis);
    const seenPlaceTitles =
      analysis.intent === "recommend_place" &&
      !analysis.place_name &&
      (!conversationContext.isFollowUp || conversationContext.wantsDifferentPlaces)
        ? conversationContext.seenPlaceTitles
        : [];
    const [knowledge, weather] = await Promise.all([
      fetchKnowledge(analysis, seenPlaceTitles),
      fetchTourWeather({
        location: analysis.location,
        weatherSensitive: analysis.weather_sensitive
      })
    ]);

    if (knowledge.status !== "ready") {
      return jsonChatResponse(
        createNoKnowledgeResponse({
          analysis,
          inputMessage: message,
          knowledge,
          searchTerms,
          weather
        })
      );
    }

    const deepSeekResponse = await fetchWithTimeout(DEEPSEEK_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: formatKnowledgeContext(knowledge, weather) },
          ...(profileAccessibilityNeeds.length
            ? [
                {
                  role: "system",
                  content: `사용자가 저장한 접근성 조건: ${profileAccessibilityNeeds.join(", ")}. 질문과 관련 있을 때만 근거 자료 안에서 반영한다.`
                }
              ]
            : []),
          ...(conversationContext.isFollowUp
            ? [
                {
                  role: "system",
                  content: `현재 질문은 최근 대화의 후속 질문이다. 직전 추천 후보는 ${conversationContext.previousPlaceTitles.join(", ")}이며, 이 후보 안에서 사용자의 질문을 이어서 답한다.`
                }
              ]
            : []),
          ...createChatCompletionHistory(history),
          { role: "user", content: message }
        ],
        thinking: { type: "disabled" },
        max_tokens: 850,
        temperature: 0.3,
        stream: false
      })
    });

    if (!deepSeekResponse.ok) {
      return jsonChatResponse(
        createUnavailableResponse(
          "현재 답변 생성 서비스와 연결이 원활하지 않아요. 잠시 뒤 다시 질문해 주세요."
        ),
        { status: 502 }
      );
    }

    const data = (await deepSeekResponse.json()) as DeepSeekChatResponse;
    const answer = normalizeDaiyuTone(data.choices?.[0]?.message?.content?.trim() || "");

    if (!answer) {
      return jsonChatResponse(
        createErrorResponse("답변을 완성하지 못했어요. 잠시 뒤 다시 질문해 주세요.")
      );
    }

    return jsonChatResponse(
      createSuccessResponse({
        message: answer,
        inputMessage: message,
        knowledge,
        analysis,
        conversationContext,
        searchTerms,
        weather
      })
    );
  } catch (error) {
    if (error instanceof ChatIdentityError || error instanceof ChatUsageError) {
      return jsonChatResponse(createUnavailableResponse(getPublicChatGuardMessage(error)), {
        status: error.status
      });
    }

    const message =
      error instanceof Error && error.name === "AbortError"
        ? "답변을 준비하는 데 시간이 오래 걸렸어요. 질문을 조금 짧게 해서 다시 시도해 주세요."
        : "응답을 만드는 중 문제가 생겼어요. 잠시 뒤 다시 질문해 주세요.";

    return jsonChatResponse(createErrorResponse(message));
  }
}
