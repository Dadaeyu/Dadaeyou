import { supabase } from "@/lib/supabase";
import { ACCESSIBILITY_GROUPS } from "@/lib/place/accessibilityFields";
import { getLikeCountsByContentId } from "@/lib/search/placeAggregates";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contentId = (searchParams.get("contentId") ?? "").trim();
  if (!contentId) return Response.json({ error: "contentId required" }, { status: 400 });

  const [{ data: place }, { data: detail }, { data: acc }] = await Promise.all([
    supabase
      .from("tb_place")
      .select("title, firstimage, addr1, lclssystm1")
      .eq("contentid", contentId)
      .or("delete_yn.is.null,delete_yn.eq.N")
      .single(),
    supabase
      .from("tb_place_detail_normalized")
      .select("overview, infocenter, usetime, restdate, eventstartdate, eventenddate")
      .eq("contentid", contentId)
      .maybeSingle(),
    supabase.from("tb_place_barrierfree").select("*").eq("contentid", contentId).maybeSingle()
  ]);

  if (!place) return Response.json({ error: "not found" }, { status: 404 });

  const likeCounts = await getLikeCountsByContentId(supabase, [contentId]);

  // 카카오맵의 "장소명 아래 카테고리"처럼 보여주기 위한 대분류명 (tb_code.code_group='LCLSSYSTM1').
  const { data: category } = place.lclssystm1
    ? await supabase
        .from("tb_code")
        .select("code_nm")
        .eq("code_group", "LCLSSYSTM1")
        .eq("code_id", place.lclssystm1)
        .maybeSingle()
    : { data: null };

  const accessibility = acc
    ? ACCESSIBILITY_GROUPS.map((group) => ({
        category: group.category,
        items: group.fields
          .filter((f) => acc[f.key as keyof typeof acc])
          .map((f) => ({ label: f.label, text: acc[f.key as keyof typeof acc] as string }))
      })).filter((group) => group.items.length > 0)
    : [];

  return Response.json({
    title: place.title,
    category: category?.code_nm ?? null,
    categoryCode: place.lclssystm1 ?? null,
    image: place.firstimage ?? "",
    addr1: place.addr1 ?? "",
    overview: detail?.overview ?? null,
    use_time: detail?.usetime ?? null,
    rest_date: detail?.restdate ?? null,
    event_start_date: detail?.eventstartdate ?? null,
    event_end_date: detail?.eventenddate ?? null,
    phone: detail?.infocenter ?? null,
    like_count: likeCounts.get(String(contentId)) ?? 0,
    accessibility
  });
}
