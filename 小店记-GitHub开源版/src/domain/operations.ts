import { today } from './dates';
import { validateOperation, validateState } from './schema';
import type { Audit, Batch, Operation, Quote, ShopState } from './types';

const closedStatuses = new Set(['已售完', '已退货', '已下架']);

export function emptyState(now = new Date().toISOString()): ShopState {
  return validateState({
    schemaVersion: 1,
    revision: 0,
    updatedAt: now,
    settings: { shopName: '我的小店', reminderDays: 30 },
    products: [], suppliers: [], quotes: [], batches: [], purchases: [], audit: [], appliedOperations: [],
  });
}

function replaceById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return [...items, item];
  return items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
}

function findRequired<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`${label}不存在：${id}`);
  return item;
}

function auditFor(operation: Operation, action: string, detail: string): Audit {
  return { id: `audit:${operation.id}`, at: operation.at, action, detail: detail.slice(0, 2000) };
}

function changes(before: object | undefined, after: object, labels: Record<string, string>): string {
  const old = (before ?? {}) as Record<string, unknown>; const next = after as Record<string, unknown>;
  return Object.entries(labels).filter(([key]) => old[key] !== next[key]).map(([key,label]) => `${label}：${String(old[key] ?? '未填')} → ${String(next[key] ?? '未填')}`).join('；');
}

