import puppeteer from 'puppeteer';

export interface AutomatedPaymentResult {
  success: boolean;
  error?: string;
  paymentMode: 'HEADLESS_BROWSER' | 'MANUAL_FALLBACK';
}

export const executeAutonomousRazorpayPayment = async (
  paymentLinkUrl: string
): Promise<AutomatedPaymentResult> => {
  console.log(`🤖 [Autonomous Settler]: Starting checkout on: ${paymentLinkUrl}`);

  let browser: any = null;
  try {
    browser = await puppeteer.launch({
      headless: true, // Switch to false temporarily if you want to watch it work
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();
    await page.goto(paymentLinkUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // 1. Fill Phone / Contact form if prompted
    const phoneInput = await page.$('input[name="contact"], input[type="tel"], #contact');
    if (phoneInput) {
      console.log('📱 Filling contact phone number...');
      await phoneInput.type('9876543210', { delay: 50 });
      
      const proceedBtn = await page.$('button[type="submit"], #proceed');
      if (proceedBtn) {
        await proceedBtn.click();
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // 2. Select NetBanking (The cleanest 1-click test rail in Razorpay Sandbox)
    console.log('🏦 Selecting NetBanking (SBI / HDFC Test Mode)...');
    const netbankingOption = await page.waitForSelector(
      'div[data-method="netbanking"], button:has-text("Netbanking"), [tabindex="0"]:has-text("Netbanking")',
      { timeout: 8000 }
    ).catch(() => null);

    if (netbankingOption) {
      await netbankingOption.click();
      await new Promise((r) => setTimeout(r, 1000));

      // Pick the first available test bank (e.g. SBI or HDFC)
      const bankRadio = await page.waitForSelector(
        'input[type="radio"], [data-bank="SBIN"], [data-bank="HDFC"], .bank-item',
        { timeout: 4000 }
      ).catch(() => null);

      if (bankRadio) {
        await bankRadio.click();
      }

      // Click "Pay Now"
      const payButton = await page.waitForSelector(
        'button:has-text("Pay"), button[type="submit"]',
        { timeout: 4000 }
      ).catch(() => null);

      if (payButton) {
        await payButton.click();
      }
    } else {
      // Fallback: Check if direct "Test Payment / Success" prompt is visible
      const directSuccess = await page.$('button:has-text("Success")');
      if (directSuccess) {
        await directSuccess.click();
      }
    }

    // 3. Handle Mock Bank Authorization Screen (Sandbox redirect)
    console.log('⏳ Waiting for Sandbox Bank Authorization page...');
    await new Promise((r) => setTimeout(r, 3000));

    // Look across main page and any child iframes for the "Success" button
    const pages = await browser.pages();
    for (const p of pages) {
      const successBtn = await p.$('button.success, button:has-text("Success"), #success');
      if (successBtn) {
        console.log('🎯 Mock Success button found. Authorizing payment...');
        await successBtn.click();
        await new Promise((r) => setTimeout(r, 3000));
        await browser.close();
        return { success: true, paymentMode: 'HEADLESS_BROWSER' };
      }
    }

    await browser.close();
    console.log('ℹ️ Automated click completed initial stages. Awaiting webhook sync.');
    return { success: true, paymentMode: 'HEADLESS_BROWSER' };
  } catch (err: any) {
    if (browser) await browser.close();
    console.warn(`⚠️ Headless automation fell back: ${err.message}`);
    return { success: false, error: err.message, paymentMode: 'MANUAL_FALLBACK' };
  }
};