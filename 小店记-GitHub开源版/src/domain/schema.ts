import { z } from 'zod';
import { isCalendarDate, today } from './dates';
import type { Operation, ShopState, StoredShop } from './types';

const id = z.string().min(1).max(200).refine((value) => value.trim().length > 0, 'ID不能为空');
const text = (max: number) => z.string().max(max);
const requiredText = (max: number) => text(max).refine((value) => value.trim().length > 0, '内容不能为空');
const nonNegativeInteger = z.number().int().safe().min(0);
const positiveInteger = z.number().int().safe().positive();
const positiveCents = z.number().int().safe().positive();
const date = z.string().refine(isCalendarDate, '日期无效');
const dateTime = z.string().datetime({ offset: true });

export const ProductSchema = z.object({
  id,
  name: requiredText(100),
  spec: text(100),
  category: z.enum(['饮料', '食品', '日用品', '烟酒', '其他']),
  unit: requiredText(20),
  packSize: positiveInteger,
  minStock: nonNegativeInteger,
  targetStock: nonNegativeInteger,
  active: z.boolean(),
  createdAt: dateTime,
}).strict().superRefine((product, context) => {
  if (product.targetStock < product.minStock) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetStock'], message: '目标库存不能低于补货下限' });
  }
});

export const SupplierSchema = z.object({
  id,
  name: requiredText(100),
  contact: text(100),
  phone: text(50),
  wechat: text(100),
  note: text(1000),
}).strict();

export const QuoteSchema = z.object({
  id,
  productId: id,
  supplierId: id,
  priceCents: positiveCents,
  packSize: positiveInteger,
  date,
}).strict();

export const BatchSchema = z.object({
  id,
  productId: id,
  supplierId: id.nullable(),
  remaining: nonNegativeInteger,
  receivedDate: date,
  productionDate: date.nullable(),
  expiryDate: date.nullable(),
  checkedAt: dateTime,
  status: z.enum(['正常', '优先销售', '打折处理', '已售完', '已退货', '已下架']),
  note: text(1000),
}).strict().superRefine((batch, context) => {
  if (batch.productionDate && batch.expiryDate && batch.expiryDate < batch.productionDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiryDate'], message: '到期日不能早于生产日期' });
  }
  if (batch.receivedDate > today()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['receivedDate'], message: '到货日不能在未来' });
  }
  if (batch.productionDate && batch.productionDate > today()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['productionDate'], message: '生产日期不能在未来' });
  }
  if (['已售完', '已退货', '已下架'].includes(batch.status) && batch.remaining !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['remaining'], message: '已结束批次的库存必须为零' });
  }
});

export const PurchaseSchema = z.object({
  id,
  productId: id,
  supplierId: id,
  batchId: id,
  quantity: positiveInteger,
  totalCents: positiveCents,
  date,
  productName: requiredText(100),
  supplierName: requiredText(100),
  unit: requiredText(20),
  note: text(1000),
}).strict();

export const AuditSchema = z.object({
  id,
  at: dateTime,
  action: requiredText(100),
  detail: text(2000),
}).strict();

const SettingsSchema = z.object({
  shopName: requiredText(100),
  reminderDays: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60), z.literal(90)]),
}).strict();

function duplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

