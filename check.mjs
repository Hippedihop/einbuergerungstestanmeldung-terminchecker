import { chromium } from "playwright";
import fs from "node:fs";

const START_URL =
  "https://service.berlin.de/dienstleistung/351180/standort/351435/";

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();

  console.log("Öffne Startseite ...");

  await page.goto(START_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  console.log("Klicke auf Termin buchen ...");

  await page
    .getByRole("link", {
      name: /An diesem Standort einen Termin buchen/i
    })
    .click();

  await page.waitForLoadState("domcontentloaded");

  console.log("Zwischenseite:", page.url());

  console.log("Klicke auf Buchbare Tage anzeigen ...");

  await page
    .getByRole("button", {
      name: /Buchbare Tage anzeigen/i
    })
    .click();

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  const finalUrl = page.url();
  const bodyText = await page.locator("body").innerText();

  console.log("Ergebnis-URL:", finalUrl);

  let status = "UNKNOWN";

  if (finalUrl.includes("/termin/day/")) {
    status = "AVAILABLE";
  } else if (
    finalUrl.includes("/termin/taken/") ||
    /Leider sind aktuell keine Termine für ihre Auswahl verfügbar/i.test(bodyText)
  ) {
    status = "NONE";
  }

  console.log("STATUS:", status);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `status=${status}\nfinal_url=${finalUrl}\n`
    );
  }

  if (status === "UNKNOWN") {
    console.error("Unbekanntes Ergebnis.");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Fehler beim Prüfen:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
