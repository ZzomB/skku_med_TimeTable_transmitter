const puppeteer = require('puppeteer');
const http = require('http');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const server = http.createServer((req, res) => {
  if (req.url === '/slow') {
    // 3초 뒤에 응답, 그리고 alert 띄우고 다른 곳으로 이동
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <script>
          alert('로그인이 필요합니다');
          window.location.href = '/login';
        </script>
      `);
    }, 3000);
  } else if (req.url === '/login') {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<input name="student_code" />');
    }, 1000);
  } else {
    res.writeHead(200);
    res.end('ok');
  }
});

server.listen(3000, async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('dialog', async dialog => {
    console.log(`[알림창 닫힘] ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // 의도적으로 짧은 타임아웃을 줘서 goto가 먼저 끝나게 만듦 (타임아웃 에러 무시)
    console.log('1. goto 호출 (timeout 1000ms)');
    await page.goto('http://localhost:3000/slow', { timeout: 1000 }).catch(e => console.log('goto 타임아웃'));
    
    // 이 시점에서 페이지는 여전히 백그라운드에서 로딩 중임 (/slow 는 3초 뒤에 완료됨)
    console.log('2. 다음 코드 실행 (page.$ 호출하면서 백그라운드 페이지 로딩/네비게이션과 충돌 유도)');
    
    // 계속 반복해서 page.$를 호출하다보면, 백그라운드에서 alert -> accept -> location.href 가 실행되는 순간과 겹치게 됨
    for (let i = 0; i < 50; i++) {
        await sleep(100);
        try {
            await page.$('input[name="student_code"]');
            process.stdout.write('.');
        } catch(e) {
            console.log('\n❌ 에러 발생:', e.message);
            break;
        }
    }
    
  } finally {
    await browser.close();
    server.close();
  }
});
