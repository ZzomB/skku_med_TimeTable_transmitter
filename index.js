const puppeteer = require('puppeteer');
const fs = require('fs');

// Scriptable 스타일의 강제 대기 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const USER_ID = process.env.USER_ID;
  const USER_PASS = process.env.USER_PASS;
  const GRADE = process.env.GRADE || 'M3'; 

  const today = new Date();
  const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // 시간표 페이지로 직접 진입
  const targetUrl = `https://lrc.skkumed.ac.kr/schdule_time.asp?grade=${GRADE}&rdate=${dateString}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // 윈도우 크롬 환경으로 확실히 위장
  await page.setViewport({ width: 1280, height: 1000 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  try {
    console.log(`LRC 접속 시도... (${targetUrl})`);
    
    // 페이지 이동 (에러가 나더라도 catch로 넘기고 요소를 기다림)
    await page.goto(targetUrl, { timeout: 30000 }).catch(() => console.log('페이지 로딩 신호 무시 (직접 요소 대기 시작)'));

    // 로그인 창(input) 혹은 시간표 표(table)가 뜰 때까지 대기
    console.log('화면 요소 확인 중...');
    await page.waitForSelector('input[name="student_code"], table.table', { timeout: 30000 });

    const isLoginPage = await page.$('input[name="student_code"]') !== null;

    if (isLoginPage) {
      console.log('로그인 필요: 로그인 수행 중...');
      await page.type('input[name="student_code"]', USER_ID);
      await page.type('input[name="student_pass"]', USER_PASS);
      await page.evaluate(() => document.getElementById('st').checked = true);
      
      // ActionLogin 함수 실행
      await page.evaluate(() => ActionLogin());
      
      // 로그인 완료 및 리디렉션 대기 (3초)
      await sleep(3000);
      
      console.log('시간표 페이지 재진입...');
      await page.goto(targetUrl, { timeout: 30000 }).catch(() => {});
      await page.waitForSelector('table.table', { timeout: 30000 });
    }

    console.log('✅ 시간표 발견! 데이터 추출 중...');
    
    // 테이블 파싱 (Scriptable 로직 베이스)
    const result = await page.evaluate(() => {
      try {
        var rows = document.querySelectorAll('table.table tr');
        if (!rows || rows.length === 0) return { error: "테이블을 찾을 수 없음" };
        
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
        return { data: grid };
      } catch (e) {
        return { error: e.message };
      }
    });

    if (result.error) {
      throw new Error(result.error);
    }

    // 결과 저장
    const finalData = {
      lastUpdated: new Date().toISOString(),
      schedule: result.data
    };

    fs.writeFileSync('schedule.json', JSON.stringify(finalData, null, 2));
    console.log('🎉 schedule.json 저장 완료!');

  } catch (error) {
    console.error('❌ 크롤링 에러:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();