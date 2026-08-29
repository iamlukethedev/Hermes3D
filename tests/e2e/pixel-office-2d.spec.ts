import { expect, test } from "@playwright/test";
import { stubStudioRoute } from "./helpers/studioRoute";

// The pixel office is forced on through the persisted render-mode preference,
// exactly how a low-power user would have it configured.
test("renders the 2D pixel office when the preference is set", async ({ page }) => {
  await stubStudioRoute(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("hermes-office-render-mode-v1", "2d");
  });
  await page.goto("/office");

  await expect(page.getByText("2D PIXEL")).toBeVisible();
  await expect(page.getByTitle("Switch to the 3D office")).toBeVisible();
  await expect(page.getByTitle("Studio settings")).toBeVisible();
  // Phaser mounts a canvas inside the pixel office root.
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
});

test("switches back to the 3D office from the pixel HUD", async ({ page }) => {
  await stubStudioRoute(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("hermes-office-render-mode-v1", "2d");
  });
  await page.goto("/office");

  await expect(page.getByText("2D PIXEL")).toBeVisible();
  await page.getByTitle("Switch to the 3D office").click();
  await expect(page.getByText("2D PIXEL")).toHaveCount(0);
  const storedMode = await page.evaluate(() =>
    window.localStorage.getItem("hermes-office-render-mode-v1"),
  );
  expect(storedMode).toBe("3d");
});
