-- 운영용 주문 저장소 (목업 InMemoryOrderRepository 대체안, Postgres)
-- 금액·상태는 이 테이블이 기준이다. 감사 대응을 위해 이벤트는 지우지 않는다(append-only).

create table orders (
  id                  varchar(32) primary key,          -- = mxIssueNo
  issued_at           char(14)    not null,             -- = mxIssueDate (KST). 취소·조회에 원값 그대로
  sid                 uuid        not null,
  partner_merchant_id varchar(64) not null,
  draft_id            varchar(64) not null,
  quote_id            varchar(64) not null,
  target_count        integer     not null check (target_count > 0),
  order_name          varchar(256) not null,
  amount              bigint      not null check (amount >= 100),
  status              varchar(20) not null,
  fd_tid              varchar(40),
  tid                 varchar(40),
  pay_method          varchar(2),
  auth_no             varchar(12),
  reply_code          varchar(8),
  reply_message       varchar(200),
  send_request_id     varchar(64),
  approving_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 같은 초안에 "결제가 성립했거나 성립했을 수 있는" 주문은 하나만 (중복 결제 차단)
create unique index orders_one_charged_per_draft on orders (draft_id)
  where status in ('APPROVING','APPROVAL_UNKNOWN','AMOUNT_MISMATCH','PAID','SENDING','SEND_UNKNOWN',
                   'SEND_REQUESTED','REFUNDING','REFUND_FAILED');

-- 보류 건 배치 재확인 대상
create index orders_pending on orders (status, updated_at)
  where status in ('APPROVAL_UNKNOWN','SEND_UNKNOWN','REFUND_FAILED','AMOUNT_MISMATCH');

create table order_events (
  id         bigserial primary key,
  order_id   varchar(32) not null references orders(id),
  at         timestamptz not null default now(),
  type       varchar(40) not null,
  from_status varchar(20),
  to_status   varchar(20),
  detail     jsonb        -- passKey·카드번호 원문 금지
);

-- 상태 전이(CAS). 0 rows 면 경합에서 진 것
-- update orders set status=$to, ..., updated_at=now() where id=$id and status = any($from) returning *;
-- READY→APPROVING 은 위 부분 유니크 인덱스 위반(23505)이면 DUPLICATE_BLOCKED 로 처리
