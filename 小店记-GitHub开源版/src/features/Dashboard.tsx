import { ArrowRight, Plus, ShoppingBasket, Clock3, PackageCheck, ListChecks, Download, ClipboardCheck } from 'lucide-react';
import { useShop } from '../state/ShopContext';
import { Empty, Glyph, Tag } from '../components/ui';
import { replenishment, expiryList, stockOf } from '../domain/selectors';
import { dateLabel } from '../lib/format';
import type { Editor } from './Editors';

export function Dashboard({ edit, navigate }: { edit: (editor: Editor) => void; navigate: (page: string) => void }) {
  const { shop, demo, setDemo } = useShop(); const state = shop!.state;
  const restock = replenishment(state); const expiry = expiryList(state); const products = state.products.filter(p => p.active);
  const unknown = state.batches.filter(b => b.remaining > 0 && !b.expiryDate).length;
  const totalStock = products.filter(p => stockOf(state,p.id) > 0).length;
  return <>
    <div className="page-title"><div><h1>今天，打理好小店</h1><p>该补的货、快到期的商品，都在这里。</p><p className="creator-credit">网站创作者：<strong>郭亚志</strong></p></div><button className="btn primary" onClick={() => edit(products.length ? { type: 'receive' } : { type: 'product' })}><Plus size={19}/>{products.length ? '记录到货' : '添加第一个商品'}</button></div>
    <div className="stats">
      <button className="stat" onClick={() => navigate('replenish')}><span className="stat-icon amber"><ShoppingBasket size={23}/></span><span className="stat-label">需要补货<span className="stat-number">{restock.length}<small>种商品</small></span></span><ArrowRight size={18}/></button>
      <button className="stat" onClick={() => navigate('expiry')}><span className="stat-icon peach"><Clock3 size={23}/></span><span className="stat-label">到期需留意<span className="stat-number">{expiry.length}<small>批次</small></span></span><ArrowRight size={18}/></button>
      <button className="stat" onClick={() => navigate('products')}><span className="stat-icon mint"><PackageCheck size={23}/></span><span className="stat-label">在售商品<span className="stat-number">{products.length}<small>种 · {totalStock}种有记录库存</small></span></span><ArrowRight size={18}/></button>
    </div>
    {!products.length ? <section className="panel"><Empty title="从几件常卖的商品开始" description="先记供应商和商品，再登记货架上的数量与到期日期。以后补货就有据可查。"><div className="actions center"><button className="btn primary" onClick={() => edit({ type: 'supplier' })}>先添加供应商</button><button className="btn" onClick={() => edit({ type: 'product' })}>添加商品</button>{!demo && <button className="link-btn" onClick={() => setDemo(true)}>先看一看演示 →</button>}</div></Empty></section> : <div className="dashboard-columns">
      <section className="panel"><div className="section-head"><div><h2>该补这些货了</h2><p>根据最近记录的库存整理</p></div><button className="link-btn" onClick={() => navigate('replenish')}>进货清单 <ArrowRight size={16}/></button></div>
        {restock.length ? <div className="item-list">{restock.slice(0,4).map(({product:p,stock,needed}) => <button className="item-row" key={p.id} onClick={() => navigate('replenish')}><Glyph category={p.category}/><span className="item-main"><strong>{p.name}</strong><small>{p.spec}</small></span><span className="item-right"><Tag tone={stock === 0 ? 'red' : 'amber'}>剩 {stock} {p.unit}</Tag><small>建议补 {needed} {p.unit}</small></span></button>)}</div> : <Empty title="暂时没有需要补的货" description="忙完记得核对货架数量，让补货建议更准确。"/>}
        <div className="panel-footer"><ClipboardCheck size={17}/><span>扫码收款不会自动扣库存，补货前先看一眼货架。</span></div>
      </section>
      <section className="panel"><div className="section-head"><div><h2>这些批次先留意</h2><p>提前 {state.settings.reminderDays} 天提醒</p></div><button className="link-btn" onClick={() => navigate('expiry')}>查看全部 <ArrowRight size={16}/></button></div>
        {expiry.length ? <div className="item-list">{expiry.slice(0,4).map(({batch:b,product:p,days}) => <button className="item-row" key={b.id} onClick={() => edit({ type: 'status', batch: b })}><Glyph category={p.category}/><span className="item-main"><strong>{p.name}</strong><small>{dateLabel(b.expiryDate)} 到期 · 剩 {b.remaining}{p.unit}</small></span><span className="item-right"><Tag tone={days <= 3 ? 'red' : 'amber'}>{days < 0 ? `已过期${-days}天` : days === 0 ? '今天到期' : `还剩${days}天`}</Tag><small>{b.status === '正常' ? '等待处理' : b.status}</small></span></button>)}</div> : <Empty title="目前没有临期提醒" description={unknown ? `还有 ${unknown} 批商品未登记到期日期，请到临期页面补录。` : '登记到货日期后，会在这里提醒您。'}/>}
        <div className="panel-footer"><Clock3 size={17}/><span>同一种商品，不同到期日要分批记录。</span></div>
      </section>
    </div>}
    <div className="daily-strip"><span className="strip-icon"><ListChecks size={25}/></span><div><h3>收店前，花一分钟</h3><p>核对缺货，看看临期，再把今天的记录导出一份。</p></div><button className="btn" onClick={() => navigate('backup')}><Download size={17}/>备份与恢复</button></div>
  </>;
}
