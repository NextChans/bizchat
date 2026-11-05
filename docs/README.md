# bizchat 브릿지 문서

파트너 앱(캐시노트) 배너 → **광고문자 작성 → 발송 대상·금액 선택 → KPN 결제 → 비즈챗 발송 요청**까지 끝내는 브릿지 페이지의 내부 문서입니다.

| 문서 | 내용 |
| --- | --- |
| [01-overview.md](01-overview.md) | 배경, 범위, 시스템 구성, 화면 흐름, 코드 지도 |
| [02-partner-entry.md](02-partner-entry.md) | 파트너 진입 규격(제안안), 서명, 세션, 제공 정보·개인정보 범위 |
| [03-payment.md](03-payment.md) | KPN FirstPay v3 결제 연동, 주문 상태 전이, 실패 보상 |
| [04-bizchat-api.md](04-bizchat-api.md) | 비즈챗 서버 간 API(가정 규격), 오류 분류, 합의 필요 사항 |
| [05-operations.md](05-operations.md) | 환경변수, 로컬 실행·검증, 로그 이벤트, 배포 전 체크리스트 |
| [06-decisions-and-todo.md](06-decisions-and-todo.md) | 설계 결정 기록, 남은 일, 외부 확인 대기 |
| [schema.sql](schema.sql) | 운영용 Postgres 스키마(초안·주문·이벤트) |

> 현재 상태(2026-11-05): **목업 단계.** 파트너 진입 규격·비즈챗 API 는 미확정이라 제안안/목업이고,
> 결제는 KPN 테스트 결제서버(`dev.firstpay.co.kr`)에 실제로 붙어 있습니다. 주문·초안 저장소가 메모리라 **서버리스 배포 불가**.
