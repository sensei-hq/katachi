import { test, expect } from '@playwright/test';

// Annotations without a craft: the empty state (checks themselves are unit-covered in annotate.spec.ts).
test('annotations explains itself with no craft open', async ({ page }) => {
  await page.goto('/annotations');
  await expect(page.getByText('Open a craft to see its checks')).toBeVisible();
});
