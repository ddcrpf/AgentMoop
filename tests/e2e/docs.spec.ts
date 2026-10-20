import { test, expect } from '@playwright/test';

test('docs index is public and links to every page', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AgentMoop docs');
  const nav = page.getByRole('navigation', { name: 'Docs' });
  for (const slug of ['claude-code', 'codex', 'claude-app', 'sharing', 'friends', 'privacy', 'troubleshooting'])
    await expect(nav.locator(`a[href="/docs/${slug}"]`)).toHaveCount(1);
});

test('Claude Code page shows the install command', async ({ page }) => {
  await page.goto('/docs/claude-code');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Claude Code');
  await expect(page.getByText('/plugin install agentmoop@agentmoop', { exact: true })).toBeVisible();
});

test('unknown docs page goes to the docs index', async ({ page }) => {
  await page.goto('/docs/nope');
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AgentMoop docs');
});
