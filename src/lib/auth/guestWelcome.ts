type GuestWelcomeState = {
  authLoading: boolean;
  hasUser: boolean;
  eligiblePath: boolean;
  blockedByNotice: boolean;
  dismissedForEntry: boolean;
  dismissedForSession?: boolean;
  snoozeResolved: boolean;
  snoozedToday: boolean;
};

export const GUEST_WELCOME_SNOOZE_STORAGE_KEY = "guest_welcome_snooze_date";
export const GUEST_WELCOME_SESSION_STORAGE_KEY = "guest_welcome_dismissed_for_session";

export function getGuestWelcomeTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isGuestWelcomeSnoozedToday(storedDate: string | null, date = new Date()) {
  return storedDate === getGuestWelcomeTodayKey(date);
}

export function isGuestWelcomeEligiblePath(pathname: string) {
  return pathname === "/";
}

export function shouldShowGuestWelcome(state: GuestWelcomeState) {
  return (
    !state.authLoading &&
    !state.hasUser &&
    state.eligiblePath &&
    !state.blockedByNotice &&
    !state.dismissedForEntry &&
    !state.dismissedForSession &&
    state.snoozeResolved &&
    !state.snoozedToday
  );
}
