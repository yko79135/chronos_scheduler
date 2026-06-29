import { expect, test } from '@playwright/test';

const solverDisabled = 'Scheduler engine is temporarily disabled while correctness validation is completed.';

test('production preview boots and imports uploaded CSV files', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedAssets: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    expect(request.url()).not.toContain('/src/main.ts');
  });
  page.on('response', (response) => {
    const url = response.url();
    if (/\/assets\/.*\.(js|css)(\?|$)/.test(url) && !response.ok()) failedAssets.push(`${response.status()} ${url}`);
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Chronos Scheduler');
  await expect(page.getByRole('heading', { name: 'Chronos Scheduler' })).toBeVisible();
  await expect(page.locator('#classes')).toHaveCount(1);
  await expect(page.locator('#constraints')).toHaveCount(1);
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.getByText(solverDisabled)).toBeVisible();

  await page.locator('#classes').setInputFiles('수업_목록 (2).csv');
  await expect(page.getByText('class rows imported')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'class rows imported' }).getByText('65')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'inferred meetings' }).getByText('97')).toBeVisible();

  await page.locator('#constraints').setInputFiles('스케줄_제약_템플릿.csv');
  await expect(page.locator('.card', { hasText: 'excluded constraint rows' }).getByText('13')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'active strict constraints' }).getByText('0')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'active availability constraints' }).getByText('0')).toBeVisible();
  await expect(page.getByText(solverDisabled)).toBeVisible();

  expect(failedAssets).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
