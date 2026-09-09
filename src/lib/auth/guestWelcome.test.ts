import assert from "node:assert/strict";
import test from "node:test";
import {
  getGuestWelcomeTodayKey,
  isGuestWelcomeEligiblePath,
  isGuestWelcomeSnoozedToday,
  shouldShowGuestWelcome
} from "./guestWelcome.ts";

test("guest welcome is shown only when a guest enters the home page", () => {
  assert.equal(isGuestWelcomeEligiblePath("/"), true);
  assert.equal(isGuestWelcomeEligiblePath("/map"), false);
  assert.equal(isGuestWelcomeEligiblePath("/course/12"), false);
  assert.equal(isGuestWelcomeEligiblePath("/login"), false);
  assert.equal(isGuestWelcomeEligiblePath("/signup/check-email"), false);
  assert.equal(isGuestWelcomeEligiblePath("/auth/confirm"), false);
  assert.equal(isGuestWelcomeEligiblePath("/privacy"), false);
  assert.equal(isGuestWelcomeEligiblePath("/account-deletion"), false);
});

test("guest welcome waits for auth and notices and stays dismissed during the current home entry", () => {
  const readyGuest = {
    authLoading: false,
    hasUser: false,
    eligiblePath: true,
    blockedByNotice: false,
    dismissedForEntry: false,
    snoozeResolved: true,
    snoozedToday: false
  };

  assert.equal(shouldShowGuestWelcome(readyGuest), true);
  assert.equal(shouldShowGuestWelcome({ ...readyGuest, authLoading: true }), false);
  assert.equal(shouldShowGuestWelcome({ ...readyGuest, hasUser: true }), false);
  assert.equal(shouldShowGuestWelcome({ ...readyGuest, blockedByNotice: true }), false);
  assert.equal(shouldShowGuestWelcome({ ...readyGuest, dismissedForEntry: true }), false);
  assert.equal(shouldShowGuestWelcome({ ...readyGuest, snoozeResolved: false }), false);
  assert.equal(shouldShowGuestWelcome({ ...readyGuest, snoozedToday: true }), false);
  assert.equal(shouldShowGuestWelcome({ ...readyGuest, eligiblePath: false }), false);
});

test("guest welcome stays dismissed for the session after the home entry state resets", () => {
  type GuestWelcomeStateWithSessionDismissal = Parameters<typeof shouldShowGuestWelcome>[0] & {
    dismissedForSession: boolean;
  };

  const remountedGuest = {
    authLoading: false,
    hasUser: false,
    eligiblePath: true,
    blockedByNotice: false,
    dismissedForEntry: false,
    dismissedForSession: false,
    snoozeResolved: true,
    snoozedToday: false
  } satisfies GuestWelcomeStateWithSessionDismissal;

  assert.equal(shouldShowGuestWelcome(remountedGuest), true);
  assert.equal(shouldShowGuestWelcome({ ...remountedGuest, dismissedForSession: true }), false);
});

test("guest welcome daily snooze expires on the next local calendar day", () => {
  const today = new Date(2026, 7, 24, 23, 59);
  const tomorrow = new Date(2026, 7, 25, 0, 0);

  assert.equal(getGuestWelcomeTodayKey(today), "2026-08-24");
  assert.equal(isGuestWelcomeSnoozedToday("2026-08-24", today), true);
  assert.equal(isGuestWelcomeSnoozedToday("2026-08-24", tomorrow), false);
  assert.equal(isGuestWelcomeSnoozedToday(null, today), false);
});
