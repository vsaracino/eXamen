import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/search', async (req, res) => {
  const keyword = (req.query.q || '').toString().trim();
  if (!keyword) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  // Set longer timeout for Railway
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes

  const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(keyword)}`;

  let browser;
  try {
    console.log(`[search] start q="${keyword}" → ${searchUrl}`);
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--max_old_space_size=4096',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 900 },
      locale: 'en-US'
    });
    const page = await context.newPage();

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[search] navigated domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    console.log('[search] networkidle (best-effort)');

    // Add a small delay for page stability
    await page.waitForTimeout(2000);

    try {
      const consentBtn = await page.locator('button:has-text("Accept")').first();
      if (await consentBtn.count()) {
        console.log('[search] consent button found, attempting click');
        await consentBtn.click({ timeout: 2000 }).catch(() => {});
      }
    } catch {}

    try {
      await page.waitForSelector('li[data-viewport]', { timeout: 20000 });
      console.log('[search] data-viewport items detected');
    } catch {
      console.log('[search] data-viewport timeout (continuing)');
    }

    const totalText = await page.locator('#mainContent .srp-controls__count-heading').first().textContent().catch(() => null);
    const total = totalText ? (totalText.match(/([\d,]+)/)?.[1]?.replace(/,/g, '') ?? null) : null;
    const totalResults = total ? Number(total) : null;
    console.log(`[search] parsed totalResults=${totalResults ?? 'null'}`);

    // Extract items from first page (up to 60 items)
    const items = [];
    const diagnostics = [];
    const maxItems = Math.min(totalResults || 100, 100); // Cap at 100 items
    const itemsPerPage = 60; // eBay shows 60 items per page
    
    for (let i = 0; i < Math.min(maxItems, itemsPerPage); i++) {
      try {
        const result = await page.locator('#srp-river-results li[data-viewport]').nth(i).evaluate((el) => {
          const KNOWN_CONDITIONS = [
            'Brand New','New','New without box','Open Box','Certified Refurbished','Seller Refurbished','Refurbished',
            'Used','Pre-Owned','Preowned','For parts or not working','For parts','Like New','Very Good','Good','Acceptable'
          ];
          const conditionRegex = new RegExp(`\\b(${KNOWN_CONDITIONS.map(c => c.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|')})\\b`, 'i');
          const currencyRegex = /(?:(?:US\s*)?\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/;

          const normalize = (s) => (s || '').replace(/[\u00A0\u200B\u200C\u200D]/g, ' ').replace(/\s+/g, ' ').trim();
          const getText = (el) => normalize(el && el.textContent ? el.textContent : '');

          const linkEl = el.querySelector('a[href*="/itm/"]') || el.querySelector('a');
          let url = linkEl?.getAttribute('href') || null;
          if (!url) return { success: false, reason: 'no url' };
          if (!/^https?:\/\//i.test(url)) {
            url = 'https://www.ebay.com' + (url.startsWith('/') ? url : '/' + url);
          }
          if (!/\/itm\//.test(url)) {
            return { success: false, reason: 'url does not contain /itm/', url };
          }

          // Use the correct selectors from the real listing structure
          const titleEl = el.querySelector('.s-card__title .su-styled-text.primary.default') || 
                         el.querySelector('.s-card__title span.su-styled-text.primary.default') ||
                         el.querySelector('.s-card__title .su-styled-text.primary') ||
                         el.querySelector('.s-card__title span');
          let title = getText(titleEl);
          
          title = normalize(title);
          // Filter out promotional and non-listing content
          if (!title || 
              /shop on ebay/i.test(title) || 
              /find similar items/i.test(title) ||
              /see all the items/i.test(title) ||
              /results matching fewer words/i.test(title) ||
              title.length < 10) {
            return { success: false, reason: 'invalid title (promotional/filtered)', title };
          }

          let price = getText(el.querySelector('.s-card__price.su-styled-text.primary.bold.large-1')) ||
                     getText(el.querySelector('.s-card__attribute-row .su-styled-text.primary.bold.large-1')) ||
                     getText(el.querySelector('.su-styled-text.primary.bold.large-1.s-card__price')) ||
                     '';
          if (!price) {
            const candidates = Array.from(el.querySelectorAll('span, div')).map(n => getText(n)).filter(Boolean);
            for (const t of candidates) {
              const m = t.match(currencyRegex);
              if (m) { price = normalize(m[0]); break; }
            }
          }
          if (!price) {
            return { success: false, reason: 'no price', price };
          }

          let condition = getText(el.querySelector('.s-card__subtitle .su-styled-text.secondary.default')) ||
                         getText(el.querySelector('.s-card__subtitle-row .su-styled-text.secondary.default')) ||
                         getText(el.querySelector('.su-styled-text.secondary.default')) ||
                         '';
          if (!condition) {
            const m = (el.textContent || '').match(conditionRegex);
            if (m) condition = normalize(m[1]);
          }
          if (!condition) condition = 'Unknown';
          
          // Normalize condition display
          if (condition.toLowerCase().includes('pre-owned')) {
            condition = 'Used';
          } else if (condition.toLowerCase().includes('brand new')) {
            condition = 'New';
          }

          return { 
            success: true, 
            item: { title, url, price, condition }
          };
        });

        if (result.success) {
          items.push(result.item);
          console.log(`[extract] SUCCESS: item ${i} extracted`);
          
          // If we've extracted 60 items and need more, break to move to page 2
          if (items.length >= itemsPerPage && maxItems > itemsPerPage) {
            console.log(`[extract] Reached ${itemsPerPage} items on page 1, moving to page 2`);
            break;
          }
        } else {
          diagnostics.push({ index: i, ...result });
          console.log(`[extract] item ${i}: REJECTED - ${result.reason}`);
        }
      } catch (err) {
        console.log(`[extract] item ${i}: ERROR - ${err.message}`);
        break; // Stop if we can't access more items
      }
    }

    // If we need more items and have more pages, try page 2
    if (items.length < maxItems && totalResults > itemsPerPage) {
      console.log(`[extract] Attempting page 2 to get more items (current: ${items.length}, target: ${maxItems})`);
      
      try {
        const nextPageUrl = `${searchUrl}&_pgn=2`;
        console.log(`[extract] Navigating to page 2: ${nextPageUrl}`);
        
        await page.goto(nextPageUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 60000 
        });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await page.waitForSelector('#srp-river-results li[data-viewport]', { timeout: 20000 }).catch(() => {});
        
        // Extract additional items from page 2 (up to remaining items needed)
        const remainingItems = Math.min(maxItems - items.length, itemsPerPage);
        for (let i = 0; i < remainingItems; i++) {
          try {
            const result = await page.locator('#srp-river-results li[data-viewport]').nth(i).evaluate((el) => {
              const KNOWN_CONDITIONS = [
                'Brand New','New','New without box','Open Box','Certified Refurbished','Seller Refurbished','Refurbished',
                'Used','Pre-Owned','Preowned','For parts or not working','For parts','Like New','Very Good','Good','Acceptable'
              ];
              const conditionRegex = new RegExp(`\\b(${KNOWN_CONDITIONS.map(c => c.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|')})\\b`, 'i');
              const currencyRegex = /(?:(?:US\s*)?\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/;

              const normalize = (s) => (s || '').replace(/[\u00A0\u200B\u200C\u200D]/g, ' ').replace(/\s+/g, ' ').trim();
              const getText = (el) => normalize(el && el.textContent ? el.textContent : '');

              const linkEl = el.querySelector('a[href*="/itm/"]') || el.querySelector('a');
              let url = linkEl?.getAttribute('href') || null;
              if (!url) return { success: false, reason: 'no url' };
              if (!/^https?:\/\//i.test(url)) {
                url = 'https://www.ebay.com' + (url.startsWith('/') ? url : '/' + url);
              }
              if (!/\/itm\//.test(url)) {
                return { success: false, reason: 'url does not contain /itm/', url };
              }

              // Use the correct selectors from the real listing structure
              const titleEl = el.querySelector('.s-card__title .su-styled-text.primary.default') || 
                             el.querySelector('.s-card__title span.su-styled-text.primary.default') ||
                             el.querySelector('.s-card__title .su-styled-text.primary') ||
                             el.querySelector('.s-card__title span');
              let title = getText(titleEl);
              
              title = normalize(title);
              // Filter out promotional and non-listing content
              if (!title || 
                  /shop on ebay/i.test(title) || 
                  /find similar items/i.test(title) ||
                  /see all the items/i.test(title) ||
                  /results matching fewer words/i.test(title) ||
                  title.length < 10) {
                return { success: false, reason: 'invalid title (promotional/filtered)', title };
              }

              let price = getText(el.querySelector('.s-card__price.su-styled-text.primary.bold.large-1')) ||
                         getText(el.querySelector('.s-card__attribute-row .su-styled-text.primary.bold.large-1')) ||
                         getText(el.querySelector('.su-styled-text.primary.bold.large-1.s-card__price')) ||
                         '';
              if (!price) {
                const candidates = Array.from(el.querySelectorAll('span, div')).map(n => getText(n)).filter(Boolean);
                for (const t of candidates) {
                  const m = t.match(currencyRegex);
                  if (m) { price = normalize(m[0]); break; }
                }
              }
              if (!price) {
                return { success: false, reason: 'no price', price };
              }

              let condition = getText(el.querySelector('.s-card__subtitle .su-styled-text.secondary.default')) ||
                             getText(el.querySelector('.s-card__subtitle-row .su-styled-text.secondary.default')) ||
                             getText(el.querySelector('.su-styled-text.secondary.default')) ||
                             '';
              if (!condition) {
                const m = (el.textContent || '').match(conditionRegex);
                if (m) condition = normalize(m[1]);
              }
              if (!condition) condition = 'Unknown';
              
              // Normalize condition display
              if (condition.toLowerCase().includes('pre-owned')) {
                condition = 'Used';
              } else if (condition.toLowerCase().includes('brand new')) {
                condition = 'New';
              }

              return { 
                success: true, 
                item: { title, url, price, condition }
              };
            });

            if (result.success) {
              items.push(result.item);
              console.log(`[extract] SUCCESS: page 2 item ${i} extracted`);
            } else {
              console.log(`[extract] page 2 item ${i}: REJECTED - ${result.reason}`);
            }
          } catch (err) {
            console.log(`[extract] page 2 item ${i}: ERROR - ${err.message}`);
            break;
          }
        }
        console.log(`[extract] Page 2 complete: extracted ${items.length} total items`);
      } catch (err) {
        console.log(`[extract] Failed to load page 2:`, err.message);
      }
    }

    // Log diagnostics for first few items
    for (let i = 0; i < Math.min(diagnostics.length, 5); i++) {
      const diag = diagnostics[i];
      console.log(`[extract] item ${diag.index}: REJECTED - ${diag.reason}`, diag);
    }
    
    // Also log ALL titles found to see what we're working with
    const allTitles = await page.locator('li[data-viewport]').evaluateAll((nodes) => {
      return nodes.map((el, index) => {
        const linkEl = el.querySelector('a[href*="/itm/"]') || el.querySelector('a');
        const titleEl = el.querySelector('h3, span, a');
        const title = titleEl?.textContent?.trim() || linkEl?.textContent?.trim() || '';
        return { index, title: title.substring(0, 100) }; // Limit length for logging
      });
    }).catch(() => []);
    console.log('[extract] ALL titles found:', allTitles);
    
    // Also log successful items for debugging
    if (items.length > 0) {
      console.log(`[extract] SUCCESS: Found ${items.length} valid items`);
      for (let i = 0; i < Math.min(items.length, 2); i++) {
        console.log(`[extract] valid item ${i}:`, items[i]);
      }
    }

    if (typeof totalResults === 'number' && totalResults >= 1 && items.length > totalResults) {
      items = items.slice(0, totalResults);
      console.log(`[search] capped items to totalResults=${totalResults}`);
    }

    if (items.length) {
      console.log('[search] sample item:', items[0]);
    } else {
      const liCount = await page.locator('li[data-viewport]').count().catch(() => 0);
      console.log(`[search] diagnostics: li[data-viewport] count=${liCount}`);
      try {
        const diag = await page.locator('li[data-viewport]').evaluateAll((nodes) => {
          const toBool = (v) => !!v;
          const arr = [];
          for (let i = 0; i < Math.min(nodes.length, 3); i++) {
            const li = nodes[i];
            const link = li.querySelector('a[href*="/itm/"]');
            const title = li.querySelector('h3.s-item__title, a.s-item__link h3, span[role="heading"], .s-item__title') || link;
            const priceSel = li.querySelector('.s-item__price, [data-testid="s-item-price"], span.s-item__price, span.su-styled-text.primary.bold.large-1.s-card__price');
            const condSel = li.querySelector('.SECONDARY_INFO, .s-item__condition, .s-item__subtitle span, span.su-styled-text.secondary.default');
            arr.push({ i, hasLink: toBool(link), hasTitle: toBool(title), hasPrice: toBool(priceSel), hasCondition: toBool(condSel) });
          }
          return arr;
        });
        console.log('[search] diagnostics sample:', JSON.stringify(diag));
      } catch {}
    }

    console.log(`[search] extracted items=${items.length}`);
    res.json({ totalResults, results: items });
  } catch (err) {
    console.error('[search] error', err);
    if (err?.name === 'TimeoutError' || /waitForSelector|Navigation|net::ERR/i.test(String(err?.message || ''))) {
      res.json({ totalResults: null, results: [] });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch results' });
  } finally {
    if (browser) {
      try {
        // Close all contexts first (which contain pages)
        const contexts = browser.contexts();
        await Promise.all(contexts.map(context => context.close().catch(() => {})));
        
        // Force close the browser
        await browser.close().catch(() => {});
        
        // Longer delay to ensure complete cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        console.log('[search] browser closed');
      } catch (error) {
        console.log('[search] cleanup error:', error.message);
      }
    }
  }
});

