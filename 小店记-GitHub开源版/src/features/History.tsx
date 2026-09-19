import { useState } from 'react';
import { Search } from 'lucide-react';
import { useShop } from '../state/ShopContext';
import { Empty, Tag } from '../components/ui';
import { dateLabel, money, timeLabel } from '../lib/format';

export function History(){const {shop}=useShop();const state=shop!.state;const [tab,setTab]=useState('进货历史');const [search,setSearch]=useState('');const purchases=state.purchases.slice().reverse().filter(p=>`${p.productName}${p.supplierName}${p.note}`.includes(search)); const audit=state.audit.slice().reverse().filter(a=>`${a.action}${a.detail}`.includes(search));
return <><div className="page-title"><div><h1>记录随时查</h1><p>实际进货和每次修改都有记录，放心核对。</p></div></div><div className="toolbar"><label className="search"><Search size={19}/><input placeholder="搜索商品、供应商或修改内容" aria-label="搜索记录" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="tabs">{['进货历史','操作记录'].map(t=><button className={tab===t?'active':''} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div><section className="panel">{tab==='进货历史'?purchases.length?purchases.map(p=><div className="history-row" key={p.id}><span className="history-date">{dateLabel(p.date)}</span><div className="item-main"><strong>{p.productName}</strong><small>{p.supplierName} · {p.quantity}{p.unit}</small>{p.note&&<small>{p.note}</small>}</div><strong>{money(p.totalCents)}</strong></div>):<Empty title="还没有进货记录" description="每次使用“记录到货”，都会保存本次供应商、数量和实际进价。"/>:audit.length?audit.map(a=><div className="audit-row" key={a.id}><div><Tag>{a.action}</Tag><time>{timeLabel(a.at)}</time></div><p>{a.detail}</p></div>):<Empty title="暂无操作记录" description="保存或更正数据后，可以在这里追溯。"/>}</section></>;
}
