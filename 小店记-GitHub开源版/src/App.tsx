import { useEffect, useState } from 'react';
import { Store, LayoutDashboard, Package, ShoppingBasket, Clock3, Truck, History as HistoryIcon, Download, Settings, MoreHorizontal, ArrowUpRight, CheckCircle2, ShieldCheck, ArrowLeft, WifiOff, X, AlertCircle } from 'lucide-react';
import { useShop } from './state/ShopContext';
import { Dashboard } from './features/Dashboard';
import { Products } from './features/Products';
import { Suppliers } from './features/Suppliers';
import { Replenish } from './features/Replenish';
import { Expiry } from './features/Expiry';
import { History } from './features/History';
import { Backup } from './features/Backup';
import { Editors, type Editor } from './features/Editors';
import { Modal } from './components/ui';
import { timeLabel } from './lib/format';

const nav=[{id:'home',name:'今日概览',icon:LayoutDashboard},{id:'products',name:'商品与库存',icon:Package},{id:'replenish',name:'补货清单',icon:ShoppingBasket},{id:'expiry',name:'临期与处理',icon:Clock3},{id:'suppliers',name:'供应商',icon:Truck},{id:'history',name:'进货与操作记录',icon:HistoryIcon},{id:'backup',name:'备份与恢复',icon:Download}];
export default function App(){
  const {shop,loading,fatal,demo,busy,toast,setDemo,reload,exportBackup,pendingExport,confirmExport,dismissExport}=useShop();
  const [page,setPage]=useState('home');const [editor,setEditor]=useState<Editor|null>(null);
  const [online,setOnline]=useState(()=>navigator.onLine);
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);
    window.addEventListener('online',update);window.addEventListener('offline',update);update();
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  function navigate(value:string){setPage(value);window.scrollTo({top:0,behavior:'instant'});}
  if(loading)return <div className="loading"><Store size={36}/><p>正在打开小店记录…</p></div>;
  if(fatal||!shop)return <div className="loading"><AlertCircle size={40}/><h1>暂时无法打开本机数据</h1><p>{fatal}</p><button className="btn primary" onClick={()=>void reload()}>重新读取</button></div>;
  const state=shop.state;const dirty=state.revision>shop.backup.confirmedRevision;
  const date=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  return <div className="app-shell"><aside className="sidebar"><a href="#" className="brand" onClick={e=>{e.preventDefault();navigate('home');}}><span className="brand-icon"><Store size={25}/></span><span>小店记<small>补货 · 临期 · 放心记</small></span></a><div className="nav-caption">我的小店</div><nav aria-label="主导航">{nav.map(item=><button key={item.id} className={`nav-item ${page===item.id?'selected':''}`} onClick={()=>navigate(item.id)}><item.icon size={20} strokeWidth={1.7}/>{item.name}{page===item.id&&<span className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={22}/><div><strong>数据留在这台设备</strong><span>免登录 · 记得定期导出</span></div></div><button className="nav-item" onClick={()=>setEditor({type:'settings'})}><Settings size={19}/>小店设置</button><span className="version">简单一点，生意轻松一点。</span></div></aside>
    <div className="workspace"><header className="topbar"><div className="mobile-brand"><Store size={22}/><strong>小店记</strong></div><div className="desktop-shop"><Store size={17}/><span>{state.settings.shopName==='小店记'?'我的小店':state.settings.shopName}</span></div><span className="header-date">{date}</span><button className="demo-toggle" onClick={()=>{setDemo(!demo);navigate('home');}}>{demo?<><ArrowLeft size={15}/>回到我的小店</>:<>看看演示<ArrowUpRight size={15}/></>}</button></header>
      {demo&&<div className="demo-banner">正在体验演示 · 操作不会改动您小店的正式数据<button onClick={()=>{setDemo(false);navigate('home');}}>退出演示</button></div>}
      {!online&&<div className="offline-note"><WifiOff size={16}/>当前离线，仍可在本机记录和导出。</div>}
      <main>
        {!demo&&<div className={`save-banner ${dirty?'needs-backup':''}`}><span className="save-indicator"><CheckCircle2 size={20}/></span><div className="save-copy"><strong>{state.revision?'已保存到本机':'本机记录已就绪'}</strong><span>{dirty?`有 ${state.revision-shop.backup.confirmedRevision} 次修改尚未确认备份`:shop.backup.confirmedAt?'最新版本已确认备份':'添加记录后，请导出一份备份'}{state.revision>0&&<span className="save-time"> · {timeLabel(state.updatedAt)}</span>}</span></div><button className="btn backup-button" disabled={busy} onClick={()=>void exportBackup()}><Download size={17}/>导出最新备份</button></div>}
        {page==='home'&&<Dashboard edit={setEditor} navigate={navigate}/>}
        {page==='products'&&<Products edit={setEditor}/>}
        {page==='replenish'&&<Replenish edit={setEditor} navigate={navigate}/>}
        {page==='expiry'&&<Expiry edit={setEditor}/>}
        {page==='suppliers'&&<Suppliers edit={setEditor}/>}
        {page==='history'&&<History/>}
        {page==='backup'&&<Backup/>}
        {page==='more'&&<><div className="page-title"><div><h1>小店工具</h1><p>供应商、历史记录、备份都在这里。</p></div></div><section className="panel more-list">{nav.filter(n=>!['home','products','expiry'].includes(n.id)).map(n=><button key={n.id} onClick={()=>navigate(n.id)}><n.icon size={23}/><span>{n.name}</span><ArrowUpRight size={18}/></button>)}<button onClick={()=>setEditor({type:'settings'})}><Settings size={23}/><span>小店设置</span><ArrowUpRight size={18}/></button></section></>}
        <footer className="page-footer"><span>小店记 · 让每一件货心里有数</span><span>数据仅在本机，请另存备份</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="手机导航">{[{id:'home',name:'今日',icon:LayoutDashboard},{id:'products',name:'商品',icon:Package},{id:'expiry',name:'临期',icon:Clock3},{id:'more',name:'更多',icon:MoreHorizontal}].map(n=><button key={n.id} className={(page===n.id||(n.id==='more'&&['replenish','suppliers','history','backup'].includes(page)))?'selected':''} onClick={()=>navigate(n.id)}><n.icon size={22} strokeWidth={1.8}/><span>{n.name}</span></button>)}</nav>
    {toast&&<div className={`toast ${toast.error?'error':''}`} role={toast.error?'alert':'status'}>{toast.error?<AlertCircle size={20}/>:<CheckCircle2 size={20}/>}<span>{toast.text}</span></div>}
    {editor&&<Editors key={JSON.stringify(editor)} editor={editor} onClose={()=>setEditor(null)}/>}
    {pendingExport&&!editor&&<Modal title="备份文件保存好了吗？" onClose={dismissExport}><div className="modal-body"><div className="download-symbol"><Download size={30}/></div><p>已发起备份文件下载。请在手机的“下载”或文件管理里确认文件已保存。</p><p className="file-name">{pendingExport.filename}</p><div className="notice amber">浏览器无法确认文件最终是否保存。确认文件存在后，再点下方按钮；找不到文件时请保留待备份提醒。</div></div><div className="modal-foot"><button className="btn" onClick={dismissExport} disabled={busy}>尚未存好</button><button className="btn primary" disabled={busy} onClick={()=>void confirmExport().catch(()=>{})}>我已保存好文件</button></div></Modal>}
  </div>;
}
