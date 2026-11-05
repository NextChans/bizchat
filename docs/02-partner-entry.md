# 02. 파트너 진입

> **제안안입니다.** 파트너(KCD)와 확정되면 이 문서와 `src/lib/bridge/signature.ts` 의 `SIGNED_FIELDS` 가 규격이 됩니다.

## 요청

`POST {BASE_URL}/bridge/entry` · `application/x-www-form-urlencoded` · UTF-8 · 본문 8KB 이하

배너 클릭 시 **파트너 서버가 서명한 hidden form 을 웹뷰에서 auto-submit** 합니다(브라우저 네비게이션).
서명 비밀키는 파트너 서버에만 있어야 하며, 앱·웹뷰 코드에 두지 않습니다.

| 필드 | 필수 | 형식 | 설명 |
| --- | --- | --- | --- |
| `partnerCode` | Y | `cashnote` | 허용 목록(`src/lib/bridge/partners.ts`) |
| `partnerMerchantId` | Y | `[A-Za-z0-9_-]{1,64}` | 파트너 가맹점 식별자 |
| `storeName` | Y | 50자 | 상호명 |
| `categoryMain` | Y | 40자 | 업종 대분류 |
| `categorySub` | N | 40자 | 업종 소분류 |
| `address` | N | 200자 | 사업장 주소 |
| `regionName` | N | 20자 | 동네명. 없으면 주소에서 추출 |
| `storePhone` | N | 숫자·하이픈 | 가게 연락처 |
| `timestamp` | Y | epoch seconds(10자리) | 서버 시각 ±300초 |
| `nonce` | Y | `[A-Za-z0-9_-]{16,64}` | 1회용 |
| `signature` | Y | 소문자 hex 64 | 아래 |

## 서명

```
canonical = 아래 순서대로 "key=" + encodeURIComponent(value) 를 "&" 로 연결
            (값이 없는 필드도 빈 값으로 자리를 지킨다 → 필드 삭제로 우회 불가)
  partnerCode, partnerMerchantId, storeName, categoryMain, categorySub,
  address, regionName, storePhone, timestamp, nonce
signature = hex(HMAC-SHA256(partnerSecret, canonical))
```

- 검증은 **정규화 전 원문**으로 한다. 그 다음 zod 로 정규화(NFC, 제어·제로폭·양방향 문자 제거, 전화번호 포맷).
- 비교는 `timingSafeEqual`. 운영(`NODE_ENV=production`)에서는 서명 검증을 끌 수 없다.
- nonce 는 `partnerCode:nonce` 키로 600초간 1회만 허용. **목업은 인스턴스 메모리** → 운영은 Redis `SET NX EX`.

## 처리 결과

성공: 암호화 세션 쿠키 발급 후 `303 /bridge` (PRG — 새로고침해도 POST 재전송 없음)

실패: `303 /bridge/error?code=…` · 화면에는 코드만, 상세 사유는 로그(`bridge.entry.rejected`)에만

| code | 원인 |
| --- | --- |
| `unknown_partner` | 허용되지 않은 partnerCode 또는 비밀키 미설정 |
| `bad_signature` | 서명 누락·불일치·형식 오류 |
| `expired` | timestamp 가 ±300초 밖 |
| `replay` | 이미 쓴 nonce |
| `invalid_request` | Content-Type·크기·필드 형식 오류, GET 요청 |

## 세션

- 쿠키 `bizchat_bridge` · `HttpOnly` · `Secure`(운영) · `SameSite=Lax` · `Path=/bridge`
- 값은 AES-256-GCM 암호문(HKDF 로 `BRIDGE_SESSION_SECRET` 에서 키 유도). 쿠키만으로 위·변조와 열람을 막는다
- TTL 30분, 활동 시 연장, 진입 후 최대 2시간. 쿠키에는 가맹점 정보와 초안 **참조**만(본문은 서버 저장소)
- `SameSite=Lax` 인 이유: 파트너 앱 → cross-site POST → 303 → top-level GET 에서 쿠키가 실려야 함
- **확인 필요:** iOS WKWebView 에서 쿠키가 유지되는지 파트너 앱 실기기로 확인. 안 되면 1회용 토큰(URL) 방식으로 전환

## 업종 분류

대분류·소분류 문자열 키워드로 `construction` → `manufacturing` → `food` 순으로 판정, 나머지는 `general`
(`src/lib/bridge/industry.ts`). 순서 의미: "식료품 제조업"은 제조, "제과점업"은 외식.
파트너가 업종 코드(KSIC 등)를 주면 코드 매핑으로 교체한다.

## 제공 정보와 개인정보

- KCD 회신(2026-10-21): **상호·업종·주소는 개인정보 검토상 전달 가능.** 그 외는 개발 쪽 논의 필요
- `storePhone` 은 개인사업자의 개인 휴대폰일 수 있어 **합의 전까지 선택 필드**. 로그에는 원문을 남기지 않음(`hasPhone` 만)
- 파트너 원본 정보와 사용자가 화면에서 고친 값은 구분해 보관(`storeNameEdited` 로그)
