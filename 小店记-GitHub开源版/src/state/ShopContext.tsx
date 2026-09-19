import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Operation, ShopState, StoredShop } from '../domain/types';
import { applyOperation } from '../domain/operations';
import { loadShop, commitShop, restoreShop, rollbackShop, confirmBackup } from '../data/repository';
import { createBackup } from '../domain/backup';
import { demoState } from '../data/demo';
import { downloadText } from '../lib/format';
import { today } from '../domain/dates';

type Toast = { text: string; error: boolean } | null;
interface ShopContextValue {
  shop: StoredShop | null; loading: boolean; fatal: string; demo: boolean; busy: boolean; toast: Toast;
  pendingExport: { revision: number; filename: string } | null;
  save: (op: Operation, exportAfter?: boolean, expectedRevision?: number) => Promise<void>;
  exportBackup: (state?: ShopState) => Promise<void>;
  confirmExport: () => Promise<void>;
  dismissExport: () => void;
  importBackup: (state: ShopState) => Promise<void>;
  rollback: () => Promise<void>;
  setDemo: (value: boolean) => void;
  reload: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
}
const ShopContext = createContext<ShopContextValue | null>(null);
export const useShop = () => { const value = useContext(ShopContext); if (!value) throw new Error('缺少商店上下文'); return value; };

export function ShopProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<StoredShop | null>(null);
  const [demoShop, setDemoShop] = useState<StoredShop | null>(null);
  const [loading, setLoading] = useState(true); const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [toast, setToast] = useState<Toast>(null);
  const [pendingExport, setPendingExport] = useState<ShopContextValue['pendingExport']>(null);
  const demo = demoShop !== null; const shop = demoShop ?? live;
  const shopRef = useRef(shop); shopRef.current = shop;
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(null), toast.error ? 12000 : 5000); return () => clearTimeout(id); } }, [toast]);
  const reload = useCallback(async () => {
    try { setLive(await loadShop()); setFatal(''); } catch (e) { setFatal(`无法读取本机数据：${e instanceof Error ? e.message : '浏览器存储不可用'}。请勿清理浏览器，先保留已有备份。`); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const refresh = () => { if (!lock.current && !document.hidden) void reload(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [reload]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { if (!demo && shop && shop.state.revision > shop.backup.confirmedRevision) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent);
  }, [demo, shop]);
  async function exportBackup(state = shopRef.current?.state) {
    if (!state) return;
    if (demo) { notify('演示数据不会导出。请回到我的小店后备份。'); return; }
    try {
      const text = await createBackup(state);
      const filename = `小店记备份-${today()}-第${state.revision}版.json`;
      downloadText(text, filename); setPendingExport({ revision: state.revision, filename });
      notify('已发起文件下载，请在手机中确认文件已保存。');
    } catch (e) { notify(`导出失败：${e instanceof Error ? e.message : '请重试'}`, true); }
  }
  async function save(op: Operation, exportAfter = false, expectedRevision?: number) {
    if (lock.current || !shopRef.current) throw new Error('正在保存，请稍候。');
    lock.current = true; setBusy(true);
    try {
      const current = shopRef.current;
      if (expectedRevision !== undefined && current.state.revision !== expectedRevision) throw new Error('填写期间数据有更新，请关闭窗口重新核对后再填写');
      const next = applyOperation(current.state, op);
      if (demo) { const updated = { ...current, state: next }; setDemoShop(updated); shopRef.current = updated; notify('演示操作成功，未改动正式数据。'); }
      else {
        const updated = await commitShop(current.state.revision, next);
        setLive(updated); shopRef.current = updated; notify('已保存到本机 · 记得导出最新备份');
        if (exportAfter) await exportBackup(updated.state);
      }
    } catch (e) { notify(`保存失败：${e instanceof Error ? e.message : '请重试'}。本次未保存。`, true); throw e; }
    finally { lock.current = false; setBusy(false); }
  }
  async function changeStore(action: () => Promise<StoredShop>, message: string) {
    if (demo || lock.current) return; lock.current = true; setBusy(true);
    try { const updated = await action(); setLive(updated); shopRef.current = updated; setPendingExport(null); notify(message); }
    catch (e) { notify(e instanceof Error ? e.message : '操作失败', true); throw e; }
    finally { lock.current = false; setBusy(false); }
  }
  async function confirmExport() {
    if (!pendingExport) return;
    const revision = pendingExport.revision;
    await changeStore(() => confirmBackup(revision), '已记录这次备份，请保留好文件。');
  }
  return <ShopContext.Provider value={{ shop, loading, fatal, demo, busy, toast, pendingExport, save, exportBackup, confirmExport,
    dismissExport: () => setPendingExport(null),
    importBackup: state => changeStore(() => restoreShop(shopRef.current!.state.revision, state), '备份已恢复，原来的数据仍保留一份供撤回。请导出当前版本。'),
    rollback: () => changeStore(() => rollbackShop(shopRef.current!.state.revision), '已找回恢复前的数据，请导出当前版本。'),
    setDemo: value => { setPendingExport(null); setDemoShop(value ? { state: demoState(), backup: { confirmedRevision: 0, confirmedAt: null }, recovery: null } : null); }, reload, notify }}>{children}</ShopContext.Provider>;
}
