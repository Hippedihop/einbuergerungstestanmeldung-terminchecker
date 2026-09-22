import { chromium } from "playwright";
import fs from "node:fs";

const START_URL =
  "https://service.berlin.de/dienstleistung/351180/standort/351435/";

const ENTRY_URL =
  "https://service.berlin.de/terminvereinbarung/termin/tag.php?termin=1&anliegen%5B%5D=351180&dienstleister%5B%5D=351435";

const browser = await chromium.launch({
  headless: true
});

const context = await browser.newContext({
  locale: "de-DE",
  timezoneId: "Europe/Berlin"
});

const page = await context.newPage();

try {
  console.log("1. Standortseite öffnen");

  await page.goto(START_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  console.log("Startseite:", page.url());

  // Kontrollieren, dass der gewünschte Standort dort
  // tatsächlich als buchbar angeboten wird.
  const bookingLink = page
    .locator(
      'a[href*="/terminvereinbarung/termin/provider/351435/351180/"]'
    )
    .first();

  await bookingLink.waitFor({
    state: "visible",
    timeout: 15000
  });

  console.log(
    "Standort-Link gefunden:",
    await bookingLink.getAttribute("href")
  );

  // Dienstleistung 351180 + Standort 351435 werden hier
  // ausdrücklich an das Berliner Termin-System übergeben.
  console.log("2. Standort und Dienstleistung an Termin-System übergeben");

  await page.goto(ENTRY_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  console.log("Nach Auswahl:", page.url());

  if (
    !page.url().includes(
      "/terminvereinbarung/termin/time/restriction/"
    )
  ) {
    throw new Error(
      `Erwartete Restriction-Seite nicht erreicht: ${page.url()}`
    );
  }

  console.log("3. Zeit-Auswahl prüfen");

  const checkboxes = page.locator('input[name="zeit[]"]');
  const count = await checkboxes.count();

  console.log("Gefundene Zeitoptionen:", count);

  if (count < 8) {
    throw new Error(
      `Zu wenige Zeitoptionen gefunden: ${count}`
    );
  }

  // Montag-Samstag sowie vormittags/nachmittags auswählen.
  for (let i = 0; i < count; i++) {
    const checkbox = checkboxes.nth(i);

    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }
  }

  const form = page
    .locator('form:has(input[name="zeit[]"])')
    .first();

  const submitButton = form
    .locator('button[type="submit"], input[type="submit"]')
    .first();

  await submitButton.waitFor({
    state: "visible",
    timeout: 15000
  });

  console.log("4. Klicke 'Buchbare Tage anzeigen'");

  await Promise.all([
    page.waitForURL(
      /\/terminvereinbarung\/termin\/(day|taken)\//,
      { timeout: 30000 }
    ),
    submitButton.click()
  ]);

  const finalUrl = page.url();

  console.log("Ergebnis-URL:", finalUrl);

  let status;

  if (finalUrl.includes("/termin/day/")) {
    status = "AVAILABLE";
  } else if (finalUrl.includes("/termin/taken/")) {
    status = "NONE";
  } else {
    throw new Error(
      `Unbekannte Ergebnis-Seite: ${finalUrl}`
    );
  }

  console.log("STATUS:", status);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `status=${status}\nfinal_url=${finalUrl}\n`
    );
  }

} catch (error) {
  console.error("CHECK FEHLGESCHLAGEN");
  console.error(error);
  process.exitCode = 1;

} finally {
  await context.close();
  await browser.close();
}
