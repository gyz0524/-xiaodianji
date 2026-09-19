import { useState } from 'react';
import { Field, SaveForm } from '../components/ui';
import { useShop } from '../state/ShopContext';
import type { Batch, BatchStatus, Product, Supplier } from '../domain/types';
import { centsFrom, dateLabel, money, uid, unitPrice } from '../lib/format';
import { addShelfLife, today } from '../domain/dates';
import { latestQuotes, stockOf } from '../domain/selectors';

export type Editor = { type: 'product'; product?: Product } | { type: 'supplier'; supplier?: Supplier } | { type: 'receive' | 'quote' | 'batch'; productId?: string } | { type: 'count' | 'status'; batch: Batch } | { type: 'settings' };
const str = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const num = (data: FormData, key: string) => { const raw = str(data, key); if (!/^\d+$/.test(raw)) throw new Error('数量请填写非负整数。'); const value = Number(raw); if (!Number.isSafeInteger(value) || value > 1000000) throw new Error('数量过大，请检查。'); return value; };

export function Editors({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  switch (editor.type) {
    case 'product': return <ProductEditor product={editor.product} onClose={onClose}/>;
    case 'supplier': return <SupplierEditor supplier={editor.supplier} onClose={onClose}/>;
    case 'receive': case 'batch': return <ArrivalEditor initialProduct={editor.productId} initial={editor.type === 'batch'} onClose={onClose}/>;
    case 'quote': return <QuoteEditor initialProduct={editor.productId} onClose={onClose}/>;
    case 'count': return <CountEditor batch={editor.batch} onClose={onClose}/>;
    case 'status': return <StatusEditor batch={editor.batch} onClose={onClose}/>;
    case 'settings': return <SettingsEditor onClose={onClose}/>;
  }
}
function ProductEditor({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { shop } = useShop(); const currentStock = product ? stockOf(shop!.state, product.id) : 0;
  const hasHistory = !!product && (shop!.state.batches.some(b => b.productId === product.id) || shop!.state.quotes.some(q => q.productId === product.id));
  return <SaveForm title={product ? '修改商品资料' : '添加商品'} onClose={onClose} build={data => {
    const name = str(data, 'name'); const minStock = num(data, 'minStock'); const targetStock = num(data, 'targetStock');
    if (targetStock < minStock) throw new Error('补货目标不能小于补货下限。');
    const packSize = num(data, 'packSize'); if (!packSize) throw new Error('每箱数量至少为 1。');
    const p = { id: product?.id ?? uid(), name, spec: str(data, 'spec'), category: str(data, 'category'), unit: product?.unit ?? str(data, 'unit'), packSize, minStock, targetStock, active: str(data, 'active') !== 'false', createdAt: product?.createdAt ?? new Date().toISOString() };
    return { operation: { type: 'product', product: p }, summary: [['商品', `${name} ${p.spec}`], ['计数单位', p.unit], ['整箱换算', `1箱 = ${packSize}${p.unit}`], ['补货规则', `不多于${minStock}${p.unit}时，补至${targetStock}${p.unit}`], ['状态', p.active ? '正常经营' : '停用商品']], warning: !p.active ? '停用后不会出现在补货清单，历史记录保留。' : undefined };
  }}>
    <Field label="商品名称"><input name="name" defaultValue={product?.name} required maxLength={80} placeholder="例如：农夫山泉"/></Field>
    <div className="form-grid"><Field label="规格"><input name="spec" defaultValue={product?.spec} maxLength={80} placeholder="例如：550mL"/></Field><Field label="类别"><select name="category" defaultValue={product?.category ?? '饮料'}>{['饮料','食品','日用品','烟酒','其他'].map(c => <option key={c}>{c}</option>)}</select></Field></div>
    <div className="form-grid"><Field label="计数单位" hint={product ? '已建档单位固定，避免历史数量混淆' : '选最小单位，例如瓶、袋、盒'}><input name="unit" defaultValue={product?.unit ?? '瓶'} readOnly={!!product} required maxLength={8}/></Field><Field label="一箱有多少" hint={hasHistory ? '已有库存或报价，包装换算固定' : '按个进货的商品填 1'}><input name="packSize" type="number" min="1" max="100000" step="1" defaultValue={product?.packSize ?? 24} readOnly={hasHistory} required inputMode="numeric"/></Field></div>
    <div className="form-grid"><Field label="剩多少开始补货"><input name="minStock" type="number" min="0" max="100000" step="1" defaultValue={product?.minStock ?? 6} required inputMode="numeric"/></Field><Field label="希望补到多少"><input name="targetStock" type="number" min="0" max="100000" step="1" defaultValue={product?.targetStock ?? 24} required inputMode="numeric"/></Field></div>
    {product && <Field label="商品状态" hint={currentStock ? '有剩余库存，不能停用。请先核对或处理批次。' : undefined}><select name="active" defaultValue={String(product.active)}><option value="true">正常经营</option><option value="false" disabled={currentStock > 0}>停用（保留历史）</option></select></Field>}
    {!product && <p className="notice">建档后，使用“登记现有库存”录入货架数量；新进的货使用“记录到货”。</p>}
  </SaveForm>;
}
function SupplierEditor({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  return <SaveForm title={supplier ? '修改供应商' : '添加供应商'} onClose={onClose} build={data => {
    const s = { id: supplier?.id ?? uid(), name: str(data,'name'), contact: str(data,'contact'), phone: str(data,'phone'), wechat: str(data,'wechat'), note: str(data,'note') };
    return { operation: { type: 'supplier', supplier: s }, summary: [['供应商', s.name], ['联系人', s.contact || '未填'], ['电话', s.phone || '未填'], ['微信号', s.wechat || '未填'], ['备注', s.note || '无']] };
  }}><Field label="供应商名称"><input name="name" required maxLength={80} defaultValue={supplier?.name} placeholder="例如：老张食品批发"/></Field><Field label="联系人"><input name="contact" maxLength={80} defaultValue={supplier?.contact} placeholder="例如：张老板"/></Field><Field label="联系电话"><input name="phone" type="tel" maxLength={40} defaultValue={supplier?.phone} placeholder="方便进货时联系"/></Field><Field label="微信号"><input name="wechat" maxLength={80} defaultValue={supplier?.wechat}/></Field><Field label="备注"><textarea name="note" maxLength={500} defaultValue={supplier?.note} placeholder="送货时间、起送量等"/></Field></SaveForm>;
}
function ProductSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { shop } = useShop(); return <Field label="商品"><select name="productId" required value={value} onChange={e => onChange(e.target.value)}><option value="">请选择商品</option>{shop!.state.products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} · {p.spec}</option>)}</select></Field>;
}
function SupplierSelect({ defaultValue, optional = false }: { defaultValue?: string; optional?: boolean }) {
  const { shop } = useShop(); return <Field label={optional ? '供应商（可不填）' : '供应商'}><select name="supplierId" required={!optional} defaultValue={defaultValue ?? ''}><option value="">{optional ? '不清楚 / 未记录' : '请选择供应商'}</option>{shop!.state.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>;
}
function DateFields() {
  const [mode, setMode] = useState('expiry'); const [production, setProduction] = useState(''); const [amount, setAmount] = useState('6'); const [unit, setUnit] = useState<'days' | 'months' | 'years'>('months');
  let calculated = ''; try { if (production && amount && Number(amount) > 0) calculated = addShelfLife(production, Number(amount), unit); } catch { /* invalid preview stays blank; submit validates */ }
  return <><Field label="保质期怎么登记"><select name="dateMode" value={mode} onChange={e => setMode(e.target.value)}><option value="expiry">直接填写到期日期</option><option value="production">生产日期 + 保质期</option><option value="unknown">暂时不清楚，稍后补录</option></select></Field>
    {mode === 'expiry' && <Field label="到期日期" hint="按包装上的日期填写，同商品不同日期要分批登记"><input name="expiryDate" type="date" min={today()} required/></Field>}
    {mode === 'production' && <><Field label="生产日期"><input name="productionDate" type="date" max={today()} required value={production} onChange={e => setProduction(e.target.value)}/></Field><div className="form-grid"><Field label="保质期"><input name="shelfAmount" type="number" min="1" max="3650" step="1" required value={amount} onChange={e => setAmount(e.target.value)}/></Field><Field label="时间单位"><select name="shelfUnit" value={unit} onChange={e => setUnit(e.target.value as typeof unit)}><option value="days">天</option><option value="months">个月</option><option value="years">年</option></select></Field></div>{calculated && <p className="notice">计算到期日：{dateLabel(calculated)}。请与包装标注核对。</p>}</>}
    {mode === 'unknown' && <div className="notice amber">这批货会列入“日期待补录”，无法计算临期提醒。</div>}
  </>;
}
function getDates(data: FormData) {
  const mode = str(data, 'dateMode'); const productionDate = mode === 'production' ? str(data, 'productionDate') : null;
  const expiryDate = mode === 'unknown' ? null : mode === 'expiry' ? str(data, 'expiryDate') : addShelfLife(productionDate!, num(data, 'shelfAmount'), str(data, 'shelfUnit') as 'days' | 'months' | 'years');
  return { productionDate, expiryDate };
}
function ArrivalEditor({ initialProduct, initial, onClose }: { initialProduct?: string; initial: boolean; onClose: () => void }) {
  const { shop } = useShop(); const state = shop!.state; const [productId, setProductId] = useState(initialProduct ?? '');
  const p = state.products.find(p => p.id === productId); const quotes = p ? latestQuotes(state, p.id) : [];
  const lastPurchase = [...state.purchases].reverse().find(x => x.productId === productId);
  const lastQuote = quotes.find(q => q.supplierId === lastPurchase?.supplierId) ?? quotes[0];
  const [quantity, setQuantity] = useState('1'); const [packing, setPacking] = useState('unit');
  return <SaveForm title={initial ? '登记现有库存' : '记录到货'} onClose={onClose} build={data => {
    if (!p) throw new Error('请先选择商品。');
    const quantity = num(data, 'quantity') * (str(data, 'packing') === 'case' ? p.packSize : 1); if (!quantity) throw new Error('数量至少为 1。');
    const { productionDate, expiryDate } = getDates(data); const supplierId = str(data,'supplierId'); const date = str(data,'date');
    const supplier = state.suppliers.find(s => s.id === supplierId); const note = str(data,'note'); const totalCents = initial ? 0 : centsFrom(data.get('total'));
    const operation = initial ? { type: 'batch', batch: { id: uid(), productId, supplierId: supplierId || null, remaining: quantity, receivedDate: date, productionDate, expiryDate, checkedAt: new Date().toISOString(), status: '正常', note } } : { type: 'receive', productId, supplierId, quantity, totalCents, date, productionDate, expiryDate, note };
    return { operation, summary: [['商品', `${p.name} ${p.spec}`], ['增加库存', `${quantity}${p.unit}`], ['保存后记录库存', `${stockOf(state, productId) + quantity}${p.unit}`], ['供应商', supplier?.name ?? '未记录'], ...(!initial ? [['本次进货总额', money(totalCents)], ['折合单价', `${unitPrice(totalCents, quantity)} / ${p.unit}`]] as [string,string][] : []), ['到期日期', expiryDate ? dateLabel(expiryDate) : '日期待补录']], warning: initial ? '这里只登记货架上已有的货，不计入进货金额。请勿与“记录到货”重复登记。' : '请只登记实际已收到的货，未到货的订单不要入库。' };
  }}>
    <ProductSelect value={productId} onChange={id => { setProductId(id); setPacking('unit'); }}/>
    <div key={productId}><SupplierSelect defaultValue={lastQuote?.supplierId} optional={initial}/></div>
    <div className="form-grid"><Field label={initial ? '现有数量' : '本次到货数量'}><input name="quantity" type="number" required min="1" max="100000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="numeric"/></Field><Field label="数量单位"><select name="packing" value={packing} onChange={e => setPacking(e.target.value)}><option value="unit">{p?.unit ?? '最小单位'}</option><option value="case">箱（每箱{p?.packSize ?? '—'}{p?.unit}）</option></select></Field></div>
    {p && <p className="inline-note">共 {Number(quantity || 0) * (packing === 'case' ? p.packSize : 1)} {p.unit}，目前记录库存 {stockOf(state, p.id)} {p.unit}</p>}
    {!initial && <Field label="本次实际进货总额（元）" hint={lastQuote ? `参考报价：${money(lastQuote.priceCents)} / ${lastQuote.packSize}${p?.unit}（${dateLabel(lastQuote.date)}）；请填写本次实际金额` : '填写这一批货的总金额，不是单件价格'}><input name="total" type="number" min="0.01" max="1000000" step="0.01" required inputMode="decimal" placeholder="例如：48.00"/></Field>}
    <Field label={initial ? '登记日期' : '到货日期'}><input name="date" type="date" max={today()} defaultValue={today()} required/></Field><DateFields/><Field label="备注（可不填）"><input name="note" maxLength={500} placeholder="例如：赠送2瓶已计入数量"/></Field>
    {!initial && !state.suppliers.length && <p className="notice amber">请先在“供应商”里添加一位供应商，再记录到货。</p>}
  </SaveForm>;
}
function QuoteEditor({ initialProduct, onClose }: { initialProduct?: string; onClose: () => void }) {
  const { shop } = useShop(); const [productId, setProductId] = useState(initialProduct ?? ''); const p = shop!.state.products.find(p => p.id === productId);
  return <SaveForm title="记录供应商报价" onClose={onClose} build={data => {
    if (!p) throw new Error('请选择商品。'); const priceCents = centsFrom(data.get('price')); const packSize = num(data,'packSize'); if (!packSize || !priceCents) throw new Error('报价和包装数量需大于 0。');
    const supplierId = str(data,'supplierId'); const supplier = shop!.state.suppliers.find(s => s.id === supplierId);
    return { operation: { type: 'quote', quote: { id: uid(), productId, supplierId, priceCents, packSize, date: str(data,'date') } }, summary: [['商品', p.name], ['供应商', supplier?.name ?? '未选'], ['整包价格', `${money(priceCents)} / ${packSize}${p.unit}`], ['折合单价', `${unitPrice(priceCents, packSize)} / ${p.unit}`]], warning: '这里只记录报价，不会改变库存。不同供应商请使用相同商品规格比较。' };
  }}><ProductSelect value={productId} onChange={setProductId}/><SupplierSelect/><div className="form-grid"><Field label="报价总额（元）"><input name="price" type="number" min="0.01" step="0.01" max="1000000" required inputMode="decimal"/></Field><Field label={`该报价包含多少${p?.unit ?? '件'}`}><input key={productId} name="packSize" type="number" min="1" max="100000" step="1" defaultValue={p?.packSize ?? 1} required inputMode="numeric"/></Field></div><Field label="报价日期"><input name="date" type="date" required max={today()} defaultValue={today()}/></Field></SaveForm>;
}
function CountEditor({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const { shop } = useShop(); const p = shop!.state.products.find(p => p.id === batch.productId)!;
  return <SaveForm title="核对这批库存与日期" onClose={onClose} build={data => {
    const remaining = num(data,'remaining'); const expiryDate = str(data,'expiryDate') || null;
    return { operation: { type: 'batch', batch: { ...batch, remaining, expiryDate, checkedAt: new Date().toISOString(), status: remaining === 0 ? '已售完' : ['已售完','已退货','已下架'].includes(batch.status) ? '正常' : batch.status, note: str(data,'note') } }, summary: [['商品', p.name], ['原记录数量', `${batch.remaining}${p.unit}`], ['实际剩余数量', `${remaining}${p.unit}`], ['到期日期', expiryDate ? dateLabel(expiryDate) : '日期待补录'], ['更正说明', str(data,'note') || '现场核对']], warning: '请只数这个到期日期的这一批货。系统不会自动识别微信付款卖出了哪些商品。' };
  }}><p className="editor-product">{p.name}<span>{p.spec} · {dateLabel(batch.receivedDate)}登记</span></p><Field label={`实际还剩多少${p.unit}`} hint={`上次记录：${batch.remaining}${p.unit}`}><input name="remaining" type="number" min="0" max="1000000" step="1" defaultValue={batch.remaining} required inputMode="numeric"/></Field><Field label="到期日期" hint="不清楚可留空，会列入日期待补录"><input name="expiryDate" type="date" defaultValue={batch.expiryDate ?? ''}/></Field><Field label="核对 / 更正说明"><input name="note" maxLength={500} placeholder="例如：现场数过；之前日期填错"/></Field></SaveForm>;
}
function StatusEditor({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const { shop } = useShop(); const p = shop!.state.products.find(p => p.id === batch.productId)!;
  const expired = !!batch.expiryDate && batch.expiryDate < today(); const [status, setStatus] = useState<BatchStatus>(expired ? '已下架' : '优先销售');
  const clear = ['已售完','已退货','已下架'].includes(status);
  return <SaveForm title="记录批次处理" onClose={onClose} build={data => ({ operation: { type: 'status', batchId: batch.id, status, note: str(data,'note') }, summary: [['商品', p.name], ['到期日期', dateLabel(batch.expiryDate)], ['处理方式', status], ['剩余库存', clear ? `${batch.remaining}${p.unit} → 0${p.unit}` : `${batch.remaining}${p.unit}（不变）`]], warning: clear ? '确认后会把这批货的记录库存设为 0。请先完成实际处理，误操作可到商品批次里重新核对数量。' : '只做处理标记，不改变库存；实际价格由您决定。' })}>
    <p className="editor-product">{p.name}<span>{batch.remaining}{p.unit} · {dateLabel(batch.expiryDate)}到期</span></p><Field label="处理方式"><select value={status} onChange={e => setStatus(e.target.value as BatchStatus)}>{(expired ? ['已下架','已退货'] : ['优先销售','打折处理','正常','已售完','已退货','已下架']).map(s => <option key={s}>{s}</option>)}</select></Field><Field label="处理说明"><input name="note" required={clear} maxLength={500} placeholder={clear ? '请填写，如：过期已从货架移除' : '例如：放到收银台旁边，8折'}/></Field>{expired && <p className="notice red">该批次已过期，请下架或退货，不列入销售清单。</p>}</SaveForm>;
}
function SettingsEditor({ onClose }: { onClose: () => void }) {
  const { shop } = useShop(); return <SaveForm title="小店设置" onClose={onClose} build={data => ({ operation: { type: 'settings', shopName: str(data,'shopName'), reminderDays: num(data,'reminderDays') }, summary: [['小店名称', str(data,'shopName')], ['提前提醒', `${str(data,'reminderDays')}天`]] })}><Field label="小店名称"><input name="shopName" required maxLength={40} defaultValue={shop!.state.settings.shopName}/></Field><Field label="提前多少天提醒临期"><select name="reminderDays" defaultValue={shop!.state.settings.reminderDays}>{[7,15,30,60,90].map(n => <option key={n} value={n}>{n} 天</option>)}</select></Field></SaveForm>;
}
