# 05. 운영

## 환경변수

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `BRIDGE_SESSION_SECRET` | 운영 | 세션 쿠키 암호화 키(32자 이상). 로컬은 미설정 시 개발용 키 |
| `CASHNOTE_PARTNER_SECRET` | 운영 | 파트너 서명 검증 공유키 |
| `BRIDGE_SIGNATURE_MODE` | | 로컬만 `off` 허용. 운영은 항상 검증 |
| `BRIDGE_DEV_TOOLS` | | Vercel Preview 에서 `/dev/partner` 를 켤 때만 `true`. Production 에서는 무시 |
| `KPN_ENV` | | `develop`(기본) / `product` |
| `KPN_MX_ID` · `KPN_PASSKEY` | Y | 운영 값은 배포 환경변수에만. 공개 테스트 계정은 `.env.example` |
| `APP_BASE_URL` | Y | returnUrl 기준 주소 |
| `PARTNER_APP_SCHEME` | | 간편결제 후 앱 복귀 스킴(`xxx://`). 미정 |
| `BIZCHAT_API_BASE_URL` · `BIZCHAT_API_KEY` | | 비우면 목업 클라이언트 |
| `BIZCHAT_MOCK_SEND` | | 목업 발송 응답: 비움=정상 / `reject` / `timeout` |

값 앞뒤 공백·따옴표는 KPN 설정에서 털어낸다(한 글자만 섞여도 `9010`).

## 로컬 실행·검증

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000/dev/partner → 목업 배너로 진입
npm run typecheck
npm test               # vitest
npm run build
```

- 결제창 시험: 테스트 결제서버에서 결제창이 뜨고, 닫으면 결과 화면(`결제를 취소했어요`)으로 돌아온다
- 발송 실패 시나리오: `BIZCHAT_MOCK_SEND=reject`(망취소) / `timeout`(보류 → 다시 확인하기)
- 진입 거부 시나리오: `/dev/partner` 에서 "서명 변조해서 보내기"

## 로그 이벤트

JSON 한 줄(`ts`, `level`, `event`, …). 전화번호 원문·passKey·카드번호는 남기지 않는다.

| 이벤트 | 레벨 | 의미 |
| --- | --- | --- |
| `bridge.entry.accepted` / `bridge.entry.rejected` | info / warn | 진입 성공 / 거부(code·detail) |
| `bridge.draft.saved` | info | 초안 저장(템플릿·유형·바이트, 가게명 수정 여부) |
| `bridge.quote_failed` | warn | 견적 API 실패 |
| `order.prepared` | info | 주문 생성(금액·대상) |
| `order.auth_result` / `order.auth_result_ignored` | info | 인증 결과 수신 / READY 아님(재전송) |
| `order.auth_mismatch` · `order.approval_url_rejected` | warn | 대조 실패 · 승인 주소 거부 |
| `order.claim_lost` | info | 선점 실패(동시 콜백·중복 결제) |
| `order.approve_response` · `order.paid` | info | 승인 응답 · 결제 완료 |
| `order.approve_no_response` | **warn** | 승인 무응답 → 보류 |
| `order.approved_amount_mismatch` | **warn** | 승인 금액 불일치 → 취소 |
| `order.send_requested` / `order.send_failed` | info / warn | 발송 접수 / 실패(definitive 여부) |
| `order.refunded` | info | 보상 취소 완료 |
| `order.refund_failed` · `order.refund_no_response` · `order.refund_missing_tid` | **warn** | 수동 처리 필요 |
| `order.inquiry` / `order.inquiry_failed` | info | 보류 건 조회 |
| `order.virtual_account_unsupported` | warn | 가상계좌 승인 수신(미지원) |
| `order.return_error` · `order.return_unparsable` | warn | returnUrl 처리 예외 |

알림 권장: `order.refund_*`, `order.approved_amount_mismatch`, 상태 `REFUND_FAILED`·`AMOUNT_MISMATCH`, 1시간 넘은 `APPROVAL_UNKNOWN`·`SEND_UNKNOWN`.

## 배포 전 체크리스트

- [ ] 초안·주문 저장소 Postgres 전환(`schema.sql`), nonce 저장소 Redis 전환 — **서버리스 배포의 전제**
- [ ] 보류 건 재확인 배치(`reconcile`) + 위 알림
- [ ] 운영 env 설정, `KPN_ENV=product` 와 운영 MID·passKey 짝 확인
- [ ] 운영 MID 결제수단에서 가상계좌 제외
- [ ] `/dev/partner` 가 Production 에서 404 인지 확인
- [ ] 파트너 웹뷰 실기기: 진입 쿠키 유지, 결제창 이동·복귀, 카드사 앱 이동
- [ ] `/bridge/entry` rate limit(WAF/엣지)
- [ ] CI(타입체크·테스트·빌드) 추가 — 현재 저장소에 CI 없음

## 작업 규칙

- 커밋 작성자는 `NextChans`(`git config user.name NextChans`, `92563633+NextChans@users.noreply.github.com`)
- `main` 직접 푸시 금지. 브랜치 → PR → GitHub 에서 머지
- 결제 스펙은 `nextchans/kpn_pg_manual` 에서 확인하고 추측하지 않는다. 그 저장소는 참고만 하고 수정하지 않는다
- passKey·해시 생성은 서버에서만. 클라이언트 번들에 passKey 가 없는지 빌드 후 확인
