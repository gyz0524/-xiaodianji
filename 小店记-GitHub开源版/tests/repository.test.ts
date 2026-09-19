import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { applyOperation, emptyState } from '../src/domain/operations';
import { commitShop, confirmBackup, loadShop, restoreShop, rollbackShop } from '../src/data/repository';
import type { Product } from '../src/domain/types';

const dbName = 'xiaodianji-v1';
const at = '2026-09-18T10:00:00.000Z';
const product: Product = {
  id: 'p', name: '盐', spec: '500克', category: '食品', unit: '袋', packSize: 20,
  minStock: 3, targetStock: 10, active: true, createdAt: at,
};

beforeEach(async () => deleteDB(dbName));
afterEach(async () => deleteDB(dbName));

describe('IndexedDB repository', () => {
  it('starts empty, commits a validated snapshot, and persists it across calls', async () => {
    const initial = await loadShop();
    const next = applyOperation(initial.state, { id: 'add-p', at, type: 'product', product });

    const saved = await commitShop(0, next);
    const reloaded = await loadShop();

    expect(saved.state.revision).toBe(1);
    expect(reloaded).toEqual(saved);
    expect(reloaded.state.products[0].name).toBe('盐');
  });

  it('allows only one writer to commit from the same old revision', async () => {
    const initial = await loadShop();
    const first = applyOperation(initial.state, { id: 'first', at, type: 'product', product });
    const second = applyOperation(initial.state, {
      id: 'second', at, type: 'settings', shopName: '另一页', reminderDays: 30,
    });

    const results = await Promise.allSettled([commitShop(0, first), commitShop(0, second)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await loadShop()).state.revision).toBe(1);
  });

  it('restores an import with a new local revision and can roll back to the pre-import state', async () => {
    const initial = await loadShop();
    const local = applyOperation(initial.state, { id: 'local-product', at, type: 'product', product });
    await commitShop(0, local);
    const imported = applyOperation(emptyState('2020-01-01T00:00:00.000Z'), {
      id: 'imported-setting', at: '2020-01-01T00:00:00.000Z', type: 'settings', shopName: '旧备份', reminderDays: 15,
    });

    const restored = await restoreShop(1, imported);
    expect(restored.state.revision).toBe(2);
    expect(restored.state.settings.shopName).toBe('旧备份');
    expect(restored.recovery?.products[0].name).toBe('盐');

    const rolledBack = await rollbackShop(2);
    expect(rolledBack.state.revision).toBe(3);
    expect(rolledBack.state.products[0].name).toBe('盐');
    expect(rolledBack.recovery).toBeNull();
  });

  it('confirms only the exported revision while later changes remain unbacked', async () => {
    const initial = await loadShop();
    const one = applyOperation(initial.state, { id: 'add-p', at, type: 'product', product });
    await commitShop(0, one);
    const two = applyOperation(one, { id: 'shop-name', at, type: 'settings', shopName: '国道小店', reminderDays: 30 });
    await commitShop(1, two);
    const three = applyOperation(two, { id: 'new-name', at, type: 'settings', shopName: '国道超市', reminderDays: 30 });
    await commitShop(2, three);

    const confirmed = await confirmBackup(2);
    expect(confirmed.state.revision).toBe(3);
    expect(confirmed.backup.confirmedRevision).toBe(2);
    expect(confirmed.backup.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not mutate stored data when validation or revision checks fail', async () => {
    await loadShop();
    await expect(commitShop(0, { ...emptyState(at), settings: { shopName: '', reminderDays: 13 } })).rejects.toThrow();
    await expect(confirmBackup(1)).rejects.toThrow();
    expect((await loadShop()).state.revision).toBe(0);
  });
});
