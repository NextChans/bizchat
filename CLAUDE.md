# CLAUDE.md

캐시노트 배너 → 광고문자 작성 → 발송 대상·금액 → KPN 결제 → 비즈챗 발송 요청 브릿지(Next.js 16). 상세는 `docs/`.

## 먼저 알 것
- **비즈챗에는 화면이 없다.** 서버 간 API(대상·견적·발송)만. 초안은 브릿지가 보관한다 (`docs/04-bizchat-api.md`)
- 결제 스펙은 `nextchans/kpn_pg_manual` 이 원본. **참고만 하고 그 저장소는 수정하지 않는다.** 추측하지 말고 원문 확인 (`docs/03-payment.md`)
- 파트너 진입 규격·비즈챗 API 는 미확정(제안안/목업). 주문·초안 저장소가 메모리라 서버리스 배포 불가

## 규칙
1. 커밋 작성자 `NextChans` / `92563633+NextChans@users.noreply.github.com`. `main` 직접 푸시 금지(PR → 머지)
2. passKey·해시는 서버에서만. 결제 금액은 서버가 견적으로 정한다(브라우저 값 금지)
3. 승인 무응답·비즈챗 결과 불명은 **실패로 확정하거나 환불하지 않는다**(보류 후 확정). 비즈챗 오류 분류는 `classify()` 한 곳
4. 주문 상태 전이는 CAS(`orderRepo.transition`)로만
5. 개인정보: 가게 전화번호 원문을 로그에 남기지 않는다

## 명령어
```bash
npm run dev        # /dev/partner 에서 목업 배너로 진입
npm run typecheck && npm test && npm run build
```
