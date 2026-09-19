import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createBackup, parseBackup } from '../src/domain/backup';
import { addShelfLife, daysUntil } from '../src/domain/dates';
import { applyOperation, emptyState } from '../src/domain/operations';
import { validateState } from '../src/domain/schema';
import { expiryList, latestQuotes, replenishment, stockOf } from '../src/domain/selectors';
import type { Operation, Product, ShopState, Supplier } from '../src/domain/types';

const at = '2026-09-18T10:00:00.000Z';
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(at)); });
afterEach(() => vi.useRealTimers());
const product: Product = {
  id: 'product-water', name: '矿泉水', spec: '550ml', category: '饮料', unit: '瓶',
  packSize: 24, minStock: 6, targetStock: 24, active: true, createdAt: at,
};
const supplierA: Supplier = { id: 'supplier-a', name: '甲供货商', contact: '老王', phone: '1', wechat: '', note: '' };
const supplierB: Supplier = { id: 'supplier-b', name: '乙供货商', contact: '小李', phone: '2', wechat: '', note: '' };

function populatedState(): ShopState {
  let state = emptyState(at);
  state = applyOperation(state, { id: 'op-product', at, type: 'product', product });
  state = applyOperation(state, { id: 'op-supplier-a', at, type: 'supplier', supplier: supplierA });
  return applyOperation(state, { id: 'op-supplier-b', at, type: 'supplier', supplier: supplierB });
}

describe('calendar dates', () => {
  it('clamps month and year shelf life to the final valid calendar day', () => {
    expect(addShelfLife('2024-01-31', 1, 'months')).toBe('2024-02-29');
    expect(addShelfLife('2024-02-29', 1, 'years')).toBe('2025-02-28');
    expect(addShelfLife('2026-09-18', 10, 'days')).toBe('2026-09-28');
  });

  it('counts local calendar days without time-zone or daylight-saving drift', () => {
    expect(daysUntil('2026-03-09', '2026-03-07')).toBe(2);
    expect(daysUntil('2026-03-06', '2026-03-07')).toBe(-1);
  });

  it('rejects impossible dates and unsafe shelf-life amounts', () => {
    expect(() => daysUntil('2026-02-30', '2026-02-01')).toThrow();
    expect(() => addShelfLife('2026-01-01', -1, 'days')).toThrow();
  });
});

