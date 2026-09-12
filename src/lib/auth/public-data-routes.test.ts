import assert from "node:assert/strict";
import test from "node:test";
import { isPublicDataRequest } from "./public-data-routes.ts";

test("only the reviewed cookie-free public GET endpoints bypass session refresh", () => {
  for (const pathname of [
    "/api/home/courses",
    "/api/home/image",
    "/api/tourism/top-rated-places",
    "/api/codes/filter-options",
    "/api/weather"
  ]) {
    assert.equal(isPublicDataRequest("GET", pathname), true);
    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      assert.equal(isPublicDataRequest(method, pathname), false);
    }
  }
});

test("private routes and lookalike paths retain the existing authentication checks", () => {
  for (const pathname of [
    "/api/home",
    "/api/courses/shared",
    "/api/home/courses/private",
    "/api/home/courses-admin",
    "/api/chat",
    "/api/tts",
    "/api/admin/places",
    "/admin",
    "/mypage",
    "/onboarding",
    "/login",
    "/"
  ]) {
    assert.equal(isPublicDataRequest("GET", pathname), false, pathname);
  }
});
