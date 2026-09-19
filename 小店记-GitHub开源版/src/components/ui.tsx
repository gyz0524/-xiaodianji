import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { X, Package, Wine, Cookie, SprayCan, Store, AlertTriangle, Check, ArrowLeft } from 'lucide-react';
import type { Category, Operation } from '../domain/types';
import { useShop } from '../state/ShopContext';
import { uid } from '../lib/format';

export function Glyph({ category = '其他' }: { category?: Category }) {
  const Icon = category === '饮料' || category === '烟酒' ? Wine : category === '食品' ? Cookie : category === '日用品' ? SprayCan : Package;
  return <span className={`product-glyph glyph-${category}`}><Icon size={23} strokeWidth={1.6}/></span>;
}
export function Empty({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Store size={32} strokeWidth={1.4}/></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Tag({ tone = '', children }: { tone?: string; children: ReactNode }) { return <span className={`tag ${tone}`}>{children}</span>; }
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Modal({ title, onClose, children, dirty = false, wide = false }: { title: string; onClose: () => void; children: ReactNode; dirty?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const [discard, setDiscard] = useState(false);
  const askClose = () => { if (dirty) setDiscard(true); else onClose(); };
  useEffect(() => { const dialog = ref.current; const prev = document.activeElement as HTMLElement | null; dialog?.showModal(); const scroll = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { dialog?.close(); document.body.style.overflow = scroll; prev?.focus(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); askClose(); }} aria-label={title}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-btn" aria-label="关闭窗口" onClick={askClose}><X size={22}/></button></div>
    {discard && <div className="modal-body"><div className="notice amber"><AlertTriangle size={20}/><span>还有未提交的内容，关闭后不会保存。</span></div><div className="actions"><button className="btn" onClick={() => setDiscard(false)}>继续填写</button><button className="btn danger" onClick={onClose}>放弃本次填写</button></div></div>}
    <div hidden={discard}>{children}</div>
  </dialog>;
}
export type Proposal = { operation: Omit<Operation, 'id' | 'at'> | Record<string, unknown>; summary: [string, string][]; warning?: string };
export function SaveForm({ title, children, build, onClose }: { title: string; children: ReactNode; build: (data: FormData) => Proposal; onClose: () => void }) {
  const { save, busy, demo, shop } = useShop(); const [baseRevision] = useState(shop!.state.revision); const [dirty, setDirty] = useState(false); const [error, setError] = useState('');
  const [review, setReview] = useState<(Proposal & { op: Operation }) | null>(null);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    try { const proposal = build(new FormData(e.currentTarget)); setReview({ ...proposal, op: { ...proposal.operation, id: uid(), at: new Date().toISOString() } as Operation }); }
    catch (e) { setError(e instanceof Error ? e.message : '请检查填写内容。'); }
  }
  async function confirm(exportAfter: boolean) {
    if (!review) return; setError('');
    try { await save(review.op, exportAfter, baseRevision); onClose(); } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
  }
  return <Modal title={review ? '核对一下，再保存' : title} onClose={busy ? () => {} : onClose} dirty={dirty}>
    <form onSubmit={submit} onChange={() => setDirty(true)}>
      <div className="modal-body" hidden={!!review}>{children}</div>
      {review && <div className="modal-body"><p className="muted">请确认以下内容，本次操作会保留记录。</p><dl className="review-list">{review.summary.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{review.warning && <div className="notice amber"><AlertTriangle size={20}/><span>{review.warning}</span></div>}</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-foot">{review ? <><button type="button" className="btn" disabled={busy} onClick={() => setReview(null)}><ArrowLeft size={17}/>返回修改</button><button type="button" className="btn primary" disabled={busy} onClick={() => void confirm(false)}><Check size={17}/>{busy ? '正在保存…' : '确认保存'}</button>{!demo && <button type="button" className="btn save-export" disabled={busy} onClick={() => void confirm(true)}>保存并导出备份</button>}</> : <><span className="small muted">填写后请核对，确认才保存</span><button className="btn primary" type="submit">核对并保存</button></>}</div>
    </form>
  </Modal>;
}
