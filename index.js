const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  // 환경 변수에서 계정 정보 가져오기 (GitHub Secrets 연동)
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

  try {
    console.log(`LRC 접속 중... (${targetUrl})`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout:60000 });

    // 로그인 필요 여부 확인
    const isLoginPage = await page.$('input[name="student_code"]') !== null;

    if (isLoginPage) {
      console.log('로그인 수행 중...');
      await page.type('input[name="student_code"]', USER_ID);
      await page.type('input[name="student_pass"]', USER_PASS);
      await page.evaluate(() => document.getElementById('st').checked = true);

      // ActionLogin() 실행 후 페이지 네비게이션 대기
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        page.evaluate(() => ActionLogin())
      ]);
      
      // 로그인 성공 후 시간표 페이지로 정확히 재진입
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

    // 추출한 데이터를 JSON 파일로 저장
    fs.writeFileSync('schedule.json', JSON.stringify(scheduleData, null, 2));
    console.log('✅ schedule.json 저장 완료!');

  } catch (error) {
    console.error('❌ 크롤링 에러:', error);
    process.exit(1); // 에러 발생 시 Action 실패 처리
  } finally {
    await browser.close();
  }
})();