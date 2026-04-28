const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const USER_ID = process.env.USER_ID;
  const USER_PASS = process.env.USER_PASS;
  const GRADE = process.env.GRADE || 'M3'; 

  const today = new Date();
  const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const mainUrl = 'https://lrc.skkumed.ac.kr';
  const targetUrl = `https://lrc.skkumed.ac.kr/schdule_time.asp?grade=${GRADE}&rdate=${dateString}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  try {
    console.log(`LRC 메인 페이지 접속 중... (${mainUrl})`);
    
    // 1. 신호 대신, 페이지 이동 명령만 내리고 백그라운드로 넘깁니다 (waitUntil 생략)
    page.goto(mainUrl).catch(() => {});

    // 2. 화면에 로그인 입력칸이 나타날 때까지만 딱 기다립니다. (최대 30초)
    console.log('로그인 폼 대기 중...');
    await page.waitForSelector('input[name="student_code"]', { timeout: 30000 });

    console.log('로그인 폼 발견! 로그인 수행 중...');
    await page.type('input[name="student_code"]', USER_ID);
    await page.type('input[name="student_pass"]', USER_PASS);
    await page.evaluate(() => document.getElementById('st').checked = true);

    // 3. 로그인 버튼 클릭 후, 바로 다음 페이지로 이동 명령을 내립니다.
    await page.evaluate(() => ActionLogin());
    
    // 강제로 약간의 로그인 처리 시간을 줍니다.
    await new Promise(r => setTimeout(r, 2000));

    console.log('시간표 페이지로 이동 중...');
    page.goto(targetUrl).catch(() => {});

    // 4. 여기가 핵심입니다. 로딩 신호 무시하고 시간표 테이블(table.table)이 화면에 뜰 때까지만 기다립니다.
    console.log('시간표 데이터 표(Table) 대기 중...');
    await page.waitForSelector('table.table', { timeout: 30000 });

    console.log('시간표 발견! 파싱 시작...');
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