app.get('/search-sold', async (req, res) => {
  const keyword = (req.query.q || '').toString().trim();
  if (!keyword) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  // Set longer timeout for Railway
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes

  const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(keyword)}&LH_Complete=1&LH_Sold=1`;
  console.log(`[search-sold] start q="${keyword}" → ${searchUrl}`);

  let browser;
  try {
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--max_old_space_size=4096',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 900 },
      locale: 'en-US'
    });
    const page = await context.newPage();

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[search-sold] navigated domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    console.log('[search-sold] networkidle (best-effort)');

    try {
      const consentBtn = await page.locator('button:has-text("Accept")').first();
      if (await consentBtn.count()) {
        console.log('[search-sold] consent button found, attempting click');
        await consentBtn.click({ timeout: 2000 }).catch(() => {});
      }
    } catch {}

    try {
      await page.waitForSelector('li[data-viewport]', { timeout: 20000 });
      console.log('[search-sold] data-viewport items detected');
    } catch {
      console.log('[search-sold] data-viewport timeout (continuing)');
    }

    const totalText = await page.locator('#mainContent .srp-controls__count-heading').first().textContent().catch(() => null);
    const total = totalText ? (totalText.match(/([\d,]+)/)?.[1]?.replace(/,/g, '') ?? null) : null;
    const totalResults = total ? Number(total) : null;
    console.log(`[search-sold] parsed totalResults=${totalResults ?? 'null'}`);

    // Extract items from first page (up to 60 items)
    const items = [];
    const diagnostics = [];
    const maxItems = Math.min(totalResults || 100, 100); // Cap at 100 items
    const itemsPerPage = 60; // eBay shows 60 items per page
    
    for (let i = 0; i < Math.min(maxItems, itemsPerPage); i++) {
      try {
        const result = await page.locator('#srp-river-results li[data-viewport]').nth(i).evaluate((el) => {
          const KNOWN_CONDITIONS = [
            'Brand New','New','New without box','Open Box','Certified Refurbished','Seller Refurbished','Refurbished',
            'Used','Pre-Owned','Preowned','For parts or not working','For parts','Like New','Very Good','Good','Acceptable'
          ];
          const conditionRegex = new RegExp(`\\b(${KNOWN_CONDITIONS.map(c => c.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|')})\\b`, 'i');
          const currencyRegex = /(?:(?:US\s*)?\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/;

          const normalize = (s) => (s || '').replace(/[\u00A0\u200B\u200C\u200D]/g, ' ').replace(/\s+/g, ' ').trim();
          const getText = (el) => normalize(el && el.textContent ? el.textContent : '');

          const linkEl = el.querySelector('a[href*="/itm/"]') || el.querySelector('a');
          let url = linkEl?.getAttribute('href') || null;
          if (!url) return { success: false, reason: 'no url' };
          if (!/^https?:\/\//i.test(url)) {
            url = 'https://www.ebay.com' + (url.startsWith('/') ? url : '/' + url);
          }
          if (!/\/itm\//.test(url)) {
            return { success: false, reason: 'url does not contain /itm/', url };
          }

          // Use the correct selectors from the real listing structure
          const titleEl = el.querySelector('.s-card__title .su-styled-text.primary.default') || 
                         el.querySelector('.s-card__title span.su-styled-text.primary.default') ||
                         el.querySelector('.s-card__title .su-styled-text.primary') ||
                         el.querySelector('.s-card__title span');
          let title = getText(titleEl);
          
          title = normalize(title);
          // Filter out promotional and non-listing content
          if (!title || 
              /shop on ebay/i.test(title) || 
              /find similar items/i.test(title) ||
              /see all the items/i.test(title) ||
              /results matching fewer words/i.test(title) ||
              title.length < 10) {
            return { success: false, reason: 'invalid title (promotional/filtered)', title };
          }

          let price = getText(el.querySelector('.s-card__price.su-styled-text.primary.bold.large-1')) ||
                     getText(el.querySelector('.s-card__attribute-row .su-styled-text.primary.bold.large-1')) ||
                     getText(el.querySelector('.su-styled-text.primary.bold.large-1.s-card__price')) ||
                     '';
          if (!price) {
            const candidates = Array.from(el.querySelectorAll('span, div')).map(n => getText(n)).filter(Boolean);
            for (const t of candidates) {
              const m = t.match(currencyRegex);
              if (m) { price = normalize(m[0]); break; }
            }
          }
          if (!price) {
            return { success: false, reason: 'no price', price };
          }

          let condition = getText(el.querySelector('.s-card__subtitle .su-styled-text.secondary.default')) ||
                           getText(el.querySelector('.s-card__subtitle-row .su-styled-text.secondary.default')) ||
                           getText(el.querySelector('.su-styled-text.secondary.default')) ||
                           '';
          if (!condition) {
            const m = (el.textContent || '').match(conditionRegex);
            if (m) condition = normalize(m[1]);
          }
          if (!condition) condition = 'Unknown';
          
          // Normalize condition display
          if (condition.toLowerCase().includes('pre-owned')) {
            condition = 'Used';
          } else if (condition.toLowerCase().includes('brand new')) {
            condition = 'New';
          }

          return { 
            success: true, 
            item: { title, url, price, condition }
          };
        });

        if (result.success) {
          items.push(result.item);
          console.log(`[extract-sold] SUCCESS: item ${i} extracted`);
          
          // If we've extracted 60 items and need more, break to move to page 2
          if (items.length >= itemsPerPage && maxItems > itemsPerPage) {
            console.log(`[extract-sold] Reached ${itemsPerPage} items on page 1, moving to page 2`);
            break;
          }
        } else {
          diagnostics.push({ index: i, ...result });
          console.log(`[extract-sold] item ${i}: REJECTED - ${result.reason}`);
        }
      } catch (err) {
        console.log(`[extract-sold] item ${i}: ERROR - ${err.message}`);
        break; // Stop if we can't access more items
      }
    }

    // If we need more items and have more pages, try page 2
    if (items.length < maxItems && totalResults > itemsPerPage) {
      console.log(`[extract-sold] Attempting page 2 to get more items (current: ${items.length}, target: ${maxItems})`);
      
      try {
        const nextPageUrl = `${searchUrl}&_pgn=2`;
        console.log(`[extract-sold] Navigating to page 2: ${nextPageUrl}`);
        
        await page.goto(nextPageUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 60000 
        });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await page.waitForSelector('#srp-river-results li[data-viewport]', { timeout: 20000 }).catch(() => {});
        
        // Extract additional items from page 2 (up to remaining items needed)
        const remainingItems = Math.min(maxItems - items.length, itemsPerPage);
        for (let i = 0; i < remainingItems; i++) {
          try {
            const result = await page.locator('#srp-river-results li[data-viewport]').nth(i).evaluate((el) => {
              const KNOWN_CONDITIONS = [
                'Brand New','New','New without box','Open Box','Certified Refurbished','Seller Refurbished','Refurbished',
                'Used','Pre-Owned','Preowned','For parts or not working','For parts','Like New','Very Good','Good','Acceptable'
              ];
              const conditionRegex = new RegExp(`\\b(${KNOWN_CONDITIONS.map(c => c.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|')})\\b`, 'i');
              const currencyRegex = /(?:(?:US\s*)?\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/;

              const normalize = (s) => (s || '').replace(/[\u00A0\u200B\u200C\u200D]/g, ' ').replace(/\s+/g, ' ').trim();
              const getText = (el) => normalize(el && el.textContent ? el.textContent : '');

              const linkEl = el.querySelector('a[href*="/itm/"]') || el.querySelector('a');
              let url = linkEl?.getAttribute('href') || null;
              if (!url) return { success: false, reason: 'no url' };
              if (!/^https?:\/\//i.test(url)) {
                url = 'https://www.ebay.com' + (url.startsWith('/') ? url : '/' + url);
              }
              if (!/\/itm\//.test(url)) {
                return { success: false, reason: 'url does not contain /itm/', url };
              }

              // Use the correct selectors from the real listing structure
              const titleEl = el.querySelector('.s-card__title .su-styled-text.primary.default') || 
                             el.querySelector('.s-card__title span.su-styled-text.primary.default') ||
                             el.querySelector('.s-card__title .su-styled-text.primary') ||
                             el.querySelector('.s-card__title span');
              let title = getText(titleEl);
              
              title = normalize(title);
              // Filter out promotional and non-listing content
              if (!title || 
                  /shop on ebay/i.test(title) || 
                  /find similar items/i.test(title) ||
                  /see all the items/i.test(title) ||
                  /results matching fewer words/i.test(title) ||
                  title.length < 10) {
                return { success: false, reason: 'invalid title (promotional/filtered)', title };
              }

              let price = getText(el.querySelector('.s-card__price.su-styled-text.primary.bold.large-1')) ||
                         getText(el.querySelector('.s-card__attribute-row .su-styled-text.primary.bold.large-1')) ||
                         getText(el.querySelector('.su-styled-text.primary.bold.large-1.s-card__price')) ||
                         '';
              if (!price) {
                const candidates = Array.from(el.querySelectorAll('span, div')).map(n => getText(n)).filter(Boolean);
                for (const t of candidates) {
                  const m = t.match(currencyRegex);
                  if (m) { price = normalize(m[0]); break; }
                }
              }
              if (!price) {
                return { success: false, reason: 'no price', price };
              }

              let condition = getText(el.querySelector('.s-card__subtitle .su-styled-text.secondary.default')) ||
                             getText(el.querySelector('.s-card__subtitle-row .su-styled-text.secondary.default')) ||
                             getText(el.querySelector('.su-styled-text.secondary.default')) ||
                             '';
              if (!condition) {
                const m = (el.textContent || '').match(conditionRegex);
                if (m) condition = normalize(m[1]);
              }
              if (!condition) condition = 'Unknown';
              
              // Normalize condition display
              if (condition.toLowerCase().includes('pre-owned')) {
                condition = 'Used';
              } else if (condition.toLowerCase().includes('brand new')) {
                condition = 'New';
              }

              return { 
                success: true, 
                item: { title, url, price, condition }
              };
            });

            if (result.success) {
              items.push(result.item);
              console.log(`[extract-sold] SUCCESS: page 2 item ${i} extracted`);
            } else {
              console.log(`[extract-sold] page 2 item ${i}: REJECTED - ${result.reason}`);
            }
          } catch (err) {
            console.log(`[extract-sold] page 2 item ${i}: ERROR - ${err.message}`);
            break;
          }
        }
        console.log(`[extract-sold] Page 2 complete: extracted ${items.length} total items`);
      } catch (err) {
        console.log(`[extract-sold] Failed to load page 2:`, err.message);
      }
    }

    console.log(`[search-sold] extracted items=${items.length}`);
    res.json({ totalResults, results: items });
  } catch (err) {
    console.error('[search-sold] error', err);
    if (err?.name === 'TimeoutError' || /waitForSelector|Navigation|net::ERR/i.test(String(err?.message || ''))) {
      res.json({ totalResults: null, results: [] });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch results' });
  } finally {
    if (browser) {
      try {
        // Close all contexts first (which contain pages)
        const contexts = browser.contexts();
        await Promise.all(contexts.map(context => context.close().catch(() => {})));
        
        // Force close the browser
        await browser.close().catch(() => {});
        
        // Longer delay to ensure complete cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        console.log('[search-sold] browser closed');
      } catch (error) {
        console.log('[search-sold] cleanup error:', error.message);
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


