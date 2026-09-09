import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSyncConfig, runFullSync, TIME_BUDGET_MS } from "@/lib/place/syncEngine";

export const dynamic = "force-dynamic";
// Vercel Hobby 플랜의 함수 실행 시간 상한(60초)에 맞춘다.
export const maxDuration = 60;

// 하루 안에 처리해야 할 작업이 한 번 호출(약 40초)로는 다 안 끝난다(800건 넘는 장소×API 여러
// 번). 예전에는 이 라우트가 자기 자신을 fetch로 다시 호출해 이어갔는데, 다음 회차가 완료될
// 때까지(약 32초) 기다릴 여유가 없어 응답을 8초만 기다리고 끊어버리는 구조였다. "연결이 끊겨도
// 다음 invocation이 독립적으로 계속 실행될 것"이라는 가정에 기대는 방식이라, 실제 배포
// 환경에서는 몇 회차 진행되다 불규칙하게 끊기는 문제가 있었다(로컬 반복 호출 테스트로는
// 24회차 전부 문제없이 끝났지만, 실서비스에서는 3~4회차 만에 멈추는 게 관측됨).
//
// 이제 진행 상황(place_id 커서)을 URL로 넘기는 대신 DB(tb_place_sync_state)에 저장하고, 이
// 라우트는 "호출될 때마다 DB에 저장된 지점부터 한 회차만 처리하고 끝"으로 단순화했다. 매일
// 09:30(KST) Vercel Cron 트리거 하나로는 하루 안에 다 못 끝내므로, 외부 스케줄러(예:
// cron-job.org)가 이 엔드포인트를 짧은 간격(예: 1~2분)으로 반복 호출해 이어가야 한다. 각 호출이
// 완전히 독립적인 요청이라 "직전 호출이 다음 호출을 살려두는지" 같은 불확실성이 없다.
//
// place_sync_claim()이 DB 트랜잭션으로 락을 잡아, 짧은 간격으로 겹쳐 들어온 호출이 있어도
// 한 번에 하나만 실제로 처리한다(락이 오래(기본 90초) 남아있으면 이전 실행이 죽은 것으로 보고
// 새로 잡는다). 매일 자정이 지나 처음 호출되면 place_sync_claim() 이 커서와 완료 플래그를
// 전부 초기화해 "매일 처음부터" 다시 돈다.
//
// place/bakery 는 detail/barrierfree 와 달리 커서 없이 매번 전체를 다시 조회하는 구조라(원래
// 한 회차 안에 항상 끝남), 한 번 성공하면 place_done/bakery_done 을 세워 그 뒤 회차부터는
// 건너뛴다 — 안 그러면 detail/barrierfree 가 아직 진행 중인 나머지 하루 동안 1분마다 계속
// place/bakery 전체를 재조회하게 된다. 그날 detail/barrierfree/normalize 까지 전부 끝나면
// (done=true) place_sync_claim() 이 락도 안 건드리고 DB 조회 한 번만 하고 바로 반환한다.
//
// 인증: Vercel Cron 은 CRON_SECRET 환경변수가 설정돼 있으면 요청에
//   Authorization: Bearer <CRON_SECRET>
// 헤더를 자동으로 실어 보낸다. 외부 스케줄러도 같은 헤더를 실어 보내도록 설정해야 한다.
// CRON_SECRET 이 설정된 경우 이 헤더를 검증해, 외부에서 임의로 호출해 동기화를 트리거하지
// 못하게 막는다.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const config = getSyncConfig();
  if (!config.ok) {
    return NextResponse.json({ error: config.error }, { status: 500 });
  }

  const supabase = createClient(config.supabaseUrl, config.secretKey, {
    auth: { persistSession: false }
  });

  const { data: claimRows, error: claimError } = await supabase.rpc("place_sync_claim");
  if (claimError) {
    return NextResponse.json({ error: `락 확인 실패: ${claimError.message}` }, { status: 502 });
  }
  const claim = claimRows?.[0] as
    | {
        claimed: boolean;
        done: boolean;
        place_done: boolean;
        bakery_done: boolean;
        detail_cursor: number;
        barrierfree_cursor: number;
        normalize_cursor: number;
      }
    | undefined;
  if (!claim || !claim.claimed) {
    const skipped = claim?.done ? "done_for_today" : "already_running";
    console.log(`[cron/place] 이번 호출은 건너뜀 (${skipped})`);
    return NextResponse.json({ ok: true, skipped });
  }

  const cursors = {
    detail: claim.detail_cursor,
    barrierfree: claim.barrierfree_cursor,
    normalize: claim.normalize_cursor
  };

  const startedAt = new Date().toISOString();
  const deadline = Date.now() + TIME_BUDGET_MS;
  console.log(
    `[cron/place] 동기화 시작 ${startedAt} (cursors=${JSON.stringify(cursors)}, ` +
      `placeDone=${claim.place_done}, bakeryDone=${claim.bakery_done})`
  );

  let results: Awaited<ReturnType<typeof runFullSync>>;
  try {
    results = await runFullSync(supabase, deadline, cursors, {
      skipPlace: claim.place_done,
      skipBakery: claim.bakery_done
    });
  } catch (e) {
    // 처리 중 예상 못한 예외가 나도 락은 반드시 풀어야 다음 호출이 이어받을 수 있다.
    // 진행한 게 없으니 커서와 완료 플래그 모두 원래 자리 그대로 되돌린다.
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron/place] 동기화 중 예외 발생: ${message}`);
    await supabase.rpc("place_sync_release", {
      p_detail_cursor: cursors.detail,
      p_barrierfree_cursor: cursors.barrierfree,
      p_normalize_cursor: cursors.normalize,
      p_done: false,
      p_place_done: claim.place_done,
      p_bakery_done: claim.bakery_done
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
  const finishedAt = new Date().toISOString();

  // 자동 실행은 응답 본문이 버려지므로, 테이블별 집계/에러를 로그로 남긴다.
  // (Vercel: 프로젝트 > Logs / Observability, 로컬: next dev 터미널에서 확인)
  let pendingWork = false;
  const entries = Object.entries(results) as [string, Record<string, unknown>][];
  for (const [table, r] of entries) {
    if (typeof r.error === "string") {
      // 테이블 전체 실패 (예: DB 조회/insert 실패) — 원인 메시지와 부분 진행 상황.
      // 실패한 테이블은 다음 호출에서 같은 커서부터 다시 시도되도록 pendingWork 로 취급한다.
      console.error(`[cron/place] ${table} 실패: ${r.error}`, r.partial ?? "");
      pendingWork = true;
      continue;
    }
    // 테이블마다 집계 필드가 다르므로(tour 계열: totalPlaces/upserted/skipped,
    // bakery: totalCount/inserted/updated/unchanged) errors 배열만 제외하고 통째로 남긴다.
    const summary = { ...r };
    delete summary.errors;
    console.log(`[cron/place] ${table}:`, summary);
    // 개별 항목 실패(콘텐츠별 API 오류 등)가 있으면 원인 목록을 함께 남긴다.
    if (typeof r.errorCount === "number" && r.errorCount > 0) {
      console.error(`[cron/place] ${table} 개별 실패 ${r.errorCount}건:`, r.errors);
    }
    if (r.notDone === true) pendingWork = true;
  }
  console.log(`[cron/place] 동기화 종료 ${finishedAt} (남은 작업: ${pendingWork})`);

  // 다음 호출이 이어받을 커서 — 이번 회차 결과에 nextCursor 가 있으면 그 값, 없으면(예: place/bakery
  // 처럼 커서 개념이 없는 테이블, 또는 이번 회차에서 아예 안 돈 경우) 이번에 넘겨받은 값을 그대로 유지.
  const nextCursorOf = (table: "detail" | "barrierfree" | "normalize"): number => {
    const r = results[table];
    const value =
      r && typeof r === "object" ? (r as Record<string, unknown>).nextCursor : undefined;
    return typeof value === "number" ? value : cursors[table];
  };
  const nextCursors = {
    detail: nextCursorOf("detail"),
    barrierfree: nextCursorOf("barrierfree"),
    normalize: nextCursorOf("normalize")
  };

  // place/bakery 는 커서가 없어 "이번 회차에 성공적으로 끝났는지"만으로 완료 여부를 판단한다.
  // 이미 이전 회차에 끝나서 이번엔 건너뛴 경우(claim.place_done)도 계속 완료 상태를 유지한다.
  const isTableDone = (table: "place" | "bakery"): boolean => {
    const r = results[table] as Record<string, unknown>;
    return typeof r.error !== "string" && r.notDone !== true;
  };
  const nextPlaceDone = claim.place_done || isTableDone("place");
  const nextBakeryDone = claim.bakery_done || isTableDone("bakery");

  const { error: releaseError } = await supabase.rpc("place_sync_release", {
    p_detail_cursor: nextCursors.detail,
    p_barrierfree_cursor: nextCursors.barrierfree,
    p_normalize_cursor: nextCursors.normalize,
    p_done: !pendingWork,
    p_place_done: nextPlaceDone,
    p_bakery_done: nextBakeryDone
  });
  if (releaseError) {
    console.error(`[cron/place] 락 해제 실패: ${releaseError.message}`);
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    finishedAt,
    cursors,
    nextCursors,
    pendingWork,
    results
  });
}
