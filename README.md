# bizchat

캐시노트 등 파트너 앱의 **비즈챗 배너 → 브릿지 페이지 → 비즈챗** 연결 페이지입니다.
파트너가 가맹점 정보(상호·업종·주소·연락처)를 POST 로 넘기면, 업종별 광고문자 템플릿에 미리 채워 보여 주고, 가맹점주가 입력을 마치면 비즈챗으로 넘깁니다.

> **현재 목업입니다.** 파트너 진입 규격과 비즈챗 전문 스펙이 정해지지 않아 아래 규격은 제안안이고, 비즈챗 호출은 `MockBizchatClient` 로 대신합니다.

## 실행

```bash
npm install
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
       └─ BizchatClient.createAdDraft(idempotencyKey = 세션 sid) → /bridge/done
```

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

- [ ] 파트너와 진입 규격 확정 (필드·서명 방식·업종 코드 체계. 문자열 키워드 분류 대신 코드 매핑)
- [ ] 개인정보 범위 합의: 개인사업자 연락처는 개인 휴대폰일 수 있음. 로그는 마스킹·건수만 남김
- [ ] nonce 저장소를 Redis(`SET NX EX`)로 교체. 지금은 인스턴스 메모리라 다중 인스턴스에서 완전하지 않음
- [ ] 비즈챗 전문 확정 후 `HttpBizchatClient` 구현: Idempotency-Key, 타임아웃, 재시도 정책, `redirectUrl` 도메인 allowlist
- [ ] LMS 제목·본문 바이트 상한, 광고 표기 규칙을 비즈챗·통신사 기준으로 맞추기
- [ ] iOS WKWebView 서드파티 쿠키 정책 점검 (파트너 웹뷰에서 쿠키가 유지되는지)
- [ ] `/bridge/entry` rate limit (WAF/엣지)
