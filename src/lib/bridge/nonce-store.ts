/**
 * 재전송(replay) 방지용 nonce 저장소.
 * 목업은 인스턴스 메모리라 서버리스 다중 인스턴스에서는 완전하지 않다.
 * 운영: Redis `SET bridge:nonce:{partner}:{nonce} 1 NX EX 600` 으로 교체.
 */
export interface NonceStore {
  /** 처음 보는 nonce 면 true, 이미 쓰였으면 false */
  consume(key: string, ttlSec: number): Promise<boolean>
}

class InMemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>()

  async consume(key: string, ttlSec: number): Promise<boolean> {
    const now = Date.now()
    if (this.seen.size > 10_000) {
      for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k)
    }
    const exp = this.seen.get(key)
    if (exp !== undefined && exp > now) return false
    this.seen.set(key, now + ttlSec * 1000)
    return true
  }
}

const g = globalThis as typeof globalThis & { __bridgeNonceStore?: NonceStore }
export const nonceStore: NonceStore = (g.__bridgeNonceStore ??= new InMemoryNonceStore())
