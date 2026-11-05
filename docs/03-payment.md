# 03. 결제 (KPN FirstPay v3)

규격 원본은 `nextchans/kpn_pg_manual` 입니다. 이 저장소는 **참고만** 하고 수정하지 않습니다.

| 참고 문서 (kpn_pg_manual) | 쓰인 곳 |
| --- | --- |
| `apps/web/content/docs/llm-quick-reference.mdx` | 전체 규칙 요약 |
| `apps/web/content/docs/payment-window/index.mdx` | SDK, goPay, returnUrl 필드 |
| `apps/web/content/docs/payment-window/approve.mdx` | 승인 요청·응답, 무응답 처리 |
| `apps/web/content/docs/payment-window/cancel.mdx` | 취소, 망취소(`netCancelFlag`) |
| `apps/web/content/docs/service-api/inquiry/result.mdx` | 승인 무응답 건 확정 조회 |
| `apps/web/content/docs/reference/response.mdx`, `errors.mdx` | 응답 판정, 에러코드 |
| `reference/kpn/v3/SOURCES.md` | 해시 입력 순서(원본끼리 어긋난 곳 포함) |

## 환경

| | 테스트 | 운영 |
| --- | --- | --- |
| `KPN_ENV` / SDK `env` | `develop` | `product` |
| 결제서버(SDK·승인·취소·조회) | `https://dev.firstpay.co.kr` | `https://pay.firstpay.co.kr` |
| MID / passKey | 공개 테스트 계정 `testcorp` (`.env.example`) | 운영 전용, 배포 환경변수에만 |

환경을 섞으면 `9003`·`9010`. Production 배포에서 `KPN_ENV=develop` 이면 기동 실패시킨다.

## 흐름

```
/bridge/send  결제하기
  └ startPayment(targetCount)            ※ 금액은 받지 않음
      1. 비즈챗 견적 API 로 금액 결정 (서버)
      2. 주문 저장: id = mxIssueNo = "BZ" + YYYYMMDDHHMMSS(KST) + 랜덤 10자 (26자), issuedAt = mxIssueDate
      3. callHash = SHA256(mxId + mxIssueNo + amount + passKey)
      4. 브라우저: firstpay_v2.js 로드(호스트 확인) → new FirstPay({ env, openType: 'submit' }).goPay(...)
결제창 (KPN)
  └ POST {APP_BASE_URL}/bridge/pay/return/{주문번호}   ← 결제서버 form POST, 세션 쿠키 없음
      1. code 9000 → USER_CANCELED / 0000 아니면 AUTH_FAILED
      2. mxIssueNo(경로와 동일)·mxId·amount 를 저장된 주문과 대조
      3. approvalUrl: https + 호스트 allowlist(dev/pay.firstpay.co.kr), userinfo·port 거부 (SSRF)
      4. READY → APPROVING 원자적 선점 (동시 콜백·같은 초안 중복 결제 차단)
      5. POST approvalUrl { mxId, mxIssueNo, fdTid, callHash = SHA256(mxId + mxIssueNo + passKey) }  ※ amount 없음
      6. 성공 = code "200" 그리고 data.replyCode "0000"
      7. 응답 amount 가 있으면 재대조 → 다르면 AMOUNT_MISMATCH → 망취소
      8. PAID → 비즈챗 발송 요청 (04 참고)
  └ 303 /bridge/pay/result/{주문번호}
```

설계 메모
- **returnUrl 에서 바로 승인**한다. 배포 샘플처럼 팝업 → 부모 창 → 서버로 다시 돌리지 않아 `fdTid`·`approvalUrl` 이 브라우저를 한 번 더 거치지 않는다.
- **`openType: submit`**: 파트너 앱 웹뷰에서 `window.open` 팝업이 막히는 경우가 많다.
- 주문번호를 경로에 담는 이유: 결제서버의 cross-site POST 에는 `SameSite=Lax` 세션 쿠키가 실리지 않는다. 그래서 주문은 **반드시 서버 저장소**에 둔다.
- 결과 화면은 303 이후 top-level GET 이라 쿠키가 실린다 → 본인 세션일 때만 금액·결제수단 표시.

