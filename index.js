const puppeteer = require('puppeteer');
const fs = require('fs');

// LRC 서버 특유의 딜레이를 맞추기 위한 강제 대기 함수
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

  // ★ 핵심 해결책: alert('로그인이 필요합니다') 등의 팝업이 뜨면 자동으로 "확인" 버튼을 눌러줍니다.
  // 이 코드가 없으면 Puppeteer가 경고창에 막혀 무한정 대기(프리즈)하게 됩니다.
  page.on('dialog', async dialog => {
    console.log(`[알림창 닫힘] ${dialog.message()}`);
    await dialog.accept();
  });

  // 일반 브라우저처럼 보이게 설정
  await page.setViewport({ width: 1280, height: 1000 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  try {
    console.log(`1단계: 시간표 링크 접속 시도...`);
    // Scriptable 방식: 일단 접속하고 1초 무조건 쉼
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(1500);

    // 로그인 창이 떴는지 확인
    const isLoginPage = await page.$('input[name="student_code"]') !== null;

    if (isLoginPage) {
      console.log('2단계: 로그인 창 발견. 로그인 시퀀스 시작...');
      
      // 아이디 비번 입력 및 체크박스 클릭
      await page.type('input[name="student_code"]', USER_ID);
      await page.type('input[name="student_pass"]', USER_PASS);
      await page.evaluate(() => {
        document.getElementById('st').checked = true;
        // Scriptable에서 썼던 그 로그인 함수 실행
        ActionLogin();
      });

      // 3단계: 로그인이 처리될 때까지 충분히 기다림 (Scriptable의 waitForLoad + sleep 재현)
      console.log('3단계: 로그인 처리 대기 중...');
      await sleep(5000); 

      // 4단계: 핵심! 로그인 후 시간표 페이지로 "수동 재접속"
      console.log('4단계: 시간표 페이지로 수동 재접속 시도...');
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2000);
    }

    console.log('5단계: 데이터 추출 시작...');
    // Scriptable의 파싱 로직과 100% 동일하게 구현
    const scheduleData = await page.evaluate(() => {
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
            if (!subject && cell.querySelector('a')) {
              subject = cell.querySelector('a').innerText.trim().split('\n')[0].replace(/\s*\(.*\)/g, '').trim();
            }
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
      // 9시부터 17시까지만 자르기 로직 포함
      var startIndex = 0;
      var cutIndex = grid.length;
      for (var i = 0; i < grid.length; i++) {
        if (grid[i][0].subject.includes("09:00")) startIndex = i;
        if (grid[i][0].subject.includes("17:00")) cutIndex = i;
      }
      var finalGrid = [grid[0]].concat(grid.slice(startIndex, cutIndex));
      return { data: finalGrid };
    });

    if (scheduleData.error) {
      // 실패 시 상황 파악을 위해 스크린샷 저장
      await page.screenshot({ path: 'error_screenshot.png' });
      throw new Error(scheduleData.error);
    }

    // 결과 저장
    fs.writeFileSync('schedule.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: scheduleData.data
    }, null, 2));
    
    console.log('🎉 schedule.json 생성 성공!');

  } catch (error) {
    console.error('❌ 최종 에러:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();