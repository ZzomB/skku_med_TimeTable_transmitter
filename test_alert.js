const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: 'new', args: ['--no-sandbox']});
  const page = await browser.newPage();
  page.on('dialog', async dialog => {
    console.log('Dialog pop up:', dialog.message());
    await dialog.accept();
  });
  await page.goto('https://lrc.skkumed.ac.kr/schdule_time.asp?grade=M3&rdate=2026-04-29');
  console.log('Reached page:', page.url());
  const hasLogin = await page.$('input[name="student_code"]') !== null;
  console.log('Has login form?', hasLogin);
  await browser.close();
})();
