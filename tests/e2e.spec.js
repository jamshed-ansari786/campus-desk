const { test, expect } = require("@playwright/test");

test.describe("Student Management System E2E Workflow", () => {
  test("1. Landing page loads with branding and navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CampusDesk/);
    await expect(page.locator(".brand-name")).toContainText("CampusDesk");
    await expect(page.locator("a[href='/login']").first()).toBeVisible();
    await expect(page.locator("a[href='/signup']").first()).toBeVisible();
  });

  test("2. Login page renders role options and forms", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Login/);
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("3. Admin Login page loads properly", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveTitle(/Admin Login/);
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
  });

  test("4. Protected route redirection for unauthenticated access", async ({ page }) => {
    // Attempt visiting admin dashboard directly
    await page.goto("/admin");
    await expect(page).toHaveURL(/.*login.*/);

    // Attempt visiting teacher dashboard directly
    await page.goto("/teacher");
    await expect(page).toHaveURL(/.*login.*/);

    // Attempt visiting student dashboard directly
    await page.goto("/student");
    await expect(page).toHaveURL(/.*login.*/);

    // Attempt visiting chat directly
    await page.goto("/chat");
    await expect(page).toHaveURL(/.*login.*/);
  });

  test("5. Theme toggle switch interacts cleanly", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page.locator("#themeToggleBtn");
    await expect(themeBtn).toBeVisible();
    
    // Check initial light mode
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    
    // Toggle to dark mode
    await themeBtn.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    
    // Toggle back to light mode
    await themeBtn.click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("Guest pages do not start authenticated Socket.IO connections", async ({ page }) => {
    const socketRequests = [];
    page.on("websocket", (webSocket) => {
      if (webSocket.url().includes("/socket.io/")) socketRequests.push(webSocket.url());
    });

    await page.goto("/");
    await expect(page.locator("body")).toHaveAttribute("data-authenticated", "false");
    await page.waitForTimeout(1200);
    expect(socketRequests).toHaveLength(0);
  });

  test("6. Dark theme keeps admin, login, and signup pages readable", async ({ page }) => {
    await page.goto("/");
    await page.locator("#themeToggleBtn").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() => page.locator(".home-hero").evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(23, 32, 51)");

    for (const path of ["/login", "/signup", "/admin/login"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect
        .poll(() => page.locator("main.page").evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe("rgb(11, 17, 32)");
      await expect(page.locator(".admin-auth-form")).toBeVisible();
      await expect(page.locator(".admin-auth-form")).toHaveCSS("background-color", "rgb(17, 28, 50)");
    }

    await expect(page.getByRole("link", { name: /Student & teacher portal/ })).toBeVisible();
    await page.evaluate(() => {
      document.body.classList.remove("auth-page", "admin-login-page", "portal-app");
      document.body.classList.add("admin-app");
      document.querySelector("main.page").insertAdjacentHTML(
        "beforeend",
        '<section class="card bg-body theme-regression-card"><p class="text-muted theme-regression-muted">Admin theme</p></section>',
      );
    });

    const adminCard = page.locator(".theme-regression-card");
    const adminMutedText = page.locator(".theme-regression-muted");
    await expect(adminCard).toHaveCSS("background-color", "rgb(17, 28, 50)");
    await expect(adminMutedText).toHaveCSS("color", "rgb(167, 181, 202)");

    await page.locator("#themeToggleBtn").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(adminCard).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(adminMutedText).toHaveCSS("color", "rgb(100, 116, 139)");
  });

  test("7. Admin navigation sits higher and keeps its groups on one desktop row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.evaluate(() => {
      document.body.classList.remove("home-page", "portal-app");
      document.body.classList.add("admin-app");
      document.querySelector("main.page").innerHTML = `
        <div class="admin-shell">
          <aside class="admin-sidebar">
            <nav id="admin-navigation">
              ${["Overview", "Institution", "Academics", "People & Roles", "Operations", "Reports & Logs"]
                .map((label) => `<div class="admin-nav-section"><button class="admin-nav-group">${label}</button></div>`)
                .join("")}
            </nav>
          </aside>
          <section class="admin-content"></section>
        </div>`;
    });

    const nav = page.locator("#admin-navigation");
    const groups = page.locator(".admin-nav-group");
    const layout = await nav.evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      topPositions: [...element.querySelectorAll(".admin-nav-group")].map((group) =>
        Math.round(group.getBoundingClientRect().top),
      ),
      shellMarginTop: getComputedStyle(element.closest(".admin-shell")).marginTop,
    }));

    expect(layout.columns).toBe(6);
    expect(new Set(layout.topPositions).size).toBe(1);
    expect(layout.shellMarginTop).toBe("12px");
    await expect(groups).toHaveCount(6);
  });
});
