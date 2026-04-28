const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const mainUrl = 'https://lrc.skkumed.ac.kr';

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // 브라우저 크기 및 위장 설정
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  try {
    console.log(`LRC 메인 페이지 접속 시도... (${mainUrl})`);
    
    // 최대 30초 대기 후 에러가 나도 스크립트를 멈추지 않고 넘어감
    try {
      const response = await page.goto(mainUrl, { timeout: 30000 });
      if (response) console.log(`HTTP 상태 코드: ${response.status()}`);
    } catch (e) {
      console.log('접속 중 타임아웃/에러 발생:', e.message);
      console.log('현재 멈춰있는 화면을 그대로 캡처합니다...');
    }

    // 렌더링될 시간을 강제로 3초 줍니다
    await new Promise(r => setTimeout(r, 3000));

    // 1. 스크린샷 촬영
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('📸 screenshot.png 촬영 완료!');

    // 2. HTML 소스 저장 (에러 나도 무시하도록 try-catch 추가)
    try {
      const html = await page.content();
      fs.writeFileSync('page.html', html);
      console.log('📄 page.html 저장 완료!');
    } catch (e) {
      console.log('HTML 저장 중 에러 발생 (무시함):', e.message);
    }

  } catch (error) {
    console.error('❌ 정찰 중 치명적 에러:', error);
  } finally {
    await browser.close();
  }
})();