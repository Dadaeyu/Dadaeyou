import assert from "node:assert/strict";
import test from "node:test";
import type { SearchPlace } from "./kakaoSearch.ts";

type MapDeepLinkStateModule = {
  mergeFocusedPlaceIntoSearchResults: (args: {
    focusedPlace: SearchPlace | null;
    searchPlaces: SearchPlace[];
  }) => SearchPlace[];
  getMapRenderPlaces: (args: {
    focusedPlace: SearchPlace | null;
    hasActiveFilter: boolean;
    searchPlaces: SearchPlace[];
    topRatedPlaces: SearchPlace[];
  }) => SearchPlace[];
  getFocusedPlaceAfterSearch: (args: {
    currentFocusedPlace: SearchPlace | null;
    explicitUserSearch: boolean;
  }) => SearchPlace | null;
};

async function loadMapDeepLinkState() {
  try {
    return (await import("./mapDeepLinkState.ts")) as MapDeepLinkStateModule;
  } catch (error) {
    if (isMissingMapDeepLinkStateModule(error)) return null;
    throw error;
  }
}

function assertMapDeepLinkStateModule(
  module: MapDeepLinkStateModule | null
): asserts module is MapDeepLinkStateModule {
  assert.notEqual(
    module,
    null,
    "Expected src/lib/search/mapDeepLinkState.ts to export pure map deep-link state helpers."
  );
}

test("preserves an exact focused place when initial search returns normal results", async () => {
  const loadedModule = await loadMapDeepLinkState();
  assertMapDeepLinkStateModule(loadedModule);

  const focusedPlace = createPlace({
    id: "focused-101",
    lat: 36.3501,
    lng: 127.3845,
    name: "Deep Link Place"
  });
  const normalInitialResult = createPlace({
    id: "normal-202",
    lat: 36.3602,
    lng: 127.3921,
    name: "Normal Search Place"
  });

  assert.deepEqual(
    loadedModule.mergeFocusedPlaceIntoSearchResults({
      focusedPlace,
      searchPlaces: [normalInitialResult]
    }),
    [focusedPlace, normalInitialResult]
  );
});

test("includes the selected focused place in rendered markers when no filters are active", async () => {
  const loadedModule = await loadMapDeepLinkState();
  assertMapDeepLinkStateModule(loadedModule);

  const focusedPlace = createPlace({ id: "focused-101", name: "Deep Link Place" });
  const topRatedPlace = createPlace({ id: "hot-303", name: "Hot Place" });

  assert.deepEqual(
    loadedModule.getMapRenderPlaces({
      focusedPlace,
      hasActiveFilter: false,
      searchPlaces: [],
      topRatedPlaces: [topRatedPlace]
    }),
    [focusedPlace, topRatedPlace]
  );
});

test("does not duplicate a focused place that is already in search results", async () => {
  const loadedModule = await loadMapDeepLinkState();
  assertMapDeepLinkStateModule(loadedModule);

  const focusedPlace = createPlace({
    id: "focused-101",
    lat: 36.3501,
    lng: 127.3845,
    name: "Exact Deep Link Place"
  });
  const staleSearchCopy = createPlace({
    id: "focused-101",
    lat: 0,
    lng: 0,
    name: "Stale Search Copy"
  });
  const normalInitialResult = createPlace({
    id: "normal-202",
    name: "Normal Search Place"
  });

  assert.deepEqual(
    loadedModule.mergeFocusedPlaceIntoSearchResults({
      focusedPlace,
      searchPlaces: [staleSearchCopy, normalInitialResult]
    }),
    [focusedPlace, normalInitialResult]
  );
});

test("clears the focused place for an explicit new user search", async () => {
  const loadedModule = await loadMapDeepLinkState();
  assertMapDeepLinkStateModule(loadedModule);

  const focusedPlace = createPlace({ id: "focused-101", name: "Deep Link Place" });

  assert.equal(
    loadedModule.getFocusedPlaceAfterSearch({
      currentFocusedPlace: focusedPlace,
      explicitUserSearch: true
    }),
    null
  );
});

function createPlace(overrides: Partial<SearchPlace>): SearchPlace {
  return {
    address: "Daejeon",
    category: "Tourism",
    categoryCode: "AT",
    id: "place-1",
    image: "",
    lat: 36.35,
    lng: 127.38,
    name: "Place",
    source: "db",
    ...overrides
  };
}

function isMissingMapDeepLinkStateModule(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND" &&
    error.message.includes("mapDeepLinkState")
  );
}
