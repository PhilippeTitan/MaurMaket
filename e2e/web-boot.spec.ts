import { test, expect } from '@playwright/test';

// UI smoke: proves the exported web app actually renders in a real browser.
// Screenshot lands in test-results as a pipeline artifact for visual review.
// (Pixel-diff baselines come next once this rig is proven green in CI.)

test('web app boots and renders the app shell', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The app must produce visible content (not a blank white page / crash loop)
  await expect(page.locator('body')).toBeVisible();
  await page.waitForTimeout(4000); // let RN-web hydrate + first paint settle
  const bodyText = (await page.locator('body').innerText()).trim();
  const canvasCount = await page.locator('canvas').count();
  const rootHtmlLength = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);

  await page.screenshot({ path: 'test-results/web-app-boot.png', fullPage: true });

  const rendered = bodyText.length > 0 || canvasCount > 0 || rootHtmlLength > 100;
  expect(
    rendered,
    `App did not render. bodyText=${bodyText.length} canvas=${canvasCount} rootHtml=${rootHtmlLength} pageErrors=${pageErrors.slice(0, 3).join(' | ')}`,
  ).toBe(true);
});
