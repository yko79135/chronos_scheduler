import { expect, test } from '@playwright/test';

test('production preview validates conflicting constraints and solves corrected real files', async ({ page }) => {
  const consoleErrors: string[] = [], pageErrors: string[] = [], failedAssets: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('request', request => expect(request.url()).not.toContain('/src/main.ts'));
  page.on('response', response => { const url=response.url(); if (/\/assets\/.*\.(js|css)(\?|$)/.test(url) && !response.ok()) failedAssets.push(`${response.status()} ${url}`); });
  await page.goto('/'); await expect(page).toHaveTitle('Chronos Scheduler');
  await page.locator('#classes').setInputFiles('수업_목록 (2)(1).csv');
  await expect(page.locator('.card', { hasText: 'class rows imported' }).getByText('65')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'inferred meetings' }).getByText('97')).toBeVisible();
  await page.locator('#constraints').setInputFiles('populated_constraints.csv');
  await expect(page.locator('#generate')).toBeDisabled();
  await expect(page.getByText('Fixed-placement conflict at Monday period 1')).toBeVisible();
  await expect(page.getByText('Grade G4')).toBeVisible(); await expect(page.getByText('Teacher 이은총')).toBeVisible(); await expect(page.getByText('Room Love')).toBeVisible();
  await page.locator('#constraints').setInputFiles('populated_constraints_no_conflicting_strict.csv');
  await expect(page.locator('#generate')).toBeEnabled();
  await page.locator('#generate').click();
  await expect(page.getByText('assigned meetings')).toBeVisible({ timeout: 120000 });
  await expect(page.locator('.card', { hasText: 'assigned meetings' }).getByText('97/97')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'grade conflicts' }).getByText('0')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'teacher conflicts' }).getByText('0')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'room conflicts' }).getByText('0')).toBeVisible();
  expect(failedAssets).toEqual([]); expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
});
