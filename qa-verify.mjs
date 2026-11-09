export default async function run(page, ui) {
  // Use a fresh user ID for testing
  await page.evaluate(() => {
    localStorage.setItem('mctv_user_id', 'qa_fresh_user_10days');
    document.cookie = 'mctv_user_id=qa_fresh_user_10days; path=/; max-age=31536000';
  });
  await page.reload();
  await page.waitForTimeout(2000);

  // 1. Initial State: Free Plan Active
  const headerText = await page.evaluate(() => document.getElementById('headerSubText')?.textContent?.trim());
  
  // 2. Open Subscription Modal
  await page.evaluate(() => document.getElementById('btnSubscriptionStatus')?.click());
  await page.waitForTimeout(600);

  const modalVisible = await page.evaluate(() => {
    const modal = document.getElementById('subscriptionModal');
    return modal && !modal.classList.contains('hidden');
  });

  const bannerTitle = await page.evaluate(() => document.getElementById('statusBannerTitle')?.textContent?.trim());
  const freePlanCardStatus = await page.evaluate(() => document.getElementById('freePlanCardStatus')?.textContent?.trim());

  // Screenshot of active 10 Days Free Plan modal
  await page.screenshot({ path: 'qa-free-plan-active.png' });

  // 3. Test Expiring the 10 Days Free Trial
  await page.evaluate(() => document.getElementById('btnTestExpireTrial')?.click());
  await page.waitForTimeout(800);

  const headerExpiredText = await page.evaluate(() => document.getElementById('headerSubText')?.textContent?.trim());
  const isExpiredPill = await page.evaluate(() => document.getElementById('btnSubscriptionStatus')?.classList.contains('expired-alert'));

  // Re-open modal to check expired state
  await page.evaluate(() => document.getElementById('btnSubscriptionStatus')?.click());
  await page.waitForTimeout(600);

  const bannerExpiredTitle = await page.evaluate(() => document.getElementById('statusBannerTitle')?.textContent?.trim());
  const freePlanCardExpiredStatus = await page.evaluate(() => document.getElementById('freePlanCardStatus')?.textContent?.trim());

  // Screenshot of expired state in modal
  await page.screenshot({ path: 'qa-free-plan-expired.png' });

  // 4. Test Selecting 1 Month Monthly Plan (₹99)
  await page.evaluate(() => document.querySelector('.btn-select-plan[data-plan="1m"]')?.click());
  await page.waitForTimeout(600);

  const summaryName = await page.evaluate(() => document.getElementById('summaryPlanName')?.textContent?.trim());
  const summaryAmount = await page.evaluate(() => document.getElementById('summaryPlanAmount')?.textContent?.trim());

  // 5. Confirm Payment (Simulated UPI Payment Activation)
  await page.evaluate(() => document.getElementById('btnConfirmUpiPayment')?.click());
  await page.waitForTimeout(1000);

  const successTitle = await page.evaluate(() => document.getElementById('subSuccessTitle')?.textContent?.trim());
  const successVisible = await page.evaluate(() => {
    const view = document.getElementById('subSuccessView');
    return view && !view.classList.contains('hidden');
  });

  // Screenshot of success screen
  await page.screenshot({ path: 'qa-monthly-plan-success.png' });

  // Close success screen and verify header shows VIP active
  await page.evaluate(() => document.getElementById('btnSubSuccessClose')?.click());
  await page.waitForTimeout(600);

  const headerVipText = await page.evaluate(() => document.getElementById('headerSubText')?.textContent?.trim());

  return {
    initialHeaderText: headerText,
    modalVisible,
    bannerTitle,
    freePlanCardStatus,
    headerExpiredText,
    isExpiredPill,
    bannerExpiredTitle,
    freePlanCardExpiredStatus,
    summaryName,
    summaryAmount,
    successVisible,
    successTitle,
    headerVipText
  };
}
