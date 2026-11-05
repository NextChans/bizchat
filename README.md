# bizchat

캐시노트 등 파트너 앱의 비즈챗 배너에서 진입해 **광고문자 작성 → 발송 대상·금액 선택 → 결제 → 발송 요청**까지 끝내는 페이지입니다.
가맹점이 보는 화면은 전부 이 브릿지가 그립니다. **비즈챗에는 화면이 없고, 서버 간 API(견적·발송 요청)로만 통신합니다.**

| 상대 | 방식 | 주고받는 것 |
| --- | --- | --- |
| 파트너 앱(캐시노트) | 브라우저 form POST (서명) | 가맹점 정보 → 브릿지 진입 |
| KPN 결제서버 | SDK 결제창 + 서버 JSON API | 결제창 호출 · 인증 결과(returnUrl) · 승인 · 취소 · 조회 |
| 비즈챗 | **서버 간 API** | 대상 규모 · 견적 · 발송 요청(문안·대상·결제정보) |

> **현재 목업입니다.** 파트너 진입 규격과 비즈챗 전문 스펙이 정해지지 않아 아래 규격은 제안안이고, 비즈챗 호출(대상·견적·발송)은 `MockBizchatClient` 로 대신하고, `BIZCHAT_API_BASE_URL` 을 넣으면 가정 규격의 `HttpBizchatClient` 를 씁니다.
> 결제는 KPN FirstPay v3 테스트 서버(`dev.firstpay.co.kr`)에 실제로 붙습니다. 규격 원본은 `nextchans/kpn_pg_manual` 입니다.

## 실행

```bash
npm install
cp .env.example .env.local   # 공개 테스트 계정(testcorp) 포함
npm run dev        # http://localhost:3000/dev/partner  ← 목업 캐시노트 배너
npm test           # 서명·세션·정규화·템플릿 단위 테스트
npm run build
```

## 흐름

```
파트너 앱 배너 클릭
  └─ 파트너 서버가 서명한 form 을 웹뷰에서 auto-submit
POST /bridge/entry  (application/x-www-form-urlencoded, UTF-8)
  ├─ partnerCode 허용 목록 → HMAC 서명(원문 기준) → ±5분 타임스탬프
  ├─ zod 정규화(NFC·제어문자 제거·전화번호 포맷·동네명 추출·업종 분류)
  ├─ nonce 1회 소비(재전송 차단)
  └─ AES-256-GCM 암호화 세션 쿠키(30분, httpOnly, Path=/bridge) → 303
GET /bridge          1단계 가게 정보 확인 → 2단계 템플릿 선택·빈칸 입력
  └─ Server Action submitAd: 세션 재검증 → 템플릿 슬롯 검증 → 서버에서 문구 재생성 → 바이트 검사
       └─ 초안을 브릿지 저장소에 보관(비즈챗 호출 없음) → /bridge/send
GET /bridge/send     발송 대상 규모 선택 → 비즈챗 견적 API 로 금액 표시
  └─ Server Action startPayment(targetCount)   ※ 금액은 받지 않음
       ├─ 비즈챗 견적을 서버에서 다시 받아 금액 결정, 주문 저장(READY)
       └─ callHash = SHA256(mxId+mxIssueNo+amount+passKey) → 브라우저: FirstPay SDK goPay(openType: submit)
결제창 → POST /bridge/pay/return/{주문번호}   (결제서버 form POST, 세션 쿠키 없음)
  ├─ 9000 → USER_CANCELED / 그 외 실패 → AUTH_FAILED
  ├─ mxIssueNo·mxId·amount 대조, approvalUrl 호스트 allowlist(SSRF)
  ├─ READY→APPROVING 원자적 선점(동시 콜백·같은 초안 중복 결제 차단)
  ├─ 승인 POST approvalUrl, callHash = SHA256(mxId+mxIssueNo+passKey)  ※ amount 없음
  │    성공 = code "200" 그리고 data.replyCode "0000" / 무응답 → APPROVAL_UNKNOWN(조회로 확정)
  └─ PAID → 비즈챗 발송 요청 API(문안·대상·결제정보, Idempotency-Key = 주문번호)
       ├─ 접수 → SEND_REQUESTED
       ├─ 접수 거절(확정) → 망취소(netCancelFlag=Y, 원거래 mxIssueDate) → REFUNDED
       └─ 무응답 → SEND_UNKNOWN (취소하지 않음. 같은 멱등키로 재요청)
→ 303 GET /bridge/pay/result/{주문번호}   (본인 세션만 상세 표시, 보류 건 "다시 확인하기")
```

주문 상태 전이는 `src/lib/order/types.ts`, 운영 저장소 스키마는 `docs/schema.sql`.

## 파트너 진입 규격 (제안안)

