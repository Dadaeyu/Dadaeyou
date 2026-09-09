import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase/require-admin";
import {
  getSyncConfig,
  runFullSync,
  isSyncTarget,
  runSyncTarget,
  TIME_BUDGET_MS
} from "@/lib/place/syncEngine";

export const dynamic = "force-dynamic";
// Vercel Hobby 플랜의 함수 실행 시간 상한(60초)에 맞춘다. 이보다 크게 잡으면 Hobby에서
// 배포가 거부되거나 더 낮은 값으로 캡된다. 전체 동기화는 한 번에 안 끝나는 게 정상이고,
// 스케줄러(/api/cron/place)가 남은 작업을 스스로 이어서 호출(체이닝)해 마저 처리한다.
export const maxDuration = 60;

// tb_place / tb_place_detail / tb_place_barrierfree / tb_place_bakery 수동 동기화 엔드포인트.
// 실제 동기화 로직은 src/lib/place/syncEngine.ts 에 있다(route.ts 는 HTTP 핸들러/설정 외의
// 값을 export 하면 안 되는 Next.js 규칙 때문에 엔진을 별도 모듈로 분리했다).
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = getSyncConfig();
  if (!config.ok) {
    return NextResponse.json({ error: config.error }, { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;
  const target = searchParams.get("target") ?? "all";
  // 관리자 화면이 완료(notDone=false)될 때까지 이 엔드포인트를 반복 호출하며 이어 넘겨주는
  // 커서 — cron 스케줄러의 체이닝과 같은 개념을, 자동 재호출 대신 클라이언트 반복으로 처리한다.
  const cursorParam = Math.max(0, Number(searchParams.get("cursor") ?? "0") | 0);

  const supabase = createClient(config.supabaseUrl, config.secretKey, {
    auth: { persistSession: false }
  });
  const deadline = Date.now() + TIME_BUDGET_MS;

  // 단일 테이블 동기화 — 기존 응답 형태(flat SyncResult)를 그대로 유지
  if (isSyncTarget(target)) {
    const outcome = await runSyncTarget(supabase, target, deadline, cursorParam);
    return outcome.ok
      ? NextResponse.json(outcome.result)
      : NextResponse.json(
          { error: outcome.error, partial: outcome.partial },
          { status: outcome.status }
        );
  }

  // 전체 동기화 — place 선행 후 detail/barrierfree 병렬 실행, 테이블별 결과를 묶어서 반환.
  // 60초 예산 안에 다 못 끝나면 각 결과의 notDone 이 true 로 남고, 관리자 화면이 nextCursors 를
  // 다음 호출의 cursor 로 실어 보내며 반복한다.
  if (target === "all") {
    const cursors = {
      detail: Math.max(0, Number(searchParams.get("detailCursor") ?? "0") | 0),
      barrierfree: Math.max(0, Number(searchParams.get("barrierfreeCursor") ?? "0") | 0),
      normalize: Math.max(0, Number(searchParams.get("normalizeCursor") ?? "0") | 0)
    };
    const results = await runFullSync(supabase, deadline, cursors);
    const nextCursorOf = (table: "detail" | "barrierfree" | "normalize"): number => {
      const r = results[table];
      const value =
        r && typeof r === "object" ? (r as Record<string, unknown>).nextCursor : undefined;
      return typeof value === "number" ? value : cursors[table];
    };
    return NextResponse.json({
      ...results,
      nextCursors: {
        detail: nextCursorOf("detail"),
        barrierfree: nextCursorOf("barrierfree"),
        normalize: nextCursorOf("normalize")
      }
    });
  }

  return NextResponse.json(
    {
      error: `알 수 없는 target: ${target} (place | detail | barrierfree | bakery | normalize | all)`
    },
    { status: 400 }
  );
}
