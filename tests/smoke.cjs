/* Run against a local or deployed static demo; no server data is modified. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.argv[2] || "http://127.0.0.1:8765/";
const output =
  process.env.DEMO_SCREENSHOTS || path.join(__dirname, "..", "artifacts");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [],
    badResponses = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });
  const action = (name) =>
    page.locator(`[data-action="${name}"]:visible`).first().click();
  const step = (name) => page.locator(`[data-step="${name}"]`).click();
  const submit = (name) =>
    page.locator(`#${name} button[type="submit"]`).click();
  const waitForRun = () =>
    page.waitForFunction(
      () =>
        document.querySelector(".card-heading .tag")?.textContent ===
        "모의 실행 완료",
      {},
      { timeout: 15000 },
    );
  const snapshot = (name) =>
    page.screenshot({
      path: path.join(output, name),
      fullPage: true,
      animations: "disabled",
      style: ".toast { visibility: hidden !important; }",
    });
  await page.goto(base, { waitUntil: "networkidle" });
  await action("reset");
  assert.equal(await page.locator("tr[data-select]").count(), 3);
  await snapshot("01-mounting-desktop.png");
  const canvasPixels = await page.locator("canvas").evaluate((c) => {
    const g = c.getContext("2d"),
      p = g.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < p.length; i += 400)
      colors.add(`${p[i]},${p[i + 1]},${p[i + 2]}`);
    return colors.size;
  });
  assert(canvasPixels > 20, "3D viewer must render a nonempty concept model");
  await page.locator('[data-view="top"]').click();
  await page.locator('[data-camera="reset"]').click();
  await page.locator('#mount-form input[name="offset0"]').fill("0.25");
  await submit("mount-form");
  assert(
    (await page.locator("#viewport-selection").textContent()).includes("1.75"),
  );
  await action("add-antenna");
  await page.locator('#add-form input[name="name"]').fill("ANT_TEST");
  await page.locator('#add-form select[name="model"]').selectOption("wideband");
  await submit("add-form");
  assert.equal(await page.locator("tr[data-select]").count(), 4);
  await action("remove-antenna");
  assert.equal(await page.locator("tr[data-select]").count(), 3);
  await action("build-base");
  await page.locator('[data-action="goto-analysis"]').waitFor();
  await step("analysis");
  await page.locator('input[name="frequency"]').fill("bad, 30");
  await submit("analysis-form");
  assert((await page.locator("#form-error").textContent()).length > 0);
  await page.locator('input[name="frequency"]').fill("30:150:5, 225, 300, 400");
  await submit("analysis-form");
  await step("cases");
  await page.locator('input[name="edges"]').fill("50,100,400");
  await submit("case-form");
  assert(
    (await page.locator("#form-error").textContent()).includes(
      "모든 계산 주파수",
    ),
  );
  await page.locator('input[name="edges"]').fill("30,100,200,400");
  await submit("case-form");
  assert.equal(await page.locator("[data-case-include]").count(), 3);
  await page.locator("[data-case-include]").first().uncheck();
  await page.locator("[data-case-include]").first().check();
  await page.locator('select[name="ratio"]').selectOption("1");
  await action("auto-frequency");
  assert.equal(await page.locator("[data-case-include]").count(), 8);
  await page.locator('input[name="edges"]').fill("30,100,200,400");
  await submit("case-form");
  for (let i = 0; i < 3; i++)
    await page.locator("[data-case-include]").nth(i).uncheck();
  assert.equal(
    await page
      .locator('[data-step="generate"]')
      .evaluate((b) => b.classList.contains("complete")),
    false,
  );
  for (let i = 0; i < 3; i++)
    await page.locator("[data-case-include]").nth(i).check();
  await page.locator("summary").click();
  assert((await page.locator("details").textContent()).includes("MAIN 관계"));
  await snapshot("02-case-plan-desktop.png");
  await step("generate");
  await action("generate");
  await page.locator('[data-action="goto-run"]:not([disabled])').waitFor();
  assert.equal(await page.getByText("DEMO PASS", { exact: true }).count(), 3);
  const downloadEvent = page.waitForEvent("download");
  await action("manifest");
  const download = await downloadEvent;
  const manifest = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.equal(manifest.demo_only, true);
  assert.equal(manifest.cases.length, 3);
  assert(manifest.cases.every((c) => c.ports.length === 3));
  assert.equal(new Set(manifest.cases.flatMap((c) => c.frequencies)).size, 8);
  await step("run");
  await action("run-start");
  await waitForRun();
  assert.equal(await page.locator(".run-state.completed").count(), 3);
  await snapshot("03-run-complete-desktop.png");
  await page.locator("#run-scenario").selectOption("failure");
  await action("run-start");
  await waitForRun();
  assert.equal(await page.locator(".run-state.failed").count(), 1);
  assert.equal(await page.locator(".run-state.completed").count(), 2);
  assert(
    (await page.locator("#run-log").textContent()).includes(
      "다음 Case로 계속 진행",
    ),
  );
  await page.locator("#run-scenario").selectOption("hang");
  await action("run-start");
  await waitForRun();
  assert(
    (await page.locator("#run-log").textContent()).includes("after-results"),
  );
  await page.locator("#run-scenario").selectOption("normal");
  await action("run-start");
  await page.waitForTimeout(450);
  await action("run-stop");
  await page.locator('[data-action="run-start"]:not([disabled])').waitFor();
  assert.equal(await page.locator(".run-state.completed").count(), 1);
  await action("run-start");
  await waitForRun();
  assert.equal(await page.locator(".run-state.completed").count(), 3);
  await page.reload({ waitUntil: "networkidle" });
  await step("mounting");
  assert.equal(
    await page.locator('#mount-form input[name="offset0"]').inputValue(),
    "0.25",
  );
  await action("tour");
  await waitForRun();
  assert.equal(await page.locator(".run-state.completed").count(), 3);
  await action("reset");
  await context.setOffline(true);
  await step("project");
  await page.locator('input[name="projectName"]').fill("<b>public sample</b>");
  await submit("project-form");
  assert.equal(
    await page.locator("#project-label").textContent(),
    "<b>public sample</b>",
  );
  assert.equal(await page.locator("#project-label b").count(), 0);
  await context.setOffline(false);
  await action("reset");
  await page.setViewportSize({ width: 390, height: 844 });
  await snapshot("04-mounting-mobile.png");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile page must not horizontally overflow",
  );
  await action("help");
  assert(await page.locator("dialog").isVisible());
  await action("close-modal");
  assert.deepEqual(errors, [], "No browser JavaScript errors");
  assert.deepEqual(badResponses, [], "No failed asset responses");
  await browser.close();
  console.log(
    JSON.stringify(
      {
        result: "passed",
        url: base,
        checks: [
          "mounting",
          "viewer",
          "input validation",
          "frequency coverage",
          "generation",
          "JSON download",
          "normal run",
          "failure continuation",
          "hang recovery",
          "stop/resume",
          "persistence",
          "quick tour",
          "escaping",
          "mobile layout",
          "help",
        ],
        screenshots: output,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
