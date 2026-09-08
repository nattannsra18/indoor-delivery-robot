import { expect, test } from "@playwright/test";

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "E2E-Admin-Password-2026";

test("account request, admin approval, user sign-in, and role redirect", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const username = `e2e-${suffix}`;
  const email = `${username}@example.test`;
  const password = "Portfolio-E2E-2026";

  await page.goto("/signup");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Confirm email").fill(email);
  await page.getByLabel("Username").fill(username);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByRole("button", { name: "Submit account request" }).click();
  await expect(page.getByRole("heading", { name: "Account request received" })).toBeVisible();

  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByLabel("Email or username").fill(adminUsername);
  await page.locator('input[type="password"]').fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations Overview" })).toBeVisible();

  await page.goto("/users");
  const request = page.getByRole("listitem").filter({ hasText: username });
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "Approve account" }).click();
  await expect(page.getByText(`${username} can now sign in.`, { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Logout/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email or username").fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: `Welcome back, ${username}!` })).toBeVisible();

  await page.goto("/maps");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Map Management" })).toHaveCount(0);
});

test("public authentication routes render and link together", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Request an account" })).toBeVisible();
});

test("administrator pairs and revokes an individual robot credential", async ({ page }) => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  const enrollmentToken = process.env.ROBOT_ENROLLMENT_TOKEN ?? "E2E-Robot-Enrollment-Token-2026";
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const fingerprint = `sha256:e2e-fleet-${suffix}`;

  const enrollmentResponse = await page.request.post(`${apiBaseUrl}/api/robot-registry/enrollments`, {
    headers: { Authorization: `Bearer ${enrollmentToken}` },
    data: {
      serial_number: `E2E-FLEET-${suffix}`,
      hardware_fingerprint: fingerprint,
      display_name: `E2E Fleet Robot ${suffix}`,
      agent_version: "0.5.0",
      ros_distro: "jazzy",
      profile_version: "e2e-fleet-v1",
      capabilities: ["navigation", "localization", "diagnostics"],
    },
  });
  expect(enrollmentResponse.ok()).toBeTruthy();
  const enrollment = await enrollmentResponse.json();

  await page.goto("/login");
  await page.getByLabel("Email or username").fill(adminUsername);
  await page.locator('input[type="password"]').fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations Overview" })).toBeVisible();

  await page.goto("/robots");
  const request = page.getByRole("listitem").filter({ hasText: `E2E Fleet Robot ${suffix}` });
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "Verify & approve" }).click();
  await page.getByLabel("Pairing code").fill(enrollment.pairing_code);
  await page.getByRole("button", { name: "Approve pairing" }).click();
  await expect(page.getByText("Pairing approved", { exact: true })).toBeVisible();

  const claimResponse = await page.request.post(
    `${apiBaseUrl}/api/robot-registry/enrollments/${enrollment.enrollment_id}/claim`,
    { data: { pairing_code: enrollment.pairing_code, hardware_fingerprint: fingerprint } },
  );
  expect(claimResponse.ok()).toBeTruthy();

  await page.reload();
  const robot = page.getByRole("listitem").filter({ hasText: `E2E Fleet Robot ${suffix}` });
  await expect(robot.getByText("Paired", { exact: true })).toBeVisible();
  await robot.getByRole("button", { name: "Revoke credential" }).click();
  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText("Robot access revoked", { exact: true })).toBeVisible();
  await expect(robot.getByText("Revoked", { exact: true })).toBeVisible();
});
