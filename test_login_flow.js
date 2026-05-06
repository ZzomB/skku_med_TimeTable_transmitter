const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('dialog', async dialog => {
    console.log(`[알림창 닫힘] ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    console.log('접속 시작...');
    await page.goto('https://lrc.skkumed.ac.kr/schdule_time.asp?grade=M3&rdate=2026-05-06', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(e => console.log('goto catch:', e.message));
    
    console.log('1.5초 대기...');
    await sleep(1500);

    console.log('로그인 폼 확인 중...');
    const isLoginPage = await page.$('input[name="student_code"]') !== null;
    console.log('isLoginPage:', isLoginPage);
    
    // 계속 대기해서 어떤 일이 일어나는지 관찰
    await sleep(5000);
    console.log('현재 URL:', page.url());
  } catch (error) {
    console.error('❌ 에러:', error.message);
  } finally {
    await browser.close();
  }
})();
