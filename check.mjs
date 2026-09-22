import { chromium } from "playwright";
import fs from "node:fs";

const START_URL =
  "https://service.berlin.de/dienstleistung/351180/standort/351435/";

const browser = await chromium.launch({
  headless: true
});

async function runAttempt(attempt) {
  const context = await browser.newContext({
    locale: "de-DE",
    timezoneId: "Europe/Berlin"
  });

  const page = await context.newPage();

  try {
    console.log(`===== Versuch ${attempt}/3 =====`);

    // 1. Standortseite öffnen
    console.log("1. Standortseite öffnen");

    await page.goto(START_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(2000);

    console.log("Start-URL:", page.url());

    // 2. Ersten Link wirklich anklicken
    console.log(
      "2. Suche 'An diesem Standort einen Termin buchen'"
    );

    let bookingLink = page
      .locator(
        'a[href*="/terminvereinbarung/termin/provider/351435/351180/"]'
      )
      .first();

    if ((await bookingLink.count()) === 0) {
      bookingLink = page
        .getByRole("link", {
          name: /An diesem Standort einen Termin buchen/i
        })
        .first();
    }

    await bookingLink.waitFor({
      state: "visible",
      timeout: 20000
    });

    console.log(
      "Buchungslink gefunden:",
      await bookingLink.getAttribute("href")
    );

    await bookingLink.scrollIntoViewIfNeeded();
    await bookingLink.click();

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    console.log("Nach Klick 1:", page.url());

    // 3. Zweiten Button wirklich anklicken
    console.log("3. Suche 'Buchbare Tage anzeigen'");

    let daysButton = page
      .getByRole("button", {
        name: /Buchbare Tage anzeigen/i
      })
      .first();

    if ((await daysButton.count()) === 0) {
      daysButton = page
        .locator(
          'input[type="submit"][value*="Buchbare Tage anzeigen"]'
        )
        .first();
    }

    await daysButton.waitFor({
      state: "visible",
      timeout: 20000
    });

    await daysButton.scrollIntoViewIfNeeded();

    console.log("Klicke 'Buchbare Tage anzeigen'");

    await daysButton.click();

    await page
      .waitForURL(
        /\/terminvereinbarung\/termin\/(day|taken)\//,
        { timeout: 30000 }
      )
      .catch(() => {});

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500);

    // 4. Ergebnis
    const finalUrl = page.url();
    const bodyText = await page.locator("body").innerText();

    console.log("Ergebnis-URL:", finalUrl);

    let status;

    if (finalUrl.includes("/termin/day/")) {
      status = "AVAILABLE";
    } else if (
      finalUrl.includes("/termin/taken/") ||
      /Leider sind aktuell keine Termine für ihre Auswahl verfügbar/i.test(
        bodyText
      )
    ) {
      status = "NONE";
    } else {
      throw new Error(
        `Unbekanntes Ergebnis: ${finalUrl}`
      );
    }

    console.log("STATUS:", status);

    return {
      status,
      finalUrl
    };

  } finally {
    await context.close();
  }
}

let result;
let lastError;

try {
  // Bei einem temporären Fehler wird der komplette
  // Ablauf mit beiden echten Klicks neu gestartet.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await runAttempt(attempt);
      break;
    } catch (error) {
      lastError = error;

      console.error(
        `Versuch ${attempt} fehlgeschlagen:`,
        error.message
      );

      if (attempt < 3) {
        console.log(
          "Warte 5 Sekunden und starte komplett neu ..."
        );

        await new Promise(resolve =>
          setTimeout(resolve, 5000)
        );
      }
    }
  }

  if (!result) {
    throw lastError;
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `status=${result.status}\nfinal_url=${result.finalUrl}\n`
    );
  }

  console.log("===== ERFOLGREICH =====");
  console.log("STATUS:", result.status);
  console.log("URL:", result.finalUrl);

} catch (error) {
  console.error("===== FEHLGESCHLAGEN =====");
  console.error(error);

  process.exitCode = 1;

} finally {
  await browser.close();
}
