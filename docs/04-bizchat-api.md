# 04. 비즈챗 서버 간 API

**비즈챗에는 화면이 없습니다.** 가맹점이 보는 화면은 전부 브릿지가 그리고, 비즈챗과는 서버끼리 아래 세 가지만 주고받습니다.
광고 초안은 브릿지가 보관하며(`ad_drafts`), **결제 전에는 비즈챗에 아무것도 만들지 않습니다.** 결제가 끝난 뒤 발송 요청에 문안을 담아 보냅니다.

> 전문 스펙 미정. 기본은 `MockBizchatClient`. `BIZCHAT_API_BASE_URL` 을 넣으면 `HttpBizchatClient` 를 쓰는데,
> **경로·필드·Bearer 인증은 가정**입니다(`src/lib/bizchat/client.ts`).

## 엔드포인트 (가정)

| 용도 | 가정 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| 발송 가능 대상 규모 | `GET /v1/targets?region=` | 동네명 | `{ options: number[] }` |
| 견적 | `POST /v1/quotes` | `{ draftId, regionName, messageType, targetCount }` | `{ quoteId, unitPrice, supplyAmount, vat, totalAmount, expiresAt, … }` |
| 발송 요청 | `POST /v1/sends` + `Idempotency-Key: {주문번호}` | 아래 | `{ sendRequestId, status: "ACCEPTED" }` |

발송 요청 본문

```jsonc
{
  "idempotencyKey": "BZ20261105230729SPH4UTJ62O",
  "quoteId": "Q-…",
  "draftId": "AD…",
  "merchant": { "partnerCode", "partnerMerchantId", "storeName", "storePhone", "regionName", "address" },
  "targeting": { "regionName": "역삼동", "targetCount": 1000 },
  "message": { "type": "LMS", "title": "(광고) …", "body": "(광고)[SKT] … 무료 수신거부 1504", "bodyBytes": 559 },
  "payment": { "orderId": "BZ…", "amount": 36300, "tid": "…", "payMethod": "CC", "paidAt": 1793000000000 }
}
```

- 금액은 **비즈챗 견적이 기준**이다. 브릿지는 계산하지 않고, 결제 준비 시점에 서버가 견적을 다시 받아 주문 금액으로 쓴다
- 문안은 서버가 템플릿으로 다시 렌더링·검증한 값만 보낸다(클라이언트 미리보기를 믿지 않음)
- 문자 유형: 본문 90byte 이하 SMS, 초과 LMS (EUC-KR 근사: ASCII 1, 그 외 2). 목업 상한 본문 2,000byte·제목 40byte
- 목업 단가: SMS 13원, LMS 33원(VAT 별도). 대상 선택지 300/500/1,000/2,000/3,000

## 타임아웃·오류 분류 — 결제 취소 여부가 여기서 갈린다

타임아웃 5초. 판정은 `classify()` 한 곳.

| 응답 | 해석 | 브릿지 처리 |
| --- | --- | --- |
| 2xx | 접수 | SEND_REQUESTED |
| 4xx (408·429 제외) | **확정 거절** | 망취소 → REFUNDED |
| 408 · 429 · 5xx · 타임아웃 · 네트워크 오류 · 2xx 본문 파싱 실패 | **결과 불명** | SEND_UNKNOWN, 환불하지 않고 같은 멱등키로 재요청 |

결과 불명을 환불하면 "돈은 돌려받고 문자는 나가는" 사고가 난다. 그래서 멱등키가 필수다.

## 비즈챗과 합의해야 할 것

1. 엔드포인트·필드·인증 방식(현재 가정)
2. **`Idempotency-Key` 지원** — 같은 키 재요청 시 같은 결과. 없으면 결과 불명 건을 안전하게 재시도할 수 없다
3. **오류 분류 합의** — 위 표. 예: 409 를 "이미 접수"로 쓴다면 처리 변경 필요
4. **접수 이후 비동기 결과**(검수 반려·발송 실패)를 받는 방법 — 비즈챗 → 브릿지 서명 콜백 또는 상태 조회 API.
   반려 시 환불하려면 필요. 정해지면 수신 경로 + 반려 시 취소를 붙인다
5. 견적 유효시간·단가 변경 시 처리, 대상 산정 기준(동네명 → 반경/행정동?)
6. 세금계산서·현금영수증 발행 주체
