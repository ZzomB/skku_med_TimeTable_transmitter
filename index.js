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