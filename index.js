const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const USER_ID = process.env.USER_ID;
  const USER_PASS = process.env.USER_PASS;
  const GRADE = process.env.GRADE || 'M3'; 

  const today = new Date();
  const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // 처음부터 바로 시간표 링크로 직행 (병규님 아이디어)
  const targetUrl = `https://lrc.skkumed.ac.kr/schdule_time.asp?grade=${GRADE}&rdate=${dateString}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // 윈도우 크롬 브라우저로 위장
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  try {
    console.log(`LRC 시간표 페이지 직접 접속 시도... (${targetUrl})`);
    
    // 무한 로딩 방지: 페이지 로딩 완료 신호를 기다리지 않고 냅다 던짐
    page.goto(targetUrl).catch(() => {});

    // 핵심: '로그인 창' 이나 '시간표 표' 둘 중 하나가 화면에 뜰 때까지만 기다림
    console.log('화면 요소 대기 중...');
    await page.waitForSelector('input[name="student_code"], table.table', { timeout: 30000 });

    // 화면에 뜬 것이 로그인 폼인지 확인
    const isLoginPage = await page.$('input[name="student_code"]') !== null;

    if (isLoginPage) {
      console.log('로그인 폼 발견! 로그인을 수행합니다...');
      await page.type('input[name="student_code"]', USER_ID);
      await page.type('input[name="student_pass"]', USER_PASS);
      await page.evaluate(() => document.getElementById('st').checked = true);

      // 로그인 스크립트 실행
      await page.evaluate(() => ActionLogin());
      
      // 서버에서 로그인 처리할 시간 3초 부여
      await new Promise(r => setTimeout(r, 3000));
      
      console.log('시간표 페이지로 확실하게 재진입...');
      page.goto(targetUrl).catch(() => {});
      
      // 이번엔 진짜 시간표 표가 뜰 때까지 대기
      await page.waitForSelector('table.table', { timeout: 30000 });
    } else {
      console.log('로그인 패스! 이미 시간표가 보입니다.');
    }

    console.log('시간표 발견! 데이터 파싱 시작...');
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