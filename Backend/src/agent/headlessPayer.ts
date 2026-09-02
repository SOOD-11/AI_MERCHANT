import puppeteer from 'puppeteer';

export interface AutomatedPaymentResult {
  success: boolean;
  error?: string;
}

export const executeAutonomousRazorpayPayment = async (
  paymentLinkUrl: string
): Promise<AutomatedPaymentResult> => {
  console.log(`🤖 [Autonomous Settler]: Launching native macOS Chrome window...`);
  console.log(`🔗 Target Link: ${paymentLinkUrl}`);

  // Standard path for Google Chrome on macOS
  const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: macChromePath, // Uses your native macOS Chrome app
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800',
    ],
    defaultViewport: null,
  });

  try {
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    console.log(`🌐 Navigating to: ${paymentLinkUrl}`);
    await page.goto(paymentLinkUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Step A: Wait for user interaction or DOM load
    await new Promise((r) => setTimeout(r, 2500));

    // Step B: Direct Selector Click for UPI or Card
    console.log(`🎯 Searching for payment options...`);

    // In Razorpay standard checkout, payment instruments can be clicked directly
    const handled = await page.evaluate(async () => {
      // Find all clickable elements
      const allElements = Array.from(document.querySelectorAll('button, div, span, p'));
      
      // Look for UPI option
      const upiBtn = allElements.find((el) => {
        const txt = el.textContent?.trim().toLowerCase() || '';
        return txt === 'upi' || txt.includes('upi / qr');
      }) as HTMLElement;

      if (upiBtn) {
        upiBtn.click();
        return 'upi';
      }

      // Fallback to Card
      const cardBtn = allElements.find((el) => {
        const txt = el.textContent?.trim().toLowerCase() || '';
        return txt === 'card' || txt.includes('cards');
      }) as HTMLElement;

      if (cardBtn) {
        cardBtn.click();
        return 'card';
      }

      return null;
    });

    console.log(`💳 Instrument clicked: ${handled || 'Standard/Direct'}`);
    await new Promise((r) => setTimeout(r, 1500));

    // Step C: Enter Test UPI ID
    if (handled === 'upi') {
      const vpaFound = await page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="UPI"], input[name*="vpa"], input[type="text"]') as HTMLInputElement;
        if (input) {
          input.focus();
          input.value = 'success@razorpay';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      });

      if (!vpaFound) {
        await page.keyboard.type('success@razorpay', { delay: 40 });
      }

      console.log(`✍️ Typed: success@razorpay`);
      await new Promise((r) => setTimeout(r, 1000));

      // Click Pay
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const pay = btns.find((b) => b.textContent?.toLowerCase().includes('pay'));
        if (pay) pay.click();
      });
    }

    // Step D: Handle Bank Mock Sandbox OTP ("Success" button)
    console.log(`🏦 Waiting for Mock Bank Authorization redirect...`);
    let authorized = false;

    for (let i = 0; i < 20; i++) {
      for (const frame of page.frames()) {
        const clicked = await frame.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
          const successBtn = btns.find(
            (b) => b.textContent?.trim().toLowerCase() === 'success' || (b as HTMLInputElement).value?.toLowerCase() === 'success'
          ) as HTMLElement;

          if (successBtn) {
            successBtn.click();
            return true;
          }
          return false;
        });

        if (clicked) {
          console.log(`✅ Sandbox Bank Authorization 'Success' clicked!`);
          authorized = true;
          break;
        }
      }

      if (authorized) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Keep open for 6 seconds so the browser receipt page finishes communicating with Razorpay
    console.log(`⏳ Waiting for Razorpay server synchronization...`);
    await new Promise((r) => setTimeout(r, 6000));

    await browser.close();
    return { success: true };
  } catch (err: any) {
    console.error(`❌ [Mac Chrome Error]:`, err.message);
    await browser.close();
    return { success: false, error: err.message };
  }
};