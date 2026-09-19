export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
export const unitPrice = (cents: number, size: number) => `¥${(cents / size / 100).toFixed(2)}`;
export const dateLabel = (date?: string | null) => date ? date.slice(0, 10).replaceAll('-', '.') : '尚未核对';
export const timeLabel = (date?: string | null) => date ? new Date(date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '暂无记录';
export const centsFrom = (value: FormDataEntryValue | null) => {
  const s = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('金额请填写非负数字，最多两位小数。');
  const [whole, fraction = ''] = s.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 100000000) throw new Error('金额过大，请检查输入。');
  return result;
};
export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
