const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const USER_ID = process.env.USER_ID;
  const USER_PASS = process.env.USER_PASS;
  
  if (!USER_ID || !USER_PASS) {
      console.log("No credentials, can't fetch schedule table directly if it requires login. But we will try.");
  }
  
  // Actually, we can just look at page.html from the repo if it's there. 
  // Wait, page.html is exactly 44KB. The mini-board has `a` tags with subject and small tags for professor.
  // Let me just read page.html to see if it has table.table
  
  await browser.close();
})();