describe('validated operations', () => {
  it.each(['优先销售', '打折处理', '正常'] as const)('keeps the actual stock count date when only marking %s', (status) => {
    const state = validateState({
      ...populatedState(),
      batches: [{ id: 'old-count', productId: product.id, supplierId: null, remaining: 4,
        receivedDate: '2026-09-01', productionDate: null, expiryDate: '2026-09-21',
        checkedAt: '2026-09-09T09:00:00.000Z', status: '正常', note: '' }],
    });
    const marked = applyOperation(state, { id: 'mark', at, type: 'status', batchId: 'old-count', status, note: '调整摆放' });
    expect(stockOf(marked, product.id)).toBe(4);
    expect(replenishment(marked)[0].lastChecked).toBe('2026-09-09T09:00:00.000Z');
  });

  it('records a receipt atomically and ignores a repeated operation id', () => {
    const state = populatedState();
    const operation: Operation = {
      id: 'receive-1', at, type: 'receive', productId: product.id, supplierId: supplierA.id,
      quantity: 48, totalCents: 9600, date: '2026-09-18', productionDate: '2026-09-01',
      expiryDate: '2027-09-01', note: '2箱',
    };

    const received = applyOperation(state, operation);
    const repeated = applyOperation(received, operation);

    expect(stockOf(received, product.id)).toBe(48);
    expect(received.batches).toHaveLength(1);
    expect(received.purchases).toHaveLength(1);
    expect(received.quotes).toHaveLength(1);
    expect(received.revision).toBe(state.revision + 1);
    expect(repeated).toBe(received);
    expect(stockOf(repeated, product.id)).toBe(48);
  });

  it('keeps historic purchase snapshots when product and supplier names change', () => {
    const received = applyOperation(populatedState(), {
      id: 'receive-1', at, type: 'receive', productId: product.id, supplierId: supplierA.id,
      quantity: 24, totalCents: 4800, date: '2026-09-18', productionDate: null,
      expiryDate: '2027-09-18', note: '',
    });
    const renamed = applyOperation(received, {
      id: 'rename-product', at: '2026-09-18T11:00:00.000Z', type: 'product',
      product: { ...product, name: '山泉水' },
    });

    expect(renamed.products[0].name).toBe('山泉水');
    expect(renamed.purchases[0].productName).toBe('矿泉水');
  });

  it('rejects unsafe historic unit edits, stocked product deactivation, and expired receipts', () => {
    const received = applyOperation(populatedState(), {
      id: 'receive-1', at, type: 'receive', productId: product.id, supplierId: supplierA.id,
      quantity: 24, totalCents: 4800, date: '2026-09-18', productionDate: null,
      expiryDate: '2027-09-18', note: '',
    });

    expect(() => applyOperation(received, {
      id: 'unit-edit', at, type: 'product', product: { ...product, unit: '箱' },
    })).toThrow();
    expect(() => applyOperation(received, {
      id: 'deactivate', at, type: 'product', product: { ...product, active: false },
    })).toThrow();
    expect(() => applyOperation(populatedState(), {
      id: 'expired', at, type: 'receive', productId: product.id, supplierId: supplierA.id,
      quantity: 1, totalCents: 100, date: '2026-09-18', productionDate: '2026-08-01',
      expiryDate: '2026-09-17', note: '',
    })).toThrow();
  });

  it('zeroes closed batches and blocks discounting an expired batch', () => {
    const received = validateState({
      ...populatedState(),
      batches: [{ id: 'expired-batch', productId: product.id, supplierId: supplierA.id, remaining: 5,
        receivedDate: '2026-09-10', productionDate: null, expiryDate: '2026-09-17', checkedAt: at,
        status: '正常', note: '' }],
    });
    const batchId = received.batches[0].id;

    expect(() => applyOperation(received, {
      id: 'discount', at, type: 'status', batchId, status: '打折处理', note: '',
    })).toThrow();
    expect(() => applyOperation(received, {
      id: 'sell-normally', at, type: 'status', batchId, status: '正常', note: '',
    })).toThrow();
    const removed = applyOperation(received, {
      id: 'remove', at, type: 'status', batchId, status: '已下架', note: '过期下架',
    });
    expect(removed.batches[0].remaining).toBe(0);
    expect(stockOf(removed, product.id)).toBe(0);
  });
});

