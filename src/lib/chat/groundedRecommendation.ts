export function shouldUseGroundedRecommendation(intent: string, placeCount: number) {
  return intent === "recommend_place" && placeCount > 0;
}
