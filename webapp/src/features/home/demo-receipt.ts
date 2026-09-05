import type { DemoChallenge, DemoReceipt } from '@pyaterochka-game-demo/contracts'

/**
 * Синтетические тестовые чеки демонстрации. Ни один из них не является фискальным документом:
 * они существуют, чтобы показать квалификацию, отказ и повтор на одном экране.
 */

export type DemoReceiptKind = 'qualifying' | 'free_line' | 'wrong_category' | 'late' | 'returned'

const DAY_MS = 86_400_000
const DEMO_STORE_ID = 'store-demo-local'

export const DEMO_RECEIPT_LABELS: Record<DemoReceiptKind, string> = {
  qualifying: 'Оплаченная покупка нужной категории',
  free_line: 'Только бесплатная строка',
  wrong_category: 'Покупка другой категории',
  late: 'Покупка после срока',
  returned: 'Покупка с возвратом',
}

export function buildDemoReceipt(
  kind: DemoReceiptKind,
  challenge: DemoChallenge,
  nowMs: number,
  receiptId: string,
): DemoReceipt {
  const target = challenge.target
  const skuId = target.sku_ids[0] ?? `sku-${target.category}`
  const base = {
    receipt_id: receiptId,
    purchased_at_ms: nowMs,
    store_id: DEMO_STORE_ID,
    returned: false,
  }

  const paidLine = {
    sku_id: skuId,
    category: target.category,
    quantity: target.quantity,
    paid: true,
    amount_kopecks: 9900,
  }
  const freeLine = {
    sku_id: 'sku-demo-tasting',
    category: target.category,
    quantity: 1,
    paid: false,
    amount_kopecks: 0,
  }

  switch (kind) {
    case 'qualifying':
      return { ...base, lines: [paidLine, freeLine] }
    case 'free_line':
      return { ...base, lines: [freeLine] }
    case 'wrong_category':
      return {
        ...base,
        lines: [{ ...paidLine, sku_id: 'sku-demo-other', category: 'Снеки и орехи' }],
      }
    case 'late':
      return {
        ...base,
        purchased_at_ms: target.deadline_ms + DAY_MS,
        lines: [paidLine],
      }
    case 'returned':
      return { ...base, returned: true, lines: [paidLine] }
  }
}
