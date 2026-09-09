import type { SearchPlace } from "./kakaoSearch";

export function mergeFocusedPlaceIntoSearchResults({
  focusedPlace,
  searchPlaces
}: {
  focusedPlace: SearchPlace | null;
  searchPlaces: SearchPlace[];
}) {
  if (!focusedPlace) return searchPlaces;
  return [focusedPlace, ...searchPlaces.filter((place) => place.id !== focusedPlace.id)];
}

export function getMapRenderPlaces({
  focusedPlace,
  hasActiveFilter,
  searchPlaces,
  topRatedPlaces
}: {
  focusedPlace: SearchPlace | null;
  hasActiveFilter: boolean;
  searchPlaces: SearchPlace[];
  topRatedPlaces: SearchPlace[];
}) {
  return mergeFocusedPlaceIntoSearchResults({
    focusedPlace,
    searchPlaces: hasActiveFilter ? searchPlaces : topRatedPlaces
  });
}

export function getFocusedPlaceAfterSearch({
  currentFocusedPlace,
  explicitUserSearch
}: {
  currentFocusedPlace: SearchPlace | null;
  explicitUserSearch: boolean;
}) {
  return explicitUserSearch ? null : currentFocusedPlace;
}
