import { chromium } from "playwright";
import fs from "node:fs";

const SERVICE_ID = "351180";
const LOCATION_ID = process.argv[2] || "351435";

const START_URL =
  `https://service.berlin.de/dienstleistung/${SERVICE_ID}/standort/${LOCATION_ID}/`;

const PROVIDER_PATH =
  `/terminvereinbarung/termin/provider/${LOCATION_ID}/${SERVICE_ID}/`;

const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({
  locale: "de-DE",
  timezoneId: "Europe/Berlin"
});

const page = await context.newPage();

function setOutput(status, finalUrl) {
  console.log("STATUS:", status);
  console.log("URL:", finalUrl);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `status=${status}\nfinal_url=${finalUrl}\n`
    );
  }
}

try {
  console.log("1. Standortseite öffnen");

  await page.goto(START_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  console.log("Startseite:", page.url());

  // -------------------------------------------------
  // 2. ECHTER KLICK auf den Buchungslink
  // -------------------------------------------------

  const bookingLink = page
    .locator(`a[href*="${PROVIDER_PATH}"]`)
    .first();

  await bookingLink.waitFor({
    state: "visible",
    timeout: 15000
  });

  console.log(
    "Buchungslink gefunden:",
    await bookingLink.getAttribute("href")
  );

  console.log("2. Klicke Buchungslink");

  await bookingLink.click();

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  console.log("Nach Klick 1:", page.url());

  // -------------------------------------------------
  // Wartung erkennen
  // -------------------------------------------------

  const bodyText = await page.locator("body").innerText();

  if (
    /Terminverwaltung wird momentan gewartet/i.test(bodyText) ||
    /Bitte probieren Sie es zu einem späteren Zeitpunkt erneut/i.test(bodyText)
  ) {
    console.log("Berlin.de Terminverwaltung befindet sich in Wartung.");

    setOutput("MAINTENANCE", page.url());
    process.exitCode = 0;

  } else {

    // -------------------------------------------------
    // Es muss jetzt die Zeit-/Tage-Auswahl kommen
    // -------------------------------------------------

    if (
      !page.url().includes(
        "/terminvereinbarung/termin/time/restriction/"
      )
    ) {
      throw new Error(
        `Unerwartete Seite nach Klick 1: ${page.url()}`
      );
    }

    console.log("3. Restriction-Seite erreicht");

    // -------------------------------------------------
    // 4. ECHTER KLICK auf "Buchbare Tage anzeigen"
    // -------------------------------------------------

    const daysButton = page
      .locator(
        'button:has-text("Buchbare Tage anzeigen"), input[type="submit"][value*="Buchbare Tage anzeigen"]'
      )
      .first();

    console.log("Warte auf 'Buchbare Tage anzeigen'");

    await daysButton.waitFor({
      state: "visible",
      timeout: 30000
    });

    console.log("4. Klicke 'Buchbare Tage anzeigen'");

    await daysButton.click();

    await page.waitForURL(
      /\/terminvereinbarung\/termin\/(day|taken)\//,
      { timeout: 30000 }
    );

    const finalUrl = page.url();

    console.log("Ergebnis:", finalUrl);

    if (finalUrl.includes("/termin/day/")) {
      setOutput("AVAILABLE", finalUrl);

    } else if (finalUrl.includes("/termin/taken/")) {
      setOutput("NONE", finalUrl);

    } else {
      throw new Error(
        `Unbekannte Ergebnis-Seite: ${finalUrl}`
      );
    }
  }

} catch (error) {
  console.error("CHECK FEHLGESCHLAGEN");
  console.error(error);

  process.exitCode = 1;

} finally {
  await context.close();
  await browser.close();
}