export const ShopStateSchema = z.object({
  schemaVersion: z.literal(1),
  revision: nonNegativeInteger,
  updatedAt: dateTime,
  settings: SettingsSchema,
  products: z.array(ProductSchema).max(1000),
  suppliers: z.array(SupplierSchema).max(1000),
  quotes: z.array(QuoteSchema).max(100000),
  batches: z.array(BatchSchema).max(100000),
  purchases: z.array(PurchaseSchema).max(100000),
  audit: z.array(AuditSchema).max(100000),
  appliedOperations: z.array(id).max(100000),
}).strict().superRefine((state, context) => {
  const collections: Array<[string, string[]]> = [
    ['products', state.products.map((item) => item.id)],
    ['suppliers', state.suppliers.map((item) => item.id)],
    ['quotes', state.quotes.map((item) => item.id)],
    ['batches', state.batches.map((item) => item.id)],
    ['purchases', state.purchases.map((item) => item.id)],
    ['audit', state.audit.map((item) => item.id)],
    ['appliedOperations', state.appliedOperations],
  ];
  for (const [name, values] of collections) {
    const value = duplicate(values);
    if (value) context.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `ID重复：${value}` });
  }

  const productIds = new Set(state.products.map((item) => item.id));
  const supplierIds = new Set(state.suppliers.map((item) => item.id));
  const batches = new Map(state.batches.map((item) => [item.id, item]));
  for (const quote of state.quotes) {
    if (!productIds.has(quote.productId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['quotes'], message: `报价引用了不存在的商品：${quote.id}` });
    if (!supplierIds.has(quote.supplierId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['quotes'], message: `报价引用了不存在的供应商：${quote.id}` });
  }
  for (const batch of state.batches) {
    if (!productIds.has(batch.productId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['batches'], message: `批次引用了不存在的商品：${batch.id}` });
    if (batch.supplierId && !supplierIds.has(batch.supplierId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['batches'], message: `批次引用了不存在的供应商：${batch.id}` });
  }
  for (const purchase of state.purchases) {
    const batch = batches.get(purchase.batchId);
    if (!productIds.has(purchase.productId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['purchases'], message: `进货记录引用了不存在的商品：${purchase.id}` });
    if (!supplierIds.has(purchase.supplierId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['purchases'], message: `进货记录引用了不存在的供应商：${purchase.id}` });
    if (!batch || batch.productId !== purchase.productId || batch.supplierId !== purchase.supplierId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['purchases'], message: `进货记录与批次不一致：${purchase.id}` });
    }
  }
  for (const product of state.products) {
    const remaining = state.batches.reduce((sum, batch) => batch.productId === product.id ? sum + BigInt(batch.remaining) : sum, 0n);
    if (remaining > BigInt(Number.MAX_SAFE_INTEGER)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['batches'], message: `商品总库存超过安全整数范围：${product.id}` });
    }
    if (!product.active && remaining > 0n) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['products'], message: `有库存的商品不能停用：${product.id}` });
    }
  }
});

const operationBase = { id, at: dateTime };
export const OperationSchema = z.discriminatedUnion('type', [
  z.object({ ...operationBase, type: z.literal('product'), product: ProductSchema }).strict(),
  z.object({ ...operationBase, type: z.literal('supplier'), supplier: SupplierSchema }).strict(),
  z.object({ ...operationBase, type: z.literal('quote'), quote: QuoteSchema }).strict(),
  z.object({ ...operationBase, type: z.literal('receive'), productId: id, supplierId: id, quantity: positiveInteger, totalCents: positiveCents, date, productionDate: date.nullable(), expiryDate: date.nullable(), note: text(1000) }).strict(),
  z.object({ ...operationBase, type: z.literal('batch'), batch: BatchSchema }).strict(),
  z.object({ ...operationBase, type: z.literal('count'), batchId: id, remaining: nonNegativeInteger, note: text(1000) }).strict(),
  z.object({ ...operationBase, type: z.literal('status'), batchId: id, status: z.enum(['正常', '优先销售', '打折处理', '已售完', '已退货', '已下架']), note: text(1000) }).strict(),
  z.object({ ...operationBase, type: z.literal('settings'), shopName: requiredText(100), reminderDays: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60), z.literal(90)]) }).strict(),
]);

export const StoredShopSchema = z.object({
  state: ShopStateSchema,
  backup: z.object({ confirmedRevision: nonNegativeInteger, confirmedAt: dateTime.nullable() }).strict(),
  recovery: ShopStateSchema.nullable(),
}).strict().superRefine((stored, context) => {
  if (stored.backup.confirmedRevision > stored.state.revision) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['backup', 'confirmedRevision'], message: '备份版本不能超过当前版本' });
  }
});

export function validateState(input: unknown): ShopState {
  return ShopStateSchema.parse(input) as ShopState;
}

export function validateOperation(input: unknown): Operation {
  return OperationSchema.parse(input) as Operation;
}

export function validateStoredShop(input: unknown): StoredShop {
  return StoredShopSchema.parse(input) as StoredShop;
}