export function applyOperation(state: ShopState, input: Operation): ShopState {
  validateState(state);
  const operation = validateOperation(input);
  if (state.appliedOperations.includes(operation.id)) return state;

  let next: ShopState = { ...state };
  let audit: Audit;

  switch (operation.type) {
    case 'product': {
      const previous = state.products.find((item) => item.id === operation.product.id);
      if (previous) {
        if (previous.createdAt !== operation.product.createdAt) throw new Error('商品建档时间不能修改');
        const hasHistory = state.quotes.some((item) => item.productId === previous.id)
          || state.batches.some((item) => item.productId === previous.id)
          || state.purchases.some((item) => item.productId === previous.id);
        if (hasHistory && (previous.unit !== operation.product.unit || previous.packSize !== operation.product.packSize)) {
          throw new Error('已有历史记录的商品不能修改计数单位或每箱数量');
        }
        const stock = state.batches.reduce((sum, item) => item.productId === previous.id ? sum + item.remaining : sum, 0);
        if (!operation.product.active && stock > 0) throw new Error('有库存的商品不能停用');
      }
      next.products = replaceById(state.products, operation.product);
      audit = auditFor(operation, previous ? '修改商品' : '新建商品', `${operation.product.name}；${changes(previous, operation.product, {name:'名称',spec:'规格',category:'类别',unit:'计数单位',packSize:'每箱数量',minStock:'补货下限',targetStock:'补货目标',active:'启用'})}`);
      break;
    }
    case 'supplier': {
      const previous = state.suppliers.find((item) => item.id === operation.supplier.id);
      next.suppliers = replaceById(state.suppliers, operation.supplier);
      audit = auditFor(operation, previous ? '修改供应商' : '新建供应商', `${operation.supplier.name}；${changes(previous, operation.supplier, {name:'名称',contact:'联系人',phone:'电话',wechat:'微信',note:'备注'})}`);
      break;
    }
    case 'quote': {
      findRequired(state.products, operation.quote.productId, '商品');
      findRequired(state.suppliers, operation.quote.supplierId, '供应商');
      next.quotes = replaceById(state.quotes, operation.quote);
      audit = auditFor(operation, '记录报价', `${state.products.find(p=>p.id===operation.quote.productId)!.name} · ${state.suppliers.find(s=>s.id===operation.quote.supplierId)!.name}：¥${(operation.quote.priceCents/100).toFixed(2)} / ${operation.quote.packSize}件；${operation.quote.date}`);
      break;
    }
    case 'receive': {
      const product = findRequired(state.products, operation.productId, '商品');
      const supplier = findRequired(state.suppliers, operation.supplierId, '供应商');
      const operationDay = today();
      if (operation.date > operationDay || (operation.productionDate && operation.productionDate > operationDay)) {
        throw new Error('到货日和生产日期不能在未来');
      }
      if (operation.productionDate && operation.expiryDate && operation.expiryDate < operation.productionDate) {
        throw new Error('到期日不能早于生产日期');
      }
      if (operation.expiryDate && operation.expiryDate < operationDay) throw new Error('已过期商品不能按正常到货录入');
      const batchId = `batch:${operation.id}`;
      const batch: Batch = {
        id: batchId, productId: product.id, supplierId: supplier.id, remaining: operation.quantity,
        receivedDate: operation.date, productionDate: operation.productionDate, expiryDate: operation.expiryDate,
        checkedAt: operation.at, status: '正常', note: operation.note,
      };
      const quote: Quote = {
        id: `quote:${operation.id}`, productId: product.id, supplierId: supplier.id,
        priceCents: operation.totalCents, packSize: operation.quantity, date: operation.date,
      };
      next.batches = [...state.batches, batch];
      next.quotes = [...state.quotes, quote];
      next.purchases = [...state.purchases, {
        id: `purchase:${operation.id}`, productId: product.id, supplierId: supplier.id, batchId,
        quantity: operation.quantity, totalCents: operation.totalCents, date: operation.date,
        productName: product.name, supplierName: supplier.name, unit: product.unit, note: operation.note,
      }];
      audit = auditFor(operation, '记录到货', `${product.name} · ${supplier.name}；增加 ${operation.quantity}${product.unit}；总额 ¥${(operation.totalCents/100).toFixed(2)}；到期 ${operation.expiryDate ?? '未登记'}；${operation.note}`);
      break;
    }
    case 'batch': {
      findRequired(state.products, operation.batch.productId, '商品');
      if (operation.batch.supplierId) findRequired(state.suppliers, operation.batch.supplierId, '供应商');
      const previous = state.batches.find((item) => item.id === operation.batch.id);
      next.batches = replaceById(state.batches, operation.batch);
      audit = auditFor(operation, '保存批次', `${state.products.find(p=>p.id===operation.batch.productId)!.name}；` + (previous
        ? `库存 ${previous.remaining} → ${operation.batch.remaining}，状态 ${previous.status} → ${operation.batch.status}，到期日 ${previous.expiryDate ?? '未登记'} → ${operation.batch.expiryDate ?? '未登记'}`
        : `登记库存 ${operation.batch.remaining}，到期日 ${operation.batch.expiryDate ?? '未登记'}`) + `；${operation.batch.note}`);
      break;
    }
    case 'count': {
      const batch = findRequired(state.batches, operation.batchId, '批次');
      const status = operation.remaining === 0 ? '已售完' : closedStatuses.has(batch.status) ? '正常' : batch.status;
      next.batches = replaceById(state.batches, { ...batch, remaining: operation.remaining, checkedAt: operation.at, status, note: operation.note });
      audit = auditFor(operation, '盘点库存', `${state.products.find(p=>p.id===batch.productId)!.name}；库存 ${batch.remaining} → ${operation.remaining}；${operation.note}`);
      break;
    }
    case 'status': {
      const batch = findRequired(state.batches, operation.batchId, '批次');
      const operationDay = today();
      if (batch.expiryDate && batch.expiryDate < operationDay && !closedStatuses.has(operation.status)) {
        throw new Error('过期批次只能下架，不能继续销售');
      }
      next.batches = replaceById(state.batches, {
        ...batch, status: operation.status, remaining: closedStatuses.has(operation.status) ? 0 : batch.remaining,
        checkedAt: closedStatuses.has(operation.status) ? operation.at : batch.checkedAt, note: operation.note,
      });
      audit = auditFor(operation, '处理批次', `${state.products.find(p=>p.id===batch.productId)!.name}；${batch.status} → ${operation.status}；库存 ${batch.remaining} → ${closedStatuses.has(operation.status)?0:batch.remaining}；${operation.note}`);
      break;
    }
    case 'settings':
      next.settings = { shopName: operation.shopName, reminderDays: operation.reminderDays };
      audit = auditFor(operation, '修改设置', changes(state.settings, next.settings, {shopName:'小店名称',reminderDays:'提醒天数'}));
      break;
    default:
      throw new Error('不支持的操作');
  }

  next = {
    ...next,
    revision: state.revision + 1,
    updatedAt: operation.at,
    audit: [...state.audit, audit],
    appliedOperations: [...state.appliedOperations, operation.id],
  };
  return validateState(next);
}
