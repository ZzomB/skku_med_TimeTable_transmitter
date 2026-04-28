const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  
  try {
    const targetUrl = 'https://lrc.skkumed.ac.kr/schdule_time.asp?grade=M3&rdate=2026-04-29';
    await page.goto(targetUrl, {waitUntil: 'domcontentloaded'});
    await page.screenshot({path: 'screenshot.png'});
    console.log('Title:', await page.title());
    console.log('URL:', page.url());
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
