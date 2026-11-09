export default async function run(page) {
  // Capture every console message and error for a full reload
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(8000);
  const state = await page.evaluate(() => ({
    readyState: document.readyState,
    cards: document.querySelectorAll('.jio-channel-card').length,
    countText: document.getElementById('channelCount')?.textContent,
    gridHTML: document.getElementById('channelGrid')?.innerHTML.slice(0, 300),
  }));
  return { state, logs };
}
