const puppeteer = require('puppeteer');
const fs = require('fs');

// LRC 서버 특유의 딜레이를 맞추기 위한 강제 대기 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const USER_ID = process.env.USER_ID;
  const USER_PASS = process.env.USER_PASS;
  const GRADE = process.env.GRADE || 'M3'; 

  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const initialUrl = `https://lrc.skkumed.ac.kr/schdule_time.asp?grade=${GRADE}&rdate=${todayString}`;

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
    let initialSuccess = false;
    let maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`1단계: 시간표 링크 접속 시도... (시도 ${attempt}/${maxRetries})`);
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
        
        // 로그인 창(student_code) 또는 시간표(table.table)가 뜰 때까지 대기
        await Promise.race([
          page.waitForSelector('input[name="student_code"]', { timeout: 120000 }),
          page.waitForSelector('table.table', { timeout: 120000 })
        ]);
        
        initialSuccess = true;
        break; // 성공 시 루프 탈출
      } catch (error) {
        console.warn(`[접속 에러] 시도 ${attempt} 실패: ${error.message}`);
        if (attempt < maxRetries) {
          console.log(`5초 후 재시도합니다...`);
          await sleep(5000);
        }
      }
    }

    if (!initialSuccess) {
      throw new Error('서버 응답 지연: 최대 재시도 횟수를 초과하여 로그인 폼이나 시간표를 찾을 수 없습니다.');
    }

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
      let reconnected = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
          await page.waitForSelector('table.table', { timeout: 120000 });
          reconnected = true;
          break;
        } catch (e) {
          console.warn(`[수동 재접속 에러] 시도 ${attempt} 실패: ${e.message}`);
          if (attempt < 3) await sleep(5000);
        }
      }
      if (!reconnected) {
        throw new Error("로그인 후 시간표 페이지 수동 재접속 실패");
      }
    }

    console.log('5단계: 17주간 데이터 추출 시작...');
    let allWeeksData = [];

    for (let i = -8; i <= 8; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + (i * 7));
      const dateString = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
      const targetUrl = `https://lrc.skkumed.ac.kr/schdule_time.asp?grade=${GRADE}&rdate=${dateString}`;
      
      console.log(`[주차 ${i}] ${dateString} 접속 중...`);
      
      let scheduleData = null;
      let maxWeekRetries = 3;

      for (let attempt = 1; attempt <= maxWeekRetries; attempt++) {
        try {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
          await page.waitForSelector('table.table', { timeout: 120000 });

          scheduleData = await page.evaluate(() => {
            var rows = document.querySelectorAll('table.table tr');
            if (!rows || rows.length === 0) return { error: "테이블을 찾을 수 없음" };
            
            var grid = [];
            for (var i = 0; i < rows.length; i++) {
              var rowArr = [];
              for (var j = 0; j < 6; j++) {
                rowArr.push({subject: '', prof: '', content: '', type: 'unfilled'});
              }
              grid.push(rowArr);
            }
            
            for (var r = 0; r < rows.length; r++) {
              var tr = rows[r];
              var cells = tr.querySelectorAll('th, td');
              var c = 0;
              for (var i = 0; i < cells.length; i++) {
                var cell = cells[i];
                while (c < 6 && grid[r][c].type !== 'unfilled') { c++; }
                if (c >= 6) break;
                
                var subject = '', prof = '', content = '', type = 'empty';
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
                  content = cell.innerText.trim(); // 셀의 모든 텍스트(주제, 교수, 챕터 내용 등 전체)를 줄바꿈 포함하여 저장
                } else {
                  subject = cell.innerText.trim();
                  type = subject !== '' ? 'time' : 'empty';
                }
                
                var rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
                var colspan = parseInt(cell.getAttribute('colspan')) || 1;
                for (var rr = 0; rr < rowspan; rr++) {
                  for (var cc = 0; cc < colspan; cc++) {
                    if (r + rr < rows.length && c + cc < 6) {
                      grid[r + rr][c + cc] = { subject: subject, prof: prof, content: content, type: type };
                    }
                  }
                }
              }
            }

            // 채워지지 않은 칸들을 empty로 변환
            for (var r = 0; r < grid.length; r++) {
              for (var c = 0; c < 6; c++) {
                if (grid[r][c].type === 'unfilled') {
                  grid[r][c].type = 'empty';
                  grid[r][c].subject = '';
                  grid[r][c].prof = '';
                  grid[r][c].content = '';
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

          if (!scheduleData.error) {
            break; // 에러가 없으면 반복문 종료(성공)
          } else {
            throw new Error(scheduleData.error);
          }
        } catch (error) {
          console.warn(`[주차 ${i} - 시도 ${attempt}] 에러 발생: ${error.message}`);
          if (attempt === maxWeekRetries) {
            scheduleData = { error: '최대 재시도 횟수 초과' };
          } else {
            console.log(`3초 후 해당 주차 재접속 시도...`);
            await sleep(3000);
          }
        }
      }

      if (scheduleData && scheduleData.error) {
        console.warn(`[주차 ${i}] 최종 에러 발생: ${scheduleData.error} (해당 주차는 건너뜁니다)`);
        continue;
      }

      allWeeksData.push({
        weekOffset: i,
        date: dateString,
        data: scheduleData.data
      });
    }

    if (allWeeksData.length === 0) {
       await page.screenshot({ path: 'error_screenshot.png' });
       throw new Error('모든 주차의 데이터를 불러오는데 실패했습니다.');
    }

    // 결과 저장
    fs.writeFileSync('schedule.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      weeks: allWeeksData
    }, null, 2));
    
    console.log(`🎉 schedule.json 생성 성공! (총 ${allWeeksData.length}주치 데이터)`);

  } catch (error) {
    console.error('❌ 최종 에러:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();