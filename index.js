const puppeteer = require('puppeteer');
const fs = require('fs');

// Scriptable 코드의 유틸리티 함수 완벽 재현
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const USER_ID = process.env.USER_ID;
  const USER_PASS = process.env.USER_PASS;
  const GRADE = process.env.GRADE || 'M3'; 

  const today = new Date();
  const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const targetUrl = `https://lrc.skkumed.ac.kr/schdule_time.asp?grade=${GRADE}&rdate=${dateString}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // 1. 완벽한 아이폰(iOS Safari) 환경으로 위장
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
  await page.setViewport({ width: 390, height: 844, isMobile: true });

  try {
    console.log(`LRC 접속 중... (${targetUrl})`);
    
    // 2. 신호 대기 포기: 10초만 시도하고 끊은 뒤, 강제로 2초 sleep (Scriptable 로직)
    await page.goto(targetUrl, { timeout: 10000 }).catch(() => console.log('접속 지연 무시 (Scriptable 방식 적용)'));
    await sleep(2000);

    // 로그인 필요 여부 확인
    const isLoginPage = await page.$('input[name="student_code"]') !== null;

    if (isLoginPage) {
      console.log('로그인 수행 중...');
      
      // Scriptable의 webview.evaluateJavaScript 로직과 동일
      await page.evaluate((id, pw) => {
        document.querySelector('input[name="student_code"]').value = id;
        document.querySelector('input[name="student_pass"]').value = pw;
        document.getElementById('st').checked = true;
        ActionLogin();
      }, USER_ID, USER_PASS);

      // 로그인 완료까지 3초 강제 대기
      await sleep(3000);
      
      console.log('시간표 페이지로 재진입...');
      // 다시 URL 로드하고 2초 강제 대기 (Scriptable 로직)
      await page.goto(targetUrl, { timeout: 10000 }).catch(() => {});
      await sleep(2000);
    }

    console.log('시간표 데이터 파싱 중...');
    const scheduleData = await page.evaluate(() => {
      var rows = document.querySelectorAll('table.table tr');
      if (!rows || rows.length === 0) return { error: "테이블 없음" };
      
      var grid = [];
      for (var i = 0; i < rows.length; i++) {
        grid.push(new Array(6).fill({subject: '', prof: '', type: 'empty'}));
      }
      
      for (var r = 0; r < rows.length; r++) {
        var tr = rows[r];
        var cells = tr.querySelectorAll('th, td');
        var c = 0;
        for (var i = 0; i < cells.length; i++) {
          var cell = cells[i];
          while (c < 6 && grid[r][c].type !== 'empty') { c++; }
          if (c >= 6) break;
          
          var subject = '', prof = '', type = 'empty';
          
          if (cell.tagName.toLowerCase() === 'th') {
            subject = cell.innerText.trim();
            type = 'header';
          } else if (cell.querySelector('span') || cell.querySelector('a')) {
            var spans = cell.querySelectorAll('span');
            if (spans.length >= 1) subject = spans[0].innerText.trim();
            if (spans.length >= 2) prof = spans[1].innerText.trim();
            type = 'class';
          } else {
            subject = cell.innerText.trim();
            type = subject !== '' ? 'time' : 'empty';
          }
          
          var rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
          for (var rr = 0; rr < rowspan; rr++) {
            if (r + rr < rows.length && c < 6) {
              grid[r + rr][c] = { subject: subject, prof: prof, type: type };
            }
          }
        }
      }
      return { data: grid, lastUpdated: new Date().toISOString() };
    });

    if (scheduleData.error) {
      console.error('❌ 파싱 실패:', scheduleData.error);
    } else {
      fs.writeFileSync('schedule.json', JSON.stringify(scheduleData, null, 2));
      console.log('✅ schedule.json 저장 완료!');
    }

  } catch (error) {
    console.error('❌ 크롤링 에러:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();