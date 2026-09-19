import { test, expect } from '@playwright/test';

test('connection status follows going offline and reconnecting without an edit', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '添加第一个商品', exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.getByText('当前离线，仍可在本机记录和导出。', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('当前离线，仍可在本机记录和导出。', { exact: true })).toBeHidden();
});

test('accidental close followed by continue preserves all unsaved product fields', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一个商品', exact: true }).click();
  await page.getByLabel('商品名称', { exact: true }).fill('待保存的矿泉水');
  await page.getByLabel('规格', { exact: true }).fill('550mL');
  await page.getByLabel(/^一箱有多少/).fill('12');
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await expect(page.getByRole('dialog')).toContainText('还有未提交的内容');
  await page.getByRole('button', { name: '继续填写', exact: true }).click();
  await expect(page.getByLabel('商品名称', { exact: true })).toHaveValue('待保存的矿泉水');
  await expect(page.getByLabel('规格', { exact: true })).toHaveValue('550mL');
  await expect(page.getByLabel(/^一箱有多少/)).toHaveValue('12');
  await page.getByRole('button', { name: '核对并保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1箱 = 12瓶');
  await page.getByRole('button', { name: '返回修改', exact: true }).click();
  await expect(page.getByLabel('商品名称', { exact: true })).toHaveValue('待保存的矿泉水');
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '放弃本次填写', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: '添加第一个商品', exact: true })).toBeVisible();
});
