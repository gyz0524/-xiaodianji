import { useState } from 'react';
import { Copy, ShoppingBasket, Check, Pencil, RefreshCw } from 'lucide-react';
import { useShop } from '../state/ShopContext';
import { Empty, Glyph, Tag, Modal, Field } from '../components/ui';
import { replenishment, latestQuotes } from '../domain/selectors';
import { today, daysUntil } from '../domain/dates';
import { dateLabel, unitPrice } from '../lib/format';
import type { Editor } from './Editors';

export function Replenish({edit,navigate}:{edit:(editor:Editor)=>void;navigate:(page:string)=>void}) {
  const {shop,notify}=useShop(); const state=shop!.state; const suggestions=replenishment(state);
  const [choices,setChoices]=useState<Record<string,{supplier:string;quantity:number;selected:boolean}>>({}); const [copyText,setCopyText]=useState(''); const [copied,setCopied]=useState(false);
  const rows=suggestions.map(row=>({...row,choice:choices[row.product.id]??{supplier:latestQuotes(state,row.product.id)[0]?.supplierId??'',quantity:row.needed,selected:true}}));
  function update(id:string,patch:Partial<{supplier:string;quantity:number;selected:boolean}>) {const row=rows.find(r=>r.product.id===id)!;setChoices({...choices,[id]:{...row.choice,...patch}});}
  const selected=rows.filter(r=>r.choice.selected);const groups=[...new Set(selected.map(r=>r.choice.supplier))];
  function createList() {
    if(!selected.length){notify('请至少选中一种需要补货的商品。',true);return;}
    if(selected.some(r=>!Number.isSafeInteger(r.choice.quantity)||r.choice.quantity<=0||r.choice.quantity>1000000)){notify('进货数量请填 1 至 1000000 的整数。',true);return;}
    const text=`${state.settings.shopName} · 进货清单\n${today()}\n请核对数量、价格与实际库存后再联系供应商。\n\n`+groups.map(id=>`${state.suppliers.find(s=>s.id===id)?.name??'待选供应商'}\n`+selected.filter(r=>r.choice.supplier===id).map(r=>`· ${r.product.name} ${r.product.spec}：${r.choice.quantity}${r.product.unit}`).join('\n')).join('\n\n');
    setCopyText(text);setCopied(false);
  }
  async function copy(){try{await navigator.clipboard.writeText(copyText);setCopied(true);notify('清单已复制，可自行粘贴到微信。');}catch{notify('请长按下方清单，选择全选并复制。',true);}}
  return <><div className="page-title"><div><h1>补货清单</h1><p>按记录库存给建议，确认后再进货。</p></div><button className="btn primary" onClick={createList}><Copy size={18}/>整理进货清单</button></div><div className="notice amber"><ShoppingBasket size={20}/><span>库存来自人工记录，微信收款不会自动扣减。进货前请核对货架，清单不会自动下单。</span></div><div className="section-head standalone"><h2>{suggestions.length} 种商品需要补货</h2><button className="link-btn" onClick={()=>{setChoices({});notify('已按最新库存重新整理。');}}><RefreshCw size={16}/>重置建议</button></div>
    <section className="panel">{rows.length?rows.map(({product:p,stock,needed,lastChecked,choice})=>{const quotes=latestQuotes(state,p.id);const quote=quotes.find(q=>q.supplierId===choice.supplier);const stale=!lastChecked||daysUntil(lastChecked.slice(0,10),today()) < -7; return <div className={`restock-row ${!choice.selected?'unselected':''}`} key={p.id}><div className="restock-top"><label className="check-control"><input type="checkbox" checked={choice.selected} onChange={e=>update(p.id,{selected:e.target.checked})} aria-label={`选中${p.name}`}/></label><Glyph category={p.category}/><div className="item-main"><strong>{p.name}</strong><small>{p.spec} · 记录剩 {stock}{p.unit}</small></div><button className="link-btn" onClick={()=>navigate('products')}><Pencil size={15}/>核对库存</button></div><div className="restock-fields"><Field label="本次向谁进货"><select value={choice.supplier} onChange={e=>update(p.id,{supplier:e.target.value})}><option value="">待选供应商</option>{state.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{quotes.some(q=>q.supplierId===s.id)?'':'（暂无报价）'}</option>)}</select></Field><Field label={`计划进货（${p.unit}）`}><input type="number" min="1" max="1000000" step="1" inputMode="numeric" value={Number.isNaN(choice.quantity)?'':choice.quantity} onChange={e=>update(p.id,{quantity:e.target.value===''?NaN:Number(e.target.value)})}/></Field></div><div className="restock-bottom"><span>建议补 {needed}{p.unit}{p.packSize>1&&` · 整箱约 ${Math.ceil(needed/p.packSize)}箱（${Math.ceil(needed/p.packSize)*p.packSize}${p.unit}）`}</span>{quote?<span>参考 {unitPrice(quote.priceCents,quote.packSize)}/{p.unit} · {dateLabel(quote.date)}</span>:<button className="link-btn" onClick={()=>edit({type:'quote',productId:p.id})}>添加报价</button>}</div>{stale&&<Tag tone="amber">{lastChecked?`${dateLabel(lastChecked)}后未核对，先看看货架`:'还没核对库存，请先登记实际数量'}</Tag>}</div>;}):<Empty title="暂时不用补货" description="库存未达到补货下限，或还没有添加商品。核对后这里会自动更新。"/>}</section>
    {selected.length>0&&<div className="selection-footer"><span>已选 <strong>{selected.length}</strong> 种商品 · {groups.length} 组供应商</span><button className="btn primary" onClick={createList}>预览并复制清单</button></div>}
    {copyText&&<Modal title="进货清单预览" onClose={()=>setCopyText('')}><div className="modal-body"><p className="muted">请确认后复制到微信，这里不会自动发送消息。</p><textarea className="copy-area" value={copyText} onChange={e=>{setCopyText(e.target.value);setCopied(false);}} aria-label="可复制的进货清单"/></div><div className="modal-foot"><button className="btn" onClick={()=>setCopyText('')}>返回</button><button className="btn primary" onClick={()=>void copy()}>{copied?<Check size={18}/>:<Copy size={18}/>} {copied?'已复制':'复制清单'}</button></div></Modal>}
  </>;
}
