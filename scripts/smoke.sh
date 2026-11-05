#!/usr/bin/env bash
# 컨테이너 스모크 테스트. 사용: scripts/smoke.sh <image>
# 1) 로컬 체험 모드: 헬스·체험 페이지·입금통보 거부 응답  2) 운영 모드: 개발 도구 404
set -euo pipefail
IMAGE="${1:?image}"
COMMON=(-e BRIDGE_SESSION_SECRET=ci-only-bridge-session-secret-0123456789 -e CASHNOTE_PARTNER_SECRET=ci-only
        -e KPN_ENV=develop -e KPN_MX_ID=testcorp -e KPN_PASSKEY=ci-dummy-passkey)

cleanup() { docker rm -f bz-local bz-prod >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name bz-local -p 3000:3000 -e APP_ENV=local -e APP_BASE_URL=http://localhost:3000 "${COMMON[@]}" "$IMAGE" >/dev/null
docker run -d --name bz-prod  -p 3001:3000 -e APP_BASE_URL=https://bizchat.example.com "${COMMON[@]}" "$IMAGE" >/dev/null

wait_up() { for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$1/api/health" >/dev/null && return 0; sleep 1; done; docker logs bz-local; return 1; }
wait_up 3000; wait_up 3001

expect() { # port path code
  local got; got=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1$2")
  [[ "$got" == "$3" ]] || { echo "FAIL $1$2: expected $3 got $got"; exit 1; }; echo "ok   :$1$2 -> $got"
}
expect 3000 /api/health 200
expect 3000 /sample 200
expect 3000 /dev/partner 200
expect 3001 /sample 404
expect 3001 /dev/partner 404

ack=$(curl -s -X POST -d 'MxIssueNO=forged&ReplyCode=00003000' http://127.0.0.1:3001/bridge/pay/vact-noti)
[[ "$ack" == "ACK=400FAIL" ]] || { echo "FAIL vact-noti forged: $ack"; exit 1; }; echo "ok   forged vact-noti -> $ack"

user=$(docker inspect -f '{{.Config.User}}' bz-prod)
[[ "$user" == "app" ]] || { echo "FAIL container user: $user"; exit 1; }; echo "ok   non-root user"
