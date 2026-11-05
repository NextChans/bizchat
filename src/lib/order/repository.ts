import 'server-only'
import { CHARGED_OR_MAYBE, type Order, type OrderEvent, type OrderStatus } from './types'

/**
 * 주문 저장소. returnUrl 로 들어오는 결제서버 POST 에는 세션 쿠키가 실리지 않으므로
 * 금액 대조·멱등 처리를 위해 주문은 반드시 서버 저장소에 둔다.
 *
 * 목업: 인스턴스 메모리(로컬 `next dev` 전용). 서버리스 다중 인스턴스에서는 동작하지 않는다.
 * 운영: docs/schema.sql 의 Postgres 구현으로 교체. transition 은
 *   UPDATE orders SET status=$to, ... WHERE id=$id AND status = ANY($from) RETURNING *
 * 로 원자적 상태 전이(CAS)를 보장해야 한다.
 */
export interface OrderRepository {
  create(order: Order): Promise<void>
  get(id: string): Promise<Order | null>
  /** 현재 상태가 from 중 하나일 때만 to 로 바꾼다. 경합에서 진 쪽은 null */
  transition(id: string, from: readonly OrderStatus[], to: OrderStatus, patch?: Partial<Order>): Promise<Order | null>
  /**
   * READY → APPROVING. 같은 초안에 결제가 성립했거나 성립했을 수 있는 다른 주문이 있으면
   * DUPLICATE_BLOCKED 로 보내고 null (운영: draft_id 부분 유니크 인덱스로 보장)
   */
  claimForApproval(id: string, patch: Partial<Order>): Promise<Order | null>
  appendEvent(e: OrderEvent): Promise<void>
  /** 같은 초안의 주문 중 결제가 성립했거나 성립했을 수 있는 최신 건 */
  findChargedByDraft(draftId: string): Promise<Order | null>
}

class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>()
  private readonly events: OrderEvent[] = []

  async create(order: Order) {
    if (this.orders.has(order.id)) throw new Error('duplicate order id')
    this.orders.set(order.id, { ...order })
  }

  async get(id: string) {
    const o = this.orders.get(id)
    return o ? { ...o } : null
  }

  // JS 단일 스레드에서 await 없이 읽고-쓰므로 원자적
  async transition(id: string, from: readonly OrderStatus[], to: OrderStatus, patch: Partial<Order> = {}) {
    const o = this.orders.get(id)
    if (!o || !from.includes(o.status)) return null
    const next: Order = { ...o, ...patch, id: o.id, status: to, updatedAt: Date.now() }
    this.orders.set(id, next)
    this.events.push({ orderId: id, at: next.updatedAt, type: 'transition', from: o.status, to })
    return { ...next }
  }

  async claimForApproval(id: string, patch: Partial<Order>) {
    const o = this.orders.get(id)
    if (!o || o.status !== 'READY') return null
    const conflict = [...this.orders.values()].some(
      (x) => x.id !== id && x.draftId === o.draftId && CHARGED_OR_MAYBE.includes(x.status),
    )
    if (conflict) {
      await this.transition(id, ['READY'], 'DUPLICATE_BLOCKED', patch)
      return null
    }
    return this.transition(id, ['READY'], 'APPROVING', { ...patch, approvingAt: Date.now() })
  }

  async findChargedByDraft(draftId: string) {
    const hits = [...this.orders.values()].filter((x) => x.draftId === draftId && CHARGED_OR_MAYBE.includes(x.status))
    const latest = hits.sort((a, b) => b.createdAt - a.createdAt)[0]
    return latest ? { ...latest } : null
  }

  async appendEvent(e: OrderEvent) {
    this.events.push(e)
    if (this.events.length > 5000) this.events.splice(0, 1000)
  }
}

const g = globalThis as typeof globalThis & { __orderRepo?: OrderRepository }
export const orderRepo: OrderRepository = (g.__orderRepo ??= new InMemoryOrderRepository())
