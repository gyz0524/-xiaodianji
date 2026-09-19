export type Category = '饮料' | '食品' | '日用品' | '烟酒' | '其他';
export type BatchStatus = '正常' | '优先销售' | '打折处理' | '已售完' | '已退货' | '已下架';
export interface Product { id: string; name: string; spec: string; category: Category; unit: string; packSize: number; minStock: number; targetStock: number; active: boolean; createdAt: string }
export interface Supplier { id: string; name: string; contact: string; phone: string; wechat: string; note: string }
export interface Quote { id: string; productId: string; supplierId: string; priceCents: number; packSize: number; date: string }
export interface Batch { id: string; productId: string; supplierId: string | null; remaining: number; receivedDate: string; productionDate: string | null; expiryDate: string | null; checkedAt: string; status: BatchStatus; note: string }
export interface Purchase { id: string; productId: string; supplierId: string; batchId: string; quantity: number; totalCents: number; date: string; productName: string; supplierName: string; unit: string; note: string }
export interface Audit { id: string; at: string; action: string; detail: string }
export interface ShopState { schemaVersion: 1; revision: number; updatedAt: string; settings: { shopName: string; reminderDays: number }; products: Product[]; suppliers: Supplier[]; quotes: Quote[]; batches: Batch[]; purchases: Purchase[]; audit: Audit[]; appliedOperations: string[] }
export type Operation = { id: string; at: string } & (
  | { type: 'product'; product: Product }
  | { type: 'supplier'; supplier: Supplier }
  | { type: 'quote'; quote: Quote }
  | { type: 'receive'; productId: string; supplierId: string; quantity: number; totalCents: number; date: string; productionDate: string | null; expiryDate: string | null; note: string }
  | { type: 'batch'; batch: Batch }
  | { type: 'count'; batchId: string; remaining: number; note: string }
  | { type: 'status'; batchId: string; status: BatchStatus; note: string }
  | { type: 'settings'; shopName: string; reminderDays: number }
);
export interface BackupMeta { confirmedRevision: number; confirmedAt: string | null }
export interface StoredShop { state: ShopState; backup: BackupMeta; recovery: ShopState | null }
