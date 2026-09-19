import { useState } from 'react';
import { Clock3, Settings2, ArrowRight } from 'lucide-react';
import { useShop } from '../state/ShopContext';
import { Empty, Glyph, Tag } from '../components/ui';
import { expiryList } from '../domain/selectors';
import { dateLabel } from '../lib/format';
import type { Editor } from './Editors';

export function Expiry({edit}:{edit:(editor:Editor)=>void}) {
  const {shop}=useShop();const state=shop!.state;const [filter,setFilter]=useState('全部待留意');const list=expiryList(state);const unknown=state.batches.filter(b=>b.remaining>0&&!b.expiryDate);
  const filtered=list.filter(r=>filter==='已过期'?r.days<0:filter==='优先销售 / 打折'?r.days>=0&&(r.batch.status==='优先销售'||r.batch.status==='打折处理'):true);
  const processing=filter==='优先销售 / 打折'?state.batches.filter(b=>b.remaining>0&&['优先销售','打折处理'].includes(b.status)&&(!b.expiryDate||!list.some(r=>r.batch.id===b.id))).map(batch=>({batch,product:state.products.find(p=>p.id===batch.productId)!})):[];
  return <><div className="page-title"><div><h1>临期与处理</h1><p>先到期的先留意，按批次处理更清楚。</p></div><button className="btn" onClick={()=>edit({type:'settings'})}><Settings2 size={17}/>提前 {state.settings.reminderDays} 天提醒</button></div><div className="notice"><Clock3 size={20}/><span>打开网页即可看到到期提醒；关闭网页后不会推送消息。请每天看一次，日期以商品包装为准。</span></div><div className="tabs">{['全部待留意','已过期','优先销售 / 打折','日期待补录'].map(f=><button className={f===filter?'active':''} key={f} onClick={()=>setFilter(f)}>{f}{f==='日期待补录'&&unknown.length>0&&` (${unknown.length})`}</button>)}</div>
    <section className="panel">{filter==='日期待补录'?unknown.length?unknown.map(b=>{const p=state.products.find(p=>p.id===b.productId)!;return <div className="expiry-row" key={b.id}><Glyph category={p.category}/><div className="item-main"><strong>{p.name}</strong><small>剩 {b.remaining}{p.unit} · {dateLabel(b.receivedDate)}登记</small></div><button className="btn" onClick={()=>edit({type:'count',batch:b})}>补录日期</button></div>;}):<Empty title="没有待补录的日期" description="有保质期的商品，记得每批都登记到期日期。"/>:filtered.length||processing.length?<>{filtered.map(({batch:b,product:p,days})=><div className="expiry-row" key={b.id}><Glyph category={p.category}/><div className="item-main"><strong>{p.name}</strong><small>{p.spec} · 剩 {b.remaining}{p.unit}</small><small>{dateLabel(b.expiryDate)} 到期</small></div><div className="expiry-status"><Tag tone={days<=3?'red':'amber'}>{days<0?`已过期${-days}天`:days===0?'今天到期':`还剩${days}天`}</Tag><span className="small muted">{days<0?'请下架，停止销售':b.status==='正常'?'尚未处理':b.status}</span></div><button className={`btn small-btn ${days<0?'danger-outline':''}`} onClick={()=>edit({type:'status',batch:b})}>{days<0?'记录下架':'处理'}<ArrowRight size={15}/></button></div>)}{processing.map(({batch:b,product:p})=><div className="expiry-row" key={b.id}><Glyph category={p.category}/><div className="item-main"><strong>{p.name}</strong><small>剩 {b.remaining}{p.unit} · {b.expiryDate?dateLabel(b.expiryDate)+'到期':'日期待补录'}</small></div><Tag tone="amber">{b.status}</Tag><button className="btn small-btn" onClick={()=>edit({type:'status',batch:b})}>处理</button></div>)}</>:<Empty title="这一项暂时没有待处理商品" description="记录商品批次后，会根据您设置的提前天数提醒。"/>}</section>
  </>;
}
