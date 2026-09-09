# Guest Onboarding and Chat Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비로그인 사용자를 부드럽게 안내하고 챗봇의 기존 장소·공개 코스 추천을 앱 내부 지도와 코스 상세에 연결한다.

**Architecture:** 게스트 안내와 채팅 내비게이션 판정은 테스트 가능한 순수 함수로 분리한다. 챗 API는 장소 contentId를 노출하고, 기존 공개 코스 API에 contentIds 필터를 연결한 뒤 챗 UI가 연관 코스를 조회해 메시지 카드에 합친다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Supabase, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-19-guest-onboarding-chat-navigation-design.md`

## Global Constraints

- 비로그인 탐색은 차단하지 않는다.
- 새 코스는 생성하지 않고 공개된 기존 코스만 추천한다.
- 장소 지도 이동은 외부 지도가 아닌 앱 내부 `/map`을 사용한다.
- 기존 DESIGN.md 토큰과 컴포넌트 패턴을 사용하며 새 의존성을 추가하지 않는다.

---

### Task 1: Navigation and Visibility Contracts

**Files:**

- Create: `src/lib/chat/discoveryLinks.test.ts`
- Create: `src/lib/chat/discoveryLinks.ts`
- Create: `src/lib/auth/guestWelcome.test.ts`
- Create: `src/lib/auth/guestWelcome.ts`

**Interfaces:**

- Produces: `buildInternalPlaceMapHref`, `buildRelatedCourseQuery`, `isCourseRecommendationRequest`, `normalizeContentIds`, `shouldShowGuestWelcome`

- [x] **Step 1: Write failing tests for internal map URLs, course query construction, content-id normalization, course intent, and guest prompt visibility.**
- [x] **Step 2: Run the targeted Node tests and verify the helpers are missing.**
- [x] **Step 3: Implement the smallest pure helpers that satisfy the contracts.**
- [x] **Step 4: Run the targeted tests and verify they pass.**

### Task 2: Existing Course Filtering and Chat Payload

**Files:**

- Modify: `src/app/api/courses/shared/route.ts`
- Modify: `src/app/api/chat/route.ts`

**Interfaces:**

- Consumes: `normalizeContentIds`
- Produces: public courses filtered by `contentIds`; place recommendations containing `contentId`

- [x] **Step 1: Use the tested content-id normalization in the shared course route and intersect it with existing filters.**
- [x] **Step 2: Read `metadata.contentid` into each chat place card.**
- [x] **Step 3: Run targeted tests and typecheck.**

### Task 3: Chat Cards and Internal Navigation

**Files:**

- Modify: `src/components/Chatbot.tsx`

**Interfaces:**

- Consumes: `buildInternalPlaceMapHref`, `buildRelatedCourseQuery`, `isCourseRecommendationRequest`, `/api/courses/shared`
- Produces: in-app place navigation and existing-course recommendation cards

- [x] **Step 1: Add public course response types and non-blocking related-course loading.**
- [x] **Step 2: Replace the external map anchor with an internal navigation button that closes chat through page navigation.**
- [x] **Step 3: Render image-led public course cards linking to `/course/{course_id}`.**
- [x] **Step 4: Run targeted tests and typecheck.**

### Task 4: Guest Welcome Prompt

**Files:**

- Create: `src/components/auth/GuestWelcomePrompt.tsx`
- Modify: `src/components/RootShell.tsx`

**Interfaces:**

- Consumes: `useAuth`, `shouldShowGuestWelcome`, active home notice state
- Produces: a session-scoped, non-blocking login/signup/browse prompt

- [x] **Step 1: Build the responsive prompt with login, signup, and browse actions.**
- [x] **Step 2: Mount it under AuthProvider and suppress it on auth/legal routes and while a home notice is active.**
- [x] **Step 3: Run targeted tests and typecheck.**

### Task 5: Verification and Local Preview

**Files:**

- Modify only files required by formatter output.

- [x] **Step 1: Run formatting on changed files.**
- [ ] **Step 2: Run targeted tests, full tests, lint, typecheck, and build.**
- [x] **Step 3: Start the development server on port 3000.**
- [x] **Step 4: Inspect the guest prompt and chat navigation flows at desktop and mobile widths.**

### Task 6: Home Place Map Focus

**Files:**

- Modify: `src/features/home/homePresentation.ts`
- Modify: `src/features/home/homePresentation.test.ts`
- Modify: `src/features/home/HomePlaceDialog.tsx`
- Modify: `src/features/home/HomeDiscovery.tsx`

- [x] **Step 1: Protect exact `contentId` plus query-fallback URL construction with a failing test.**
- [x] **Step 2: Use the URL for home detail, sharing, and discovery place cards.**
- [x] **Step 3: Verify the destination opens the exact selected place detail on the internal map.**
