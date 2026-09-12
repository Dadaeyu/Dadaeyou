export interface HomeCourseRow {
  course_id: number;
  course_nm: string | null;
  open_yn: string | null;
  delete_yn: string | null;
}

export interface HomeCourseLikeRow {
  course_id: number | null;
}

export interface HomeCourseRatingRow {
  course_id: number | null;
  course_rating: number | null;
}

export interface HomeCourseDetailRow {
  course_id: number;
  day: number | null;
  place_id: number | null;
}

export interface HomeCoursePlaceRow {
  place_id: number;
  title: string | null;
  firstimage: string | null;
  use_yn: string | null;
  delete_yn: string | null;
}

export interface HomeCourseCandidate {
  course_id: number;
  course_nm: string;
  like_count: number;
  average_rating: number;
  review_count: number;
}

export interface HomeCourseSummary extends HomeCourseCandidate {
  places: Array<{ title: string | null; firstimage: string | null }>;
  place_count: number;
}

export interface HomeCourseSummaryQueries {
  loadCourses(): Promise<HomeCourseRow[]>;
  loadLikes(courseIds: readonly number[]): Promise<HomeCourseLikeRow[]>;
  loadRatings(courseIds: readonly number[]): Promise<HomeCourseRatingRow[]>;
  loadDetails(courseIds: readonly number[]): Promise<HomeCourseDetailRow[]>;
  loadPlaces(placeIds: readonly number[]): Promise<HomeCoursePlaceRow[]>;
}

const HOME_COURSE_CANDIDATE_LIMIT = 50;
const HOME_COURSE_BATCH_SIZE = 8;
const HOME_COURSE_RESULT_LIMIT = 2;

