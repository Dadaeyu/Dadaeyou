import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyIlikeSearch, parseListParams } from "@/lib/admin/list-query";
import { awardPoints, POINT_REASON } from "@/lib/community/points";

export const dynamic = "force-dynamic";

const LIST_COLUMNS =
  "post_id, board_id, title, writer_nm, view_cnt, like_cnt, comment_cnt, notice_yn, created_at, writer_id, tb_board(board_nm), tb_members!writer_id(community_level)";

type BoardRef = { board_nm: string } | { board_nm: string }[] | null;
type MemberLevelRef = { community_level?: number } | { community_level?: number }[] | null;

function boardNameOf(ref: BoardRef): string {
  if (Array.isArray(ref)) return ref[0]?.board_nm ?? "알 수 없음";
  return ref?.board_nm ?? "알 수 없음";
}

function communityLevelOf(ref: MemberLevelRef): number {
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.community_level ?? 1;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, q, from, to } = parseListParams(searchParams);
  const boardIdParam = searchParams.get("boardId");
  const contentIdParam = searchParams.get("contentId");

  try {
    const supabase = await createClient();

    let query = supabase
      .from("tb_post")
      .select(LIST_COLUMNS, { count: "exact" })
      .eq("use_yn", true)
      .order("notice_yn", { ascending: false })
      .order("created_at", { ascending: false })
      .order("post_id", { ascending: false });

    if (boardIdParam) {
      const boardId = Number(boardIdParam);
      if (Number.isFinite(boardId)) query = query.eq("board_id", boardId);
    }

    if (contentIdParam) {
      query = query.eq("content_id", contentIdParam);
    }

    query = applyIlikeSearch(query, "title", q);

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const items = (data ?? []).map((row) => {
      const {
        tb_board,
        tb_members,
        writer_id: _writerId,
        ...rest
      } = row as typeof row & {
        tb_board: BoardRef;
        tb_members: MemberLevelRef;
        writer_id?: string | null;
      };
      return {
        id: rest.post_id,
        ...rest,
        board_nm: boardNameOf(tb_board),
        writer_community_level: communityLevelOf(tb_members)
      };
    });

    return NextResponse.json({ items, total: count ?? 0, page, pageSize });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // QA 테스트 전용: 첨부 insert 실패 시나리오 재현용 훅. 운영 환경에서는 동작하지 않는다.
  // 사용법: fetch(`/api/community/board-posts?debugFailAttachment=images`, { method: "POST", ... })
  const debugFailAttachment =
    process.env.NODE_ENV !== "production"
      ? new URL(request.url).searchParams.get("debugFailAttachment")
      : null;

  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    let body: {
      board_id?: number;
      title?: string;
      content?: string;
      content_id?: string | null;
      course_id?: number | null;
      rating?: number | null;
      course_rating?: number | null;
      images?: string[];
      files?: { url: string; name: string; size?: number }[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const board_id = Number(body.board_id);
    const title = (body.title ?? "").trim();
    const content = (body.content ?? "").trim();
    const content_id =
      typeof body.content_id === "string" && body.content_id.trim() ? body.content_id.trim() : null;
    const course_id =
      body.course_id != null && Number.isFinite(Number(body.course_id))
        ? Number(body.course_id)
        : null;

    if (!Number.isFinite(board_id) || board_id <= 0) {
      return NextResponse.json({ error: "게시판을 선택해 주세요." }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
    if (!content) return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });

    const { data: board, error: boardError } = await supabase
      .from("tb_board")
      .select("board_id, use_yn, rating_yn, allow_image, allow_file, max_upload_count")
      .eq("board_id", board_id)
      .maybeSingle();

    if (boardError) throw boardError;
    if (!board || !board.use_yn) {
      return NextResponse.json(
        { error: "존재하지 않거나 사용할 수 없는 게시판입니다." },
        { status: 400 }
      );
    }

    let rating: number | null = null;
    if (board.rating_yn && body.rating != null) {
      const parsed = Number(body.rating);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        return NextResponse.json({ error: "별점은 1~5 사이로 입력해 주세요." }, { status: 400 });
      }
      rating = parsed;
    }

    let course_rating: number | null = null;
    if (board.rating_yn && body.course_rating != null) {
      const parsed = Number(body.course_rating);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        return NextResponse.json(
          { error: "코스 별점은 1~5 사이로 입력해 주세요." },
          { status: 400 }
        );
      }
      course_rating = parsed;
    }

    const images = board.allow_image ? (body.images ?? []).filter(Boolean) : [];
    const files = board.allow_file ? (body.files ?? []).filter((f) => f?.url) : [];
    if (images.length + files.length > board.max_upload_count) {
      return NextResponse.json(
        { error: `첨부는 최대 ${board.max_upload_count}개까지 가능합니다.` },
        { status: 400 }
      );
    }

    const { data: member, error: memberError } = await supabase
      .from("tb_members")
      .select("id, nickname")
      .eq("id", user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) {
      return NextResponse.json({ error: "회원 정보를 찾을 수 없습니다." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("tb_post")
      .insert({
        board_id,
        title,
        content,
        content_id,
        course_id,
        rating,
        course_rating,
        writer_id: user.id,
        writer_nm: member.nickname
      })
      .select("post_id")
      .single();

    if (error) throw error;

    if (images.length > 0) {
      const { error: imagesError } =
        debugFailAttachment === "images"
          ? { error: new Error("[QA 테스트] 이미지 저장 강제 실패") }
          : await supabase
              .from("tb_post_image")
              .insert(
                images.map((image_url, i) => ({ post_id: data.post_id, image_url, sort_order: i }))
              );
      if (imagesError) throw imagesError;
    }
    if (files.length > 0) {
      const { error: filesError } =
        debugFailAttachment === "files"
          ? { error: new Error("[QA 테스트] 파일 저장 강제 실패") }
          : await supabase.from("tb_post_file").insert(
              files.map((f, i) => ({
                post_id: data.post_id,
                file_url: f.url,
                file_name: f.name,
                file_size: f.size ?? null,
                sort_order: i
              }))
            );
      if (filesError) throw filesError;
    }

    try {
      await awardPoints({
        userId: user.id,
        reason: POINT_REASON.POST_CREATE,
        refType: "board_post",
        refId: data.post_id
      });
    } catch {
      // 글 등록은 유지
    }

    return NextResponse.json({ post: { id: data.post_id } }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create post" },
      { status: 500 }
    );
  }
}
