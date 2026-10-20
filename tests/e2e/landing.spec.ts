import { test, expect } from '@playwright/test';

test('hero states the problem and the demo sends a moop to Maya', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stop pasting your terminal into Slack.');
  await expect(page.getByRole('link', { name: 'Get your moop tag', exact: true }).first()).toHaveAttribute('href', /\/sign-up$/);

  const demo = page.getByRole('region', { name: 'Interactive demo' });
  const prompt = demo.getByRole('textbox', { name: 'Demo prompt' });
  await expect(prompt).not.toBeFocused();
  await prompt.fill('@maya hi');
  await prompt.press('Enter');
  await expect(demo.getByText('Sent to @maya')).toBeVisible();
  await expect(demo.getByRole('region', { name: "Maya's terminal" }).locator('.demo-card')).toContainText('you: hi');
  await expect(demo.locator('.demo-you .demo-card')).toContainText('maya: On it. The token check skips expired sessions');
});

test('plain text at the demo prompt gets the canned Claude answer', async ({ page }) => {
  await page.goto('/');
  const prompt = page.getByRole('textbox', { name: 'Demo prompt' });
  await prompt.fill('why is login failing?');
  await prompt.press('Enter');
  await expect(page.locator('.demo-you')).toContainText("I can look into that. If you want a teammate's eyes, type @maya");
  await expect(page.locator('.demo-maya .demo-card')).toHaveCount(0);
});

test('mobile landing has no horizontal overflow and keeps the prompt reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBe(width.client);
  const prompt = page.getByRole('textbox', { name: 'Demo prompt' });
  await prompt.scrollIntoViewIfNeeded();
  await expect(prompt).toBeInViewport();
});

test('background is present and hidden from assistive tech with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const background = page.locator('.lp-bg');
  await expect(background).toHaveCount(1);
  await expect(background).toHaveAttribute('aria-hidden', 'true');
  await expect(background.locator('canvas')).toHaveCount(1);
});

test('landing links into the app on the same origin', async ({ page, baseURL }) => {
  await page.goto('/');
  const origin = new URL(baseURL!).origin;
  await expect(page.getByRole('link', { name: 'Get your moop tag', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read the docs', exact: true })).toHaveAttribute('href', /\/docs$/);
  const hrefs = await page.locator('a[href]').evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
  expect(hrefs.some(h => h.includes('989909'))).toBe(false);
  expect(hrefs.some(h => h.startsWith(origin + '/app') || h.startsWith(origin + '/sign'))).toBe(true);
});