## 주문 상태 전이

```
READY ─(인증 0000)→ APPROVING ─(승인 성공)→ PAID → SENDING ─→ SEND_REQUESTED  ✔
  │                    │                              │
  ├ USER_CANCELED      ├ APPROVAL_FAILED              ├ SEND_UNKNOWN ─(재확인)→ SENDING
  ├ AUTH_FAILED        ├ APPROVAL_UNKNOWN ─(조회)→ PAID / APPROVAL_FAILED
  └ DUPLICATE_BLOCKED  └ AMOUNT_MISMATCH → 망취소      └ REFUNDING → REFUNDED / REFUND_FAILED

가상계좌(VA): 승인 = 계좌 발급. 입금통보를 받아야 PAID
APPROVING ─(승인 성공, VA)→ WAITING_DEPOSIT ─(입금통보 00003000)→ PAID → (위와 같음)
APPROVAL_UNKNOWN ─(조회: VA 승인)→ WAITING_DEPOSIT      └ DEPOSIT_EXPIRED (기한 경과. 늦은 입금통보는 PAID 로 받음)
PAID·SEND_UNKNOWN·SEND_REQUESTED ─(입금취소 통보 00003100)→ DEPOSIT_CANCELED (운영 알림)
```

`src/lib/order/types.ts` 가 기준. 모든 전이는 "현재 상태가 from 중 하나일 때만"(CAS)이고, 경합에서 진 쪽은 아무것도 하지 않는다.
결제가 성립했거나 성립했을 수 있는 상태(`CHARGED_OR_MAYBE`)인 주문은 초안당 하나만 허용한다(운영: 부분 유니크 인덱스).

## 실패 상황별 처리

| 상황 | 결과 상태 | 처리 근거 |
| --- | --- | --- |
| 결제창 닫음(`9000`) | USER_CANCELED | 정상 흐름. 다시 결제하면 새 주문번호(재사용 시 `9713`) |
| 금액·주문번호·MID 불일치 | AUTH_FAILED | 승인 안 함 → 인증만 된 건은 24시간 뒤 만료(`9013`), 청구 없음 |
| approvalUrl 위조 | AUTH_FAILED | 호출 자체를 안 함 |
| 같은 콜백 재전송·동시 2건 | 첫 건만 승인 | 원자적 선점 |
| 다른 탭에서 같은 초안 결제 | DUPLICATE_BLOCKED | 두 번째는 승인 안 함(청구 없음) |
| 승인 `code 200` + `replyCode` ≠ `0000` | APPROVAL_FAILED | 거래 실패 |
| 승인 무응답·타임아웃(30s) | APPROVAL_UNKNOWN | **실패로 확정하지 않음.** 결제됐을 수 있음 |
| 승인 응답 금액 불일치 | AMOUNT_MISMATCH → 망취소 | 발송하지 않음 |
| 비즈챗 접수 확정 거절 | REFUNDING → REFUNDED | 망취소(`netCancelFlag=Y`, **원거래** `mxIssueDate`) |
| 비즈챗 결과 불명 | SEND_UNKNOWN | **환불하지 않음.** 같은 멱등키로 재요청 |
| 취소 실패·무응답 | REFUND_FAILED | 운영 수동 처리·알림 대상 |

해시 정리

| 용도 | 입력 |
| --- | --- |
| 결제창 호출 | `mxId + mxIssueNo + amount + passKey` |
| 승인 | `mxId + mxIssueNo + passKey` (amount 없음) |
| 취소 | `mxId + mxIssueNo + amount + passKey` |
| 조회 | `mxId + mxIssueNo + mxIssueDate + passKey` |

## 보류 건 확정 (`reconcile`)

