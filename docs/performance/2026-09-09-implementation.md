# 운영 성능 개선 적용 결과

기준: `3d3380a` 이후 성능 개선 작업을 2026-09-09에 검증했다. 기존 기능·접근성·공개 데이터 조건을 유지하는 범위로 구현했다.

## 적용 결과

- 루트의 전역 장소 DB 로드와 `PlacesContext`를 제거했다. 홈 챗봇·장소 상세 대화상자와 코스 지도·검색 보조 화면을 동적 import로 분리했다.
- 홈 코스 전용 요약 API를 추가했다. 기존 응답을 홈 순위 규칙으로 처리했을 때와 동일한 카드 1개(ID 10)를 유지하면서 응답이 23,254B에서 1,281B로 94.5% 감소했다. 표본 JSON 크기이며 전체 전송량이나 p95 개선을 뜻하지 않는다.
- 공개 장소·코드 옵션 API는 쿠키 없는 public Supabase client와 anon RLS를 사용한다. 홈 코스 요약은 기존 관리 클라이언트를 사용하되 공개·미삭제 코스와 활성·미삭제 장소 조건을 조회와 가공 단계에서 강제하고 공개 표시 필드만 반환한다. 인증 proxy 예외는 검토한 공개 GET 경로로 한정했다.
- 브라우저 재검증과 Vercel CDN TTL을 분리했다. `top`·`home`은 60초+SWR 60초, `options`는 300초+SWR 300초, 정상 현재 날씨는 300초+SWR 60초다. 오류와 fallback은 `no-store`다. 공개 데이터 갱신은 TTL에 따라 지연될 수 있으며 즉시 무효화를 보장하지 않는다.
- 허용 이미지 호스트·응답 크기·리디렉션 제한을 유지하면서 반응형 Next 이미지 최적화를 적용했다. 최소 캐시 TTL은 1일이며 동일 URL의 원본 교체는 즉시 반영되지 않을 수 있다.
- 챗봇과 TTS에 `Server-Timing`을 추가하고 `private, no-store`를 적용했다. 기존 과금 흐름은 변경하지 않았다.

## 검증 결과

- 테스트 351/351 통과, typecheck·format·diff-check 통과.
- `npm run build -- --webpack` 통과: Next.js 16.3.4, 53페이지 생성, `/`, `/map`, `/course`, `/community` 정적 출력.
- 변경 범위 lint 통과. 전체 lint는 기존과 동일한 33 errors, 15 warnings이며 경로·규칙·심각도 기준 신규 진단은 0개다.
- 로컬 공개 API는 `Set-Cookie` 없이 CDN TTL을 반환했고 anon RLS 읽기가 정상 동작했다.
- 빈 챗봇 POST와 TTS 요청은 각각 400, `private, no-store`, `Server-Timing`을 반환했다. 유료 호출은 발생시키지 않았다.
- 독립 리뷰에서 blocker는 0개였다.
- 로컬 production 데스크톱 1280px에서 홈, 챗봇 열기·닫기와 초점 복원, 장소 대화상자 열기·닫기와 카드 초점 복원이 정상 동작했다.
- 리소스 기록에서 챗봇 청크는 사용자 열기 시점에, 장소 대화상자 청크는 카드 클릭 시점에 요청됐다.
- 코스 목록, 장소 1곳을 포함한 코스 상세, 지도 검색 필터 목록을 확인했고 누적 JavaScript 오류는 0개였다.
- 모바일 390×844에서 홈과 이미지 카드 화면을 시각 검수했고 가로 넘침은 없었다. 한 번의 로드에서 `layout-shift`가 없었지만 이를 현장 CWV 통과로 일반화하지 않는다.

## 남은 확인과 변경하지 않은 범위

- DB·Vercel Function region, SQL·migration, 의존성은 변경하지 않았다.
- 로그인 상태 회귀, 현장 Core Web Vitals, 실제 유료 AI/TTS 호출 시간은 이번 회차에 검증하지 않았다.
- 회귀 검증과 표본 크기 감소만으로 p95 또는 Core Web Vitals 목표 달성을 주장하지 않는다.
- 이 문서는 병합 전 검증을 기록한다. Vercel 배포 성공과 운영 CDN HIT·TTFB는 merge·push 후 별도 측정한다. 로컬 캐시 헤더 검증은 운영 CDN HIT를 증명하지 않는다.

## 공식 문서 근거

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache), [Cache-Control headers](https://vercel.com/docs/caching/cache-control-headers)
- [Supabase SSR 고급 가이드](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [API key와 RLS](https://supabase.com/docs/guides/getting-started/api-keys)
- [Next.js Image](https://nextjs.org/docs/app/api-reference/components/image)
- [W3C Server Timing](https://www.w3.org/TR/server-timing/)
