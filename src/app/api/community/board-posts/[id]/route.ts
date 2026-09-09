import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminMember } from "@/lib/community/ownership";

export const dynamic = "force-dynamic";

const DETAIL_COLUMNS =
  "post_id, board_id, title, content, writer_id, writer_nm, rating, course_rating, view_cnt, like_cnt, comment_cnt, notice_yn, created_at, content_id, course_id, tb_board(board_nm, comment_yn, reply_yn), tb_members!writer_id(community_level), tb_post_image(image_url, sort_order), tb_post_file(file_url, file_name, file_size, sort_order)";

type BoardRef =
  | { board_nm: string; comment_yn: boolean; reply_yn: boolean }
  | { board_nm: string; comment_yn: boolean; reply_yn: boolean }[]
  | null;
type MemberLevelRef = { community_level?: number } | { community_level?: number }[] | null;

function boardInfoOf(ref: BoardRef): { board_nm: string; comment_yn: boolean; reply_yn: boolean } {
  const b = Array.isArray(ref) ? ref[0] : ref;
  return {
    board_nm: b?.board_nm ?? "알 수 없음",
    comment_yn: b?.comment_yn ?? false,
    reply_yn: b?.reply_yn ?? false
  };
}

function communityLevelOf(ref: MemberLevelRef): number {
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.community_level ?? 1;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("tb_post")
      .select(DETAIL_COLUMNS)
      .eq("post_id", postId)
      .eq("use_yn", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { tb_board, tb_members, tb_post_image, tb_post_file, writer_id, ...rest } =
      data as typeof data & {
        tb_board: BoardRef;
        tb_members: MemberLevelRef;
        tb_post_image: { image_url: string; sort_order: number }[];
        tb_post_file: {
          file_url: string;
          file_name: string;
          file_size: number | null;
          sort_order: number;
        }[];
      };

    const images = [...(tb_post_image ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.image_url);
    const files = [...(tb_post_file ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ url: f.file_url, name: f.file_name, size: f.file_size }));

    // 조회수 증가는 POST .../view 에서만 (GET 중복·수정 로드·Strict Mode 이중 호출 방지)

    let attachedPlace: { content_id: string; name: string; image: string } | null = null;
    if (rest.content_id != null) {
      const { data: place } = await supabase
        .from("tb_place")
        .select("contentid, title, firstimage")
        .eq("contentid", rest.content_id)
        .maybeSingle();
      if (place) {
        attachedPlace = {
          content_id: String(place.contentid),
          name: place.title,
          image: place.firstimage ?? ""
        };
      }
    }

    // tb_course는 RLS로 보호돼 있어(작성자 본인만 select) 다른 사용자가 첨부된 코스 이름을
    // 보려면 admin 클라이언트가 필요하다 (공유코스 목록과 동일한 이유).
    let attachedCourse: { course_id: number; course_nm: string } | null = null;
    if (rest.course_id != null) {
      const admin = createAdminClient();
      const { data: course } = await admin
        .from("tb_course")
        .select("course_id, course_nm")
        .eq("course_id", rest.course_id)
        .maybeSingle();
      if (course) {
        attachedCourse = { course_id: course.course_id, course_nm: course.course_nm };
      }
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();
    let canEdit = false;
    let canDelete = false;
    let liked = false;
    let isAdmin = false;
    if (user) {
      const owner = user.id === writer_id;
      isAdmin = await isAdminMember(supabase, user.id);
      // 수정은 작성자 본인만. 삭제는 작성자 본인 또는 관리자(다른 사람 글도 삭제는 가능).
      canEdit = owner;
      canDelete = owner || isAdmin;
      const { data: likeRow } = await supabase
        .from("tb_post_likes")
        .select("user_id")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle();
      liked = !!likeRow;
    }

    const boardInfo = boardInfoOf(tb_board);

    let reply: {
      reply_id: number;
      content: string;
      writer_nm: string;
      created_at: string;
      updated_at: string;
    } | null = null;
    if (boardInfo.reply_yn) {
      const { data: replyRow } = await supabase
        .from("tb_post_reply")
        .select("reply_id, content, writer_nm, created_at, updated_at")
        .eq("post_id", postId)
        .eq("use_yn", true)
        .maybeSingle();
      reply = replyRow ?? null;
    }

    return NextResponse.json({
      post: {
        id: rest.post_id,
        ...rest,
        board_nm: boardInfo.board_nm,
        comment_yn: boardInfo.comment_yn,
        reply_yn: boardInfo.reply_yn,
        writer_community_level: communityLevelOf(tb_members),
        attached_place: attachedPlace,
        attached_course: attachedCourse,
        images,
        files,
        can_edit: canEdit,
        can_delete: canDelete,
        liked,
        reply,
        can_manage_reply: boardInfo.reply_yn && isAdmin
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch post" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // QA 테스트 전용: 첨부 재삽입 실패(백업→삭제→재삽입 실패→복구) 시나리오를 재현하기 위한
  // 훅. 운영 환경에서는 절대 동작하지 않는다. 사용법:
  // fetch(`/api/community/board-posts/${id}?debugFailAttachment=images`, { method: "PATCH", ... })
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

    const { data: existing, error: fetchError } = await supabase
      .from("tb_post")
      .select("post_id, board_id, writer_id")
      .eq("post_id", postId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing)
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });

    if (existing.writer_id !== user.id) {
      return NextResponse.json({ error: "본인 글만 수정할 수 있습니다." }, { status: 403 });
    }

    let body: {
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

    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const trimmed = body.title.trim();
      if (!trimmed) return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
      updates.title = trimmed;
    }
    if (body.content !== undefined) {
      const trimmed = body.content.trim();
      if (!trimmed) return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
      updates.content = trimmed;
    }
    if (body.content_id !== undefined) {
      updates.content_id =
        typeof body.content_id === "string" && body.content_id.trim()
          ? body.content_id.trim()
          : null;
    }
    if (body.course_id !== undefined) {
      updates.course_id =
        body.course_id != null && Number.isFinite(Number(body.course_id))
          ? Number(body.course_id)
          : null;
    }
    if (body.rating !== undefined) {
      if (body.rating == null) {
        updates.rating = null;
      } else {
        const { data: board } = await supabase
          .from("tb_board")
          .select("rating_yn")
          .eq("board_id", existing.board_id)
          .maybeSingle();
        const parsed = Number(body.rating);
        if (!board?.rating_yn || !Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
          return NextResponse.json({ error: "별점은 1~5 사이로 입력해 주세요." }, { status: 400 });
        }
        updates.rating = parsed;
      }
    }
    if (body.course_rating !== undefined) {
      if (body.course_rating == null) {
        updates.course_rating = null;
      } else {
        const { data: board } = await supabase
          .from("tb_board")
          .select("rating_yn")
          .eq("board_id", existing.board_id)
          .maybeSingle();
        const parsed = Number(body.course_rating);
        if (!board?.rating_yn || !Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
          return NextResponse.json(
            { error: "코스 별점은 1~5 사이로 입력해 주세요." },
            { status: 400 }
          );
        }
        updates.course_rating = parsed;
      }
    }

    let images: string[] | undefined;
    let files: { url: string; name: string; size?: number }[] | undefined;
    if (body.images !== undefined || body.files !== undefined) {
      const { data: board } = await supabase
        .from("tb_board")
        .select("allow_image, allow_file, max_upload_count")
        .eq("board_id", existing.board_id)
        .maybeSingle();
      images = board?.allow_image ? (body.images ?? []).filter(Boolean) : [];
      files = board?.allow_file ? (body.files ?? []).filter((f) => f?.url) : [];
      if (images.length + files.length > (board?.max_upload_count ?? 0)) {
        return NextResponse.json(
          { error: `첨부는 최대 ${board?.max_upload_count ?? 0}개까지 가능합니다.` },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updates).length === 0 && images === undefined && files === undefined) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("tb_post")
        .update(updates)
        .eq("post_id", postId);
      if (updateError) throw updateError;
    }

    // 첨부는 삭제 후 재삽입 방식이라, 재삽입이 실패하면 방금 지운 원래 첨부까지 사라진다.
    // 지우기 전에 백업해뒀다가 재삽입 실패 시 최대한 복구를 시도한 뒤 에러를 던진다(이 프로젝트
    // 전반에 트랜잭션이 없어 완벽한 원자성 보장은 못 하지만, 최소한 "성공"으로 잘못 알리거나
    // 복구 시도 없이 원본을 잃는 일은 막는다).
    if (images !== undefined) {
      const { data: previousImages, error: previousImagesError } = await supabase
        .from("tb_post_image")
        .select("image_url, sort_order")
        .eq("post_id", postId);
      if (previousImagesError) throw previousImagesError;

      const { error: deleteImagesError } = await supabase
        .from("tb_post_image")
        .delete()
        .eq("post_id", postId);
      if (deleteImagesError) throw deleteImagesError;

      if (images.length > 0) {
        const { error: insertImagesError } =
          debugFailAttachment === "images"
            ? { error: new Error("[QA 테스트] 이미지 재삽입 강제 실패") }
            : await supabase
                .from("tb_post_image")
                .insert(
                  images.map((image_url, i) => ({ post_id: postId, image_url, sort_order: i }))
                );
        if (insertImagesError) {
          if (previousImages && previousImages.length > 0) {
            await supabase.from("tb_post_image").insert(
              previousImages.map((p) => ({
                post_id: postId,
                image_url: p.image_url,
                sort_order: p.sort_order
              }))
            );
          }
          throw insertImagesError;
        }
      }
    }
    if (files !== undefined) {
      const { data: previousFiles, error: previousFilesError } = await supabase
        .from("tb_post_file")
        .select("file_url, file_name, file_size, sort_order")
        .eq("post_id", postId);
      if (previousFilesError) throw previousFilesError;

      const { error: deleteFilesError } = await supabase
        .from("tb_post_file")
        .delete()
        .eq("post_id", postId);
      if (deleteFilesError) throw deleteFilesError;

      if (files.length > 0) {
        const { error: insertFilesError } =
          debugFailAttachment === "files"
            ? { error: new Error("[QA 테스트] 파일 재삽입 강제 실패") }
            : await supabase.from("tb_post_file").insert(
                files.map((f, i) => ({
                  post_id: postId,
                  file_url: f.url,
                  file_name: f.name,
                  file_size: f.size ?? null,
                  sort_order: i
                }))
              );
        if (insertFilesError) {
          if (previousFiles && previousFiles.length > 0) {
            await supabase.from("tb_post_file").insert(
              previousFiles.map((p) => ({
                post_id: postId,
                file_url: p.file_url,
                file_name: p.file_name,
                file_size: p.file_size,
                sort_order: p.sort_order
              }))
            );
          }
          throw insertFilesError;
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update post" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("tb_post")
      .select("post_id, writer_id")
      .eq("post_id", postId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing)
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });

    const owner = existing.writer_id === user.id;
    if (!owner && !(await isAdminMember(supabase, user.id))) {
      return NextResponse.json({ error: "본인 글만 삭제할 수 있습니다." }, { status: 403 });
    }

    const { error: deleteError } = await supabase.from("tb_post").delete().eq("post_id", postId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete post" },
      { status: 500 }
    );
  }
}
