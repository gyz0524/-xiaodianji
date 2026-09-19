import type { ShopState } from '../domain/types';
import { emptyState } from '../domain/operations';
import { today, addShelfLife } from '../domain/dates';

export function demoState(): ShopState {
  const state = emptyState(); const date = today(); const at = new Date().toISOString();
  state.settings.shopName = '小店记';
  state.suppliers = [
    { id: 's1', name: '老张食品批发', contact: '张老板', phone: '', wechat: '', note: '示例供应商 · 周二、周五送货' },
    { id: 's2', name: '顺达商贸', contact: '李经理', phone: '', wechat: '', note: '示例供应商 · 饮料、日用品' },
  ];
  const rows = [
    ['p1', '农夫山泉', '550mL / 瓶', '饮料', '瓶', 24, 12, 48, 6, 2400, 150],
    ['p2', '伊利纯牛奶', '250mL / 盒', '饮料', '盒', 24, 12, 48, 18, 5280, 5],
    ['p3', '康师傅红烧牛肉面', '经典袋装 / 103g', '食品', '袋', 24, 12, 48, 8, 4800, 120],
    ['p4', '达利园软面包', '香橙味 / 360g', '食品', '袋', 12, 6, 24, 10, 6600, 12],
    ['p5', '可口可乐', '500mL / 瓶', '饮料', '瓶', 24, 12, 48, 4, 5040, 180],
    ['p6', '清风抽纸', '3层 / 3包', '日用品', '提', 12, 6, 24, 14, 8400, 600],
    ['p7', '双汇王中王火腿肠', '30g × 8支', '食品', '袋', 10, 5, 20, 9, 7200, 22],
    ['p8', '旺旺雪饼', '原味 / 84g', '食品', '袋', 20, 6, 20, 0, 5600, 90],
  ] as const;
  rows.forEach(([id, name, spec, category, unit, packSize, minStock, targetStock, remaining, price, expire], index) => {
    state.products.push({ id, name, spec, category, unit, packSize, minStock, targetStock, active: true, createdAt: at });
    state.batches.push({ id: `b${index}`, productId: id, supplierId: index % 2 ? 's1' : 's2', remaining, receivedDate: date, productionDate: null, expiryDate: addShelfLife(date, expire, 'days'), checkedAt: at, status: remaining ? '正常' : '已售完', note: '演示批次' });
    state.quotes.push({ id: `q${index}`, productId: id, supplierId: index % 2 ? 's1' : 's2', priceCents: price, packSize, date });
  });
  state.quotes.push({ id: 'q-other', productId: 'p1', supplierId: 's1', priceCents: 2640, packSize: 24, date });
  return state;
}
