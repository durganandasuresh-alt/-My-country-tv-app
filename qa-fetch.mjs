export default async function run(page) {
  const result = await page.evaluate(async () => {
    const out = {};
    try {
      const res = await fetch('/api/channels');
      out.status = res.status;
      const txt = await res.text();
      out.len = txt.length;
      try {
        const data = JSON.parse(txt);
        out.total = data.total;
        out.channels = data.channels?.length;
      } catch (e) {
        out.jsonError = String(e);
        out.head = txt.slice(0, 200);
      }
    } catch (e) {
      out.fetchError = String(e);
    }
    return out;
  });
  return result;
}