export function buildHomeCourseCandidates(
  courses: readonly HomeCourseRow[],
  likes: readonly HomeCourseLikeRow[],
  ratings: readonly HomeCourseRatingRow[],
  candidateLimit = HOME_COURSE_CANDIDATE_LIMIT
): HomeCourseCandidate[] {
  const likeCounts = countRowsByCourse(likes);
  const ratingStats = groupRatingsByCourse(ratings);

  return courses
    .filter(isPublicActiveCourse)
    .map((course) => {
      const courseId = Number(course.course_id);
      const rating = ratingStats.get(courseId);
      return {
        course_id: courseId,
        course_nm: course.course_nm?.trim() || `코스 #${courseId}`,
        like_count: likeCounts.get(courseId) ?? 0,
        average_rating: rating ? Math.round((rating.sum / rating.count) * 10) / 10 : 0,
        review_count: rating?.count ?? 0
      };
    })
    .sort((a, b) => b.average_rating - a.average_rating)
    .slice(0, Math.max(0, candidateLimit))
    .filter(
      (course) =>
        !/^(?:\[?테스트|test)/iu.test(course.course_nm) &&
        (course.review_count > 0 || course.like_count >= 2)
    )
    .sort(compareHomeCourseCandidates);
}

export function buildHomeCourseSummaries(
  candidates: readonly HomeCourseCandidate[],
  details: readonly HomeCourseDetailRow[],
  places: readonly HomeCoursePlaceRow[]
): HomeCourseSummary[] {
  const placeById = new Map(
    places
      .filter((place) => place.use_yn?.toUpperCase() === "Y" && isActiveFlag(place.delete_yn))
      .map((place) => [place.place_id, place] as const)
  );
  const detailsByCourse = new Map<number, HomeCourseDetailRow[]>();
  for (const detail of details) {
    if (detail.place_id == null || !placeById.has(detail.place_id)) continue;
    const courseDetails = detailsByCourse.get(detail.course_id) ?? [];
    courseDetails.push(detail);
    detailsByCourse.set(detail.course_id, courseDetails);
  }

  return candidates.flatMap((candidate) => {
    const coursePlaces = (detailsByCourse.get(candidate.course_id) ?? []).flatMap((detail) => {
      const place = detail.place_id == null ? undefined : placeById.get(detail.place_id);
      if (!place) return [];
      return [
        {
          title: place.title?.trim() || `장소 #${place.place_id}`,
          firstimage: place.firstimage?.trim() || null
        }
      ];
    });
    if (coursePlaces.length === 0 || !coursePlaces.some((place) => place.firstimage)) return [];

    return [
      {
        ...candidate,
        places: coursePlaces,
        place_count: coursePlaces.length
      }
    ];
  });
}

export async function loadHomeCourseSummaries(
  queries: HomeCourseSummaryQueries,
  {
    batchSize = HOME_COURSE_BATCH_SIZE,
    resultLimit = HOME_COURSE_RESULT_LIMIT
  }: { batchSize?: number; resultLimit?: number } = {}
): Promise<HomeCourseSummary[]> {
  const courses = await queries.loadCourses();
  if (courses.length === 0 || resultLimit <= 0) return [];

  const courseIds = courses.filter(isPublicActiveCourse).map((course) => Number(course.course_id));
  if (courseIds.length === 0) return [];

  const [likes, ratings] = await Promise.all([
    queries.loadLikes(courseIds),
    queries.loadRatings(courseIds)
  ]);
  const candidates = buildHomeCourseCandidates(courses, likes, ratings);
  const summaries: HomeCourseSummary[] = [];
  const safeBatchSize = Math.max(1, Math.min(HOME_COURSE_CANDIDATE_LIMIT, batchSize));

  for (let start = 0; start < candidates.length; start += safeBatchSize) {
    const batch = candidates.slice(start, start + safeBatchSize);
    const batchCourseIds = batch.map((course) => course.course_id);
    const details = await queries.loadDetails(batchCourseIds);
    const placeIds = [
      ...new Set(
        details
          .map((detail) => detail.place_id)
          .filter(
            (placeId): placeId is number => typeof placeId === "number" && Number.isFinite(placeId)
          )
      )
    ];
    const places = placeIds.length > 0 ? await queries.loadPlaces(placeIds) : [];
    summaries.push(...buildHomeCourseSummaries(batch, details, places));
    if (summaries.length >= resultLimit) break;
  }

  return summaries.slice(0, resultLimit);
}

function isPublicActiveCourse(course: HomeCourseRow) {
  return (
    Number.isFinite(Number(course.course_id)) &&
    course.open_yn?.toUpperCase() === "Y" &&
    isActiveFlag(course.delete_yn)
  );
}

function isActiveFlag(value: string | null | undefined) {
  return value == null || value === "" || value.toUpperCase() === "N";
}

function countRowsByCourse(rows: readonly HomeCourseLikeRow[]) {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const courseId = Number(row.course_id);
    if (!Number.isFinite(courseId)) continue;
    counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
  }
  return counts;
}

function groupRatingsByCourse(rows: readonly HomeCourseRatingRow[]) {
  const stats = new Map<number, { sum: number; count: number }>();
  for (const row of rows) {
    const courseId = Number(row.course_id);
    const rating = Number(row.course_rating);
    if (!Number.isFinite(courseId) || !Number.isFinite(rating)) continue;
    const current = stats.get(courseId) ?? { sum: 0, count: 0 };
    current.sum += rating;
    current.count += 1;
    stats.set(courseId, current);
  }
  return stats;
}

function compareHomeCourseCandidates(a: HomeCourseCandidate, b: HomeCourseCandidate) {
  return (
    courseSignalScore(b) - courseSignalScore(a) ||
    b.like_count - a.like_count ||
    b.review_count - a.review_count ||
    b.average_rating - a.average_rating ||
    a.course_nm.localeCompare(b.course_nm, "ko")
  );
}

function courseSignalScore(course: HomeCourseCandidate) {
  return course.like_count * 3 + course.review_count * 2 + course.average_rating;
}