describe('state validation and selectors', () => {
  it('uses the last entered quote when two quotes have the same date', () => {
    const state = populatedState();
    state.quotes = [
      { id: 'z-old', productId: product.id, supplierId: supplierA.id, priceCents: 5000, packSize: 24, date: '2026-09-18' },
      { id: 'a-new', productId: product.id, supplierId: supplierA.id, priceCents: 4800, packSize: 24, date: '2026-09-18' },
    ];
    expect(latestQuotes(state, product.id)[0].id).toBe('a-new');
  });

  it('does not hide an old unchecked batch behind a new receipt or suggest zero units', () => {
    const state = populatedState();
    state.batches = [
      { id: 'old', productId: product.id, supplierId: null, remaining: 2, receivedDate: '2026-09-01', productionDate: null, expiryDate: null, checkedAt: '2026-09-01T09:00:00.000Z', status: '正常', note: '' },
      { id: 'new', productId: product.id, supplierId: null, remaining: 2, receivedDate: '2026-09-18', productionDate: null, expiryDate: null, checkedAt: at, status: '正常', note: '' },
    ];
    expect(replenishment(state)[0].lastChecked).toBe('2026-09-01T09:00:00.000Z');
    state.products[0] = { ...state.products[0], minStock: 4, targetStock: 4 };
    expect(replenishment(state)).toEqual([]);
  });

  it('keeps previous rule values and contact data in readable audit records', () => {
    const original = populatedState();
    const edited = applyOperation(original, { id: 'edit-rules', at, type: 'product', product: { ...product, minStock: 10 } });
    expect(edited.audit.at(-1)?.detail).toContain('6');
    expect(edited.audit.at(-1)?.detail).toContain('10');
    const supplierEdit = applyOperation(edited, { id: 'edit-phone', at, type: 'supplier', supplier: { ...supplierA, phone: '12345678' } });
    expect(supplierEdit.audit.at(-1)?.detail).toContain('12345678');
  });
  it('rejects duplicate ids, orphaned references, invalid settings, and inconsistent closed batches', () => {
    const state = populatedState();
    expect(() => validateState({ ...state, products: [product, product] })).toThrow();
    expect(() => validateState({
      ...state,
      quotes: [{ id: 'q', productId: 'missing', supplierId: supplierA.id, priceCents: 100, packSize: 1, date: '2026-09-18' }],
    })).toThrow();
    expect(() => validateState({ ...state, settings: { shopName: '', reminderDays: 13 } })).toThrow();
    expect(() => validateState({
      ...state,
      batches: [{ id: 'b', productId: product.id, supplierId: null, remaining: 2, receivedDate: '2026-09-18', productionDate: null, expiryDate: null, checkedAt: at, status: '已售完', note: '' }],
    })).toThrow();
    expect(() => validateState({
      ...state,
      quotes: [{ id: 'free', productId: product.id, supplierId: supplierA.id, priceCents: 0, packSize: 1, date: '2026-09-18' }],
    })).toThrow();
  });

  it('selects the newest quote per supplier and sorts by integer unit price', () => {
    const base = populatedState();
    const state = validateState({
      ...base,
      quotes: [
        { id: 'a-old', productId: product.id, supplierId: supplierA.id, priceCents: 4800, packSize: 24, date: '2026-09-01' },
        { id: 'a-new', productId: product.id, supplierId: supplierA.id, priceCents: 5000, packSize: 24, date: '2026-09-15' },
        { id: 'b-new', productId: product.id, supplierId: supplierB.id, priceCents: 1950, packSize: 10, date: '2026-09-14' },
      ],
    });

    expect(latestQuotes(state, product.id).map((quote) => quote.id)).toEqual(['b-new', 'a-new']);
  });

  it('calculates replenishment at the threshold and reports the latest count date', () => {
    const state = validateState({
      ...populatedState(),
      batches: [{ id: 'b', productId: product.id, supplierId: null, remaining: 4, receivedDate: '2026-09-01', productionDate: null, expiryDate: null, checkedAt: '2026-09-12T09:00:00.000Z', status: '正常', note: '' }],
    });

    expect(replenishment(state)).toEqual([{ product, stock: 4, needed: 20, lastChecked: '2026-09-12T09:00:00.000Z' }]);
  });

  it('lists active dated batches by nearest expiry within the reminder window', () => {
    const state = validateState({
      ...populatedState(),
      batches: [
        { id: 'later', productId: product.id, supplierId: null, remaining: 2, receivedDate: '2026-09-01', productionDate: null, expiryDate: '2026-10-08', checkedAt: at, status: '正常', note: '' },
        { id: 'unknown', productId: product.id, supplierId: null, remaining: 2, receivedDate: '2026-09-01', productionDate: null, expiryDate: null, checkedAt: at, status: '正常', note: '' },
        { id: 'soon', productId: product.id, supplierId: null, remaining: 2, receivedDate: '2026-09-01', productionDate: null, expiryDate: '2026-09-21', checkedAt: at, status: '正常', note: '' },
      ],
    });

    expect(expiryList(state, '2026-09-18').map(({ batch, days }) => [batch.id, days])).toEqual([['soon', 3], ['later', 20]]);
  });
});

describe('portable backups', () => {
  it('round-trips a strictly validated checksummed state', async () => {
    const state = populatedState();
    const text = await createBackup(state);
    const parsed = await parseBackup(text);

    expect(parsed.state).toEqual(state);
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses the standard SHA-256 digest over the backup content', async () => {
    const envelope = JSON.parse(await createBackup(populatedState())) as {
      app: string; schemaVersion: number; exportedAt: string; state: ShopState; checksum: string;
    };
    const content = JSON.stringify({ app: envelope.app, schemaVersion: envelope.schemaVersion, exportedAt: envelope.exportedAt, state: envelope.state });
    expect(envelope.checksum).toBe(createHash('sha256').update(content).digest('hex'));
  });

  it('rejects tampering, unknown envelope fields, and oversized input', async () => {
    const valid = JSON.parse(await createBackup(populatedState())) as Record<string, unknown>;
    const tampered = JSON.stringify({ ...valid, exportedAt: '2025-01-01T00:00:00.000Z' });
    await expect(parseBackup(tampered)).rejects.toThrow();
    await expect(parseBackup(JSON.stringify({ ...valid, extra: true }))).rejects.toThrow();
    await expect(parseBackup(' '.repeat(20 * 1024 * 1024 + 1))).rejects.toThrow();
  });
});
