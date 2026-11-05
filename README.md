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

## 파트너 진입 규격

제안안 전문(필드·서명·오류 코드)은 [docs/02-partner-entry.md](docs/02-partner-entry.md).

## 문서

설계·규격·운영·남은 일은 [`docs/`](docs/README.md) 에 있습니다.

| 문서 | 내용 |
| --- | --- |
| [01-overview](docs/01-overview.md) | 배경(KCD 협의), 범위, 구성, 화면 흐름, 코드 지도 |
| [02-partner-entry](docs/02-partner-entry.md) | 파트너 진입 규격(제안안)·서명·세션 |
| [03-payment](docs/03-payment.md) | KPN 결제 흐름·상태 전이·실패 보상 |
| [04-bizchat-api](docs/04-bizchat-api.md) | 비즈챗 서버 간 API(가정)·오류 분류 |
| [05-operations](docs/05-operations.md) | 환경변수·로그·배포 체크리스트 |
| [06-decisions-and-todo](docs/06-decisions-and-todo.md) | 결정 기록·남은 일 |
