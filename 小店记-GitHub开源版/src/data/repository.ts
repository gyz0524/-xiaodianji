import { openDB } from 'idb';
import { emptyState } from '../domain/operations';
import { validateState, validateStoredShop } from '../domain/schema';
import type { ShopState, StoredShop } from '../domain/types';

const DB_NAME = 'xiaodianji-v1';
const STORE_NAME = 'shop';
const RECORD_KEY = 'current';

async function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    },
  });
}

function initialStored(): StoredShop {
  return { state: emptyState(), backup: { confirmedRevision: 0, confirmedAt: null }, recovery: null };
}

async function currentIn(store: { get(key: string): Promise<unknown>; put(value: StoredShop, key: string): Promise<unknown> }): Promise<StoredShop> {
  const value = await store.get(RECORD_KEY);
  if (value) return validateStoredShop(value);
  const initial = initialStored();
  await store.put(initial, RECORD_KEY);
  return initial;
}

async function update(mutator: (current: StoredShop) => StoredShop): Promise<StoredShop> {
  const db = await database();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const current = await currentIn(transaction.store);
    const next = validateStoredShop(mutator(current));
    await transaction.store.put(next, RECORD_KEY);
    await transaction.done;
    return next;
  } finally {
    db.close();
  }
}

function assertRevision(current: StoredShop, expectedRevision: number): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('版本号无效');
  if (current.state.revision !== expectedRevision) throw new Error('数据已在另一个页面更新，请刷新后重试');
}

export async function loadShop(): Promise<StoredShop> {
  const db = await database();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const current = await currentIn(transaction.store);
    await transaction.done;
    return current;
  } finally {
    db.close();
  }
}

export async function commitShop(expectedRevision: number, input: ShopState): Promise<StoredShop> {
  const state = validateState(input);
  return update((current) => {
    assertRevision(current, expectedRevision);
    if (state.revision !== expectedRevision + 1) throw new Error('待保存数据的版本号不连续');
    return { ...current, state };
  });
}

export async function restoreShop(expectedRevision: number, input: ShopState): Promise<StoredShop> {
  const imported = validateState(input);
  const restoredAt = new Date().toISOString();
  return update((current) => {
    assertRevision(current, expectedRevision);
    const state = validateState({ ...imported, revision: current.state.revision + 1, updatedAt: restoredAt });
    return { state, backup: current.backup, recovery: current.state };
  });
}

export async function rollbackShop(expectedRevision: number): Promise<StoredShop> {
  const rolledBackAt = new Date().toISOString();
  return update((current) => {
    assertRevision(current, expectedRevision);
    if (!current.recovery) throw new Error('没有可恢复的导入前数据');
    const state = validateState({ ...current.recovery, revision: current.state.revision + 1, updatedAt: rolledBackAt });
    return { state, backup: current.backup, recovery: null };
  });
}

export async function confirmBackup(revision: number): Promise<StoredShop> {
  const confirmedAt = new Date().toISOString();
  return update((current) => {
    if (!Number.isSafeInteger(revision) || revision < current.backup.confirmedRevision || revision > current.state.revision) {
      throw new Error('不能确认这个备份版本');
    }
    return { ...current, backup: { confirmedRevision: revision, confirmedAt } };
  });
}
