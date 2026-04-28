const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const USER_ID = process.env.USER_ID;
  const USER_PASS = process.env.USER_PASS;
  const GRADE = process.env.GRADE || 'M3'; 

  const today = new Date();
  const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // 1. 처음엔 메인 홈페이지로 접속합니다 (병규님 아이디어 적용)
  const mainUrl = 'https://lrc.skkumed.ac.kr';
  const targetUrl = `https://lrc.skkumed.ac.kr/schdule_time.asp?grade=${GRADE}&rdate=${dateString}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // 봇 감지 우회용 User-Agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  try {
    console.log(`LRC 메인 페이지 접속 중... (${mainUrl})`);
    
    // 타임아웃 60초, domcontentloaded 기준으로 여유있게 대기
    await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 로그인 필요 여부 확인 (메인 페이지에 로그인 폼이 있다고 가정)
    const isLoginPage = await page.$('input[name="student_code"]') !== null;

    if (isLoginPage) {
      console.log('메인 페이지에서 로그인 수행 중...');
      
      await page.type('input[name="student_code"]', USER_ID);
      await page.type('input[name="student_pass"]', USER_PASS);
      await page.evaluate(() => document.getElementById('st').checked = true);

      // 로그인 버튼 클릭(ActionLogin) 후 페이지가 완전히 넘어갈 때까지 대기
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        page.evaluate(() => ActionLogin())
      ]);
      
      console.log('로그인 성공! 시간표 페이지로 이동합니다...');
      // 2. 로그인 성공 후에 비로소 시간표 페이지로 이동
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } else {
       // 만약 이미 로그인이 되어있는 상태라면 바로 시간표로 이동
       console.log('이미 로그인 상태입니다. 시간표 페이지로 바로 이동합니다.');
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