`POST {BASE_URL}/bridge/entry`

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `partnerCode` | Y | `cashnote` |
| `partnerMerchantId` | Y | 파트너 가맹점 식별자 `[A-Za-z0-9_-]{1,64}` |
| `storeName` | Y | 상호명 (50자) |
| `categoryMain` | Y | 업종 대분류 (40자) |
| `categorySub` | N | 업종 소분류 (40자) |
| `address` | N | 사업장 주소 (200자) |
| `regionName` | N | 동네명. 없으면 주소에서 추출 |
| `storePhone` | N | 가게 연락처. 숫자/하이픈 |
| `timestamp` | Y | epoch seconds. 서버 시각 ±300초 |
| `nonce` | Y | `[A-Za-z0-9_-]{16,64}`, 1회용 |
| `signature` | Y | 아래 서명의 소문자 hex |

서명:

```
canonical = 아래 순서 그대로 "key=encodeURIComponent(value)" 를 & 로 연결 (없는 필드는 빈 값으로 자리 유지)
  partnerCode, partnerMerchantId, storeName, categoryMain, categorySub,
  address, regionName, storePhone, timestamp, nonce
signature = HMAC-SHA256(partnerSecret, canonical)
```

실패하면 `303 /bridge/error?code=…` (`bad_signature`, `expired`, `replay`, `unknown_partner`, `invalid_request`) 로 보냅니다. 사유 상세는 로그에만 남깁니다.

## 업종 템플릿

`src/lib/ad/templates.ts`. 업종은 대분류/소분류 문자열 키워드로 `food`, `construction`, `manufacturing`, `general` 중 하나로 나눕니다(`src/lib/bridge/industry.ts`).
템플릿마다 제목·본문 세그먼트가 있고, 광고 표기 `(광고)[SKT]` 와 수신거부 문구는 고정이라 편집할 수 없습니다. 링크를 켜면 `linkUrl` 슬롯이 추가되고, https 만 허용합니다.

## 환경변수

`.env.example` 참고. 운영(`NODE_ENV=production`)에서는 `BRIDGE_SESSION_SECRET` 과 `CASHNOTE_PARTNER_SECRET` 이 필수이고, 서명 검증을 끌 수 없으며, `/dev/partner` 는 404 입니다.

## 운영 전환 시 남은 일

결제
- [ ] **주문 저장소를 Postgres 로 교체** (`docs/schema.sql`). 지금은 인스턴스 메모리라 `next dev` 단일 프로세스에서만 맞다. 서버리스 배포 전 필수
- [ ] 보류 건(`APPROVAL_UNKNOWN`·`SEND_UNKNOWN`) 배치 재확인 + `REFUND_FAILED`·`AMOUNT_MISMATCH` 운영 알림
- [ ] 운영 MID 결제수단에서 가상계좌 제외 (입금 통보 전 발송 불가. 이 흐름은 즉시결제만 다룸)
- [ ] 파트너 앱 복귀 스킴(`PARTNER_APP_SCHEME`) 확인, 웹뷰 앱투앱(카드사 앱) 스킴 등록은 파트너 앱 쪽 작업
- [ ] 견적 만료·단가 변경 시 처리, 세금계산서/현금영수증 발행 주체 확정

연동 일반

- [ ] 파트너와 진입 규격 확정 (필드·서명 방식·업종 코드 체계. 문자열 키워드 분류 대신 코드 매핑)
- [ ] 개인정보 범위 합의: 개인사업자 연락처는 개인 휴대폰일 수 있음. 로그는 마스킹·건수만 남김
- [ ] nonce 저장소를 Redis(`SET NX EX`)로 교체. 지금은 인스턴스 메모리라 다중 인스턴스에서 완전하지 않음
- [ ] 비즈챗 전문 확정 후 `HttpBizchatClient` 경로·필드·인증 맞추기 (지금 `/v1/targets` `/v1/quotes` `/v1/sends`, Bearer 는 가정)
  - 멱등키(`Idempotency-Key`) 지원 필수. 없으면 발송 무응답 건을 안전하게 재시도할 수 없다
  - 오류 분류 합의: 408·429·5xx·타임아웃 = 결과 불명(취소 안 함), 그 외 4xx = 확정 거절(망취소). `classify()` 가 기준
  - 접수 후 비동기 결과(검수 반려·발송 실패)를 받는 방법. 반려 시 환불하려면 비즈챗 → 브릿지 콜백(서명) 또는 상태 조회 API 가 필요
- [ ] LMS 제목·본문 바이트 상한, 광고 표기 규칙을 비즈챗·통신사 기준으로 맞추기
- [ ] iOS WKWebView 서드파티 쿠키 정책 점검 (파트너 웹뷰에서 쿠키가 유지되는지)
- [ ] `/bridge/entry` rate limit (WAF/엣지)
