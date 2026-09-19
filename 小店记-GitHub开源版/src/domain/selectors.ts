import { daysUntil } from './dates';
import type { Batch, Product, Quote, ShopState } from './types';

export function stockOf(state: ShopState, productId: string): number {
  return state.batches.reduce((sum, batch) => batch.productId === productId ? sum + batch.remaining : sum, 0);
}

export function latestQuotes(state: ShopState, productId: string): Quote[] {
  const newest = new Map<string, Quote>();
  for (const quote of state.quotes) {
    if (quote.productId !== productId) continue;
    const previous = newest.get(quote.supplierId);
    if (!previous || quote.date >= previous.date) {
      newest.set(quote.supplierId, quote);
    }
  }
  return [...newest.values()].sort((left, right) => {
    const leftCost = BigInt(left.priceCents) * BigInt(right.packSize);
    const rightCost = BigInt(right.priceCents) * BigInt(left.packSize);
    return (leftCost < rightCost ? -1 : leftCost > rightCost ? 1 : 0) || left.supplierId.localeCompare(right.supplierId);
  });
}

export function replenishment(state: ShopState): Array<{ product: Product; stock: number; needed: number; lastChecked: string | null }> {
  return state.products
    .filter((product) => product.active)
    .map((product) => {
      const batches = state.batches.filter((batch) => batch.productId === product.id);
      const stock = batches.reduce((sum, batch) => sum + batch.remaining, 0);
      const remaining = batches.filter(batch => batch.remaining > 0);
      const lastChecked = remaining.length
        ? remaining.reduce<string | null>((oldest, batch) => !oldest || batch.checkedAt < oldest ? batch.checkedAt : oldest, null)
        : batches.reduce<string | null>((latest, batch) => !latest || batch.checkedAt > latest ? batch.checkedAt : latest, null);
      return { product, stock, needed: Math.max(0, product.targetStock - stock), lastChecked };
    })
    .filter(({ product, stock, needed }) => stock <= product.minStock && needed > 0);
}

export function expiryList(state: ShopState, from?: string): Array<{ batch: Batch; product: Product; days: number }> {
  const products = new Map(state.products.map((product) => [product.id, product]));
  return state.batches
    .filter((batch) => batch.remaining > 0 && batch.expiryDate !== null)
    .map((batch) => ({ batch, product: products.get(batch.productId), days: daysUntil(batch.expiryDate!, from) }))
    .filter((item): item is { batch: Batch; product: Product; days: number } => Boolean(item.product) && item.days <= state.settings.reminderDays)
    .sort((left, right) => left.days - right.days || left.batch.id.localeCompare(right.batch.id));
}