- `APPROVAL_UNKNOWN`: `POST {결제서버}/api/v1/inquiry/inquiry-data` (`replyStatus: ALL`)
  - `PayStatus=APPROVAL`·`ReplyCode=0000` 1건, 취소 0건, 금액 일치, `TID` 있음 → PAID(TID·PayMethod 저장) → 발송
  - 승인 0건이고 선점 후 2분 경과 → APPROVAL_FAILED. 2분 안이면 보류 유지(승인 처리 중일 수 있음)
  - 그 밖(부분취소·금액 상이·다건) → 자동 확정하지 않음, 운영 확인
- `SEND_UNKNOWN`: 같은 멱등키로 발송 재요청
- 지금은 결과 화면의 "다시 확인하기"로만 돈다. **운영에서는 같은 함수를 배치로 주기 실행**해야 한다.

## 결제 범위 제한

- **가상계좌: 입금통보로 확정.** 결제창 호출에 `vactNotiUrl`(`{APP_BASE_URL}/bridge/pay/vact-noti`)과 `expireDate`(`KPN_VACT_EXPIRE_HOURS`, 기본 24시간)를 넘긴다.
  - 통보 검증: `MxHASH256 = SHA256(MxID + passKey + MxIssueNO + MxIssueDate + Amount + Currency)` 를 **저장한 주문 값**으로 계산해 상수시간 비교(kpn_pg_manual `payment-window/virtual-account-notify.mdx`, `reference/errors.mdx`)
  - 응답: 반영했거나 다시 받아도 할 일이 없으면 `ACK=200OKOK`. 지금 처리할 수 없으면(승인 처리 중·발송 중·모르는 주문·위조) `ACK=400FAIL` → 결제서버 재전송
  - 입금이 끝난 VA 는 취소 API 가 없다(`policy.mdx`). 발송 접수 거절 시 자동 망취소 대신 `REFUND_FAILED`(환불 요청, 구매자 환불계좌 필요)
  - 입금 대기 중에는 같은 초안의 다른 결제를 막는다(`WAITING_DEPOSIT` ∈ `CHARGED_OR_MAYBE`). 기한이 지나면 풀린다
  - 개발계는 실입금 불가. `POST https://dev.firstpay.co.kr/api/v1/test/vact/deposit` 로 통보를 발생시키거나(공개 URL 필요), 로컬은 입금 대기 화면의 `[개발] 입금통보 보내기`
- 부분취소·환불 요청 미구현. 1,004원은 매입·매입취소가 안 되는 금액이라 운영 시험에 쓰지 않는다(견적 금액 구조상 나오지 않음).
- `appScheme`: 간편결제 후 파트너 앱 복귀용. `PARTNER_APP_SCHEME` 미정. 카드사 앱 이동(앱투앱) 스킴 등록은 파트너 앱 작업
  (kpn_pg_manual `reference/webview.mdx`).

## 검증 기록

- 단위 테스트(`src/lib/order/service.test.ts`): 해시 입력값, 멱등·동시 콜백, 금액 변조, SSRF 4종, 9000, replyCode 실패,
  승인 무응답 → 조회 확정, 망취소 본문, 발송 무응답 시 취소 안 함, 취소 실패, 중복 결제, 발송 페이로드,
  가상계좌(발급만으로 발송 안 함, 입금통보 해시·위조·재전송·APPROVING 중 FAIL, 조회 VA 승인, 입금 취소, 입금 후 수동 환불, 기한 경과)
- 2026-11-05 테스트 결제서버 종단(Playwright, iPhone 13): 결제창 정상 표시(상품명·금액, 해시 통과),
  결제창 닫기 → returnUrl `9000` → USER_CANCELED 화면까지 확인
- **미검증: 실제 카드 승인 이후** (실물 카드 필요). 승인 응답 필드는 문서 기준으로만 구현됨

## kpn_pg_manual 문서 불일치 (정정 필요, 매뉴얼 저장소는 미수정)

- `service-api/inquiry/result.mdx` 성공 예시는 `code: "0000"`, `reference/response.mdx` 는 성공을 `"200"` 으로 정의.
  브릿지는 조회 응답에 한해 둘 다 통신 성공으로 받고, 거래 판정은 `data.transactions` 로만 한다.
