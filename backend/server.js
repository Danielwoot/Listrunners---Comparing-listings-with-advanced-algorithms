'use strict';

const express           = require('express');
const fetch             = require('node-fetch');
const cheerio           = require('cheerio');
const cors              = require('cors');
const { SocksProxyAgent } = require('socks-proxy-agent');
const puppeteer         = require('puppeteer');

const app  = express();
const PORT = process.env.PORT || 3001;

// RentCast / ATTOM are optional extras — set in docker-compose.yml
const RENTCAST_KEY = process.env.RENTCAST_API_KEY || '';
const ATTOM_KEY    = process.env.ATTOM_API_KEY    || '';
const TOR_HOST     = process.env.TOR_HOST         || 'tor';
const TOR_PORT     = process.env.TOR_PORT         || '9050';
const TOR_SOCKS    = `socks5h://${TOR_HOST}:${TOR_PORT}`;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tor Browser's standardised User-Agent.
 * TB ships with a frozen UA so all users look identical — we mimic that.
 */
const TOR_UA =
  'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0';

/** Headers that mimic Tor Browser's default request profile */
const TOR_HEADERS = {
  'User-Agent':      TOR_UA,
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest':  'document',
  'Sec-Fetch-Mode':  'navigate',
  'Sec-Fetch-Site':  'cross-site',
  'DNT':             '1',
};

/** Plain browser headers (no Tor) for APIs that are scraping-friendly */
const PLAIN_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** fetch() with a hard timeout to prevent hangs */
function timedFetch(url, opts = {}, ms = 15000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/**
 * Same as timedFetch but routes through the Tor SOCKS5 proxy.
 * Tor requests get a fresh exit node IP each circuit (~10 min rotation).
 */
function torFetch(url, opts = {}, ms = 30000) {
  let agent;
  try {
    agent = new SocksProxyAgent(TOR_SOCKS);
  } catch (e) {
    console.warn('[Tor] Could not create SOCKS agent:', e.message);
    // Fall back to direct fetch (better than a crash)
    return timedFetch(url, opts, ms);
  }
  return timedFetch(url, { ...opts, agent }, ms);
}

/** Strip Redfin's XSSI prefix before JSON.parse */
function rfParse(text) {
  return JSON.parse(text.replace(/^\{\}&&/, ''));
}

/** Format any number-like value → "$1,234,567" or null */
function fmtUSD(raw) {
  if (raw == null) return null;
  const n = typeof raw === 'number'
    ? raw
    : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  if (!isFinite(n) || n < 5000) return null; // sanity floor
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

/** Full US state names → 2-letter abbreviation */
const STATE_MAP = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
  'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
  'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
  'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI',
  'Wyoming':'WY','District of Columbia':'DC',
};
function abbrevState(s = '') {
  return STATE_MAP[s] || (s.length === 2 ? s.toUpperCase() : s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Street abbreviation table (Nominatim returns full names; Redfin uses abbrevs)
// ─────────────────────────────────────────────────────────────────────────────
const STREET_ABBR = {
  north:'N', south:'S', east:'E', west:'W',
  northeast:'NE', northwest:'NW', southeast:'SE', southwest:'SW',
  street:'St', avenue:'Ave', boulevard:'Blvd', drive:'Dr', lane:'Ln',
  road:'Rd', court:'Ct', circle:'Cir', place:'Pl', way:'Way',
  terrace:'Ter', trail:'Trl', highway:'Hwy', parkway:'Pkwy', freeway:'Fwy',
  loop:'Loop', run:'Run',
};

/**
 * Convert "North Citrus Street" → "N-Citrus-St"
 * (matches Redfin's URL slug format)
 */
function toStreetSlug(road = '') {
  return road
    .split(/\s+/)
    .map(w => STREET_ABBR[w.toLowerCase()] ?? w)
    .join('-');
}

// ─────────────────────────────────────────────────────────────────────────────
// Price extraction from Redfin/Zillow HTML
// ─────────────────────────────────────────────────────────────────────────────
function extractPriceFromHtml(html) {
  // Ordered by reliability
  const patterns = [
    /"listPrice"\s*:\s*(\d{5,})/,
    /"displayedListingPrice"\s*:\s*(\d{5,})/,
    /"price"\s*:\s*(\d{5,})/,
    /"amount"\s*:\s*(\d{5,})/,
    /"displayPrice"\s*:\s*"[^"]*?\$?([\d,]+)"/,
    /content="\$?([\d,]+)"\s+itemprop="price"/,
  ];

  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const raw = m[1].replace(/,/g, '');
      const formatted = fmtUSD(parseFloat(raw));
      if (formatted) {
        console.log(`[extractPrice] pattern=${pat.source.substring(0,30)} → ${formatted}`);
        return formatted;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1: Nominatim — always-on geocoder (no key, no Tor needed)
// ─────────────────────────────────────────────────────────────────────────────
async function geocodeNominatim(address) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1&countrycodes=us`;

    const res = await timedFetch(url, {
      headers: { 'User-Agent': 'ListRunners/1.0 (property-comparison-app)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data  = await res.json();
    const place = data[0];
    if (!place) return null;

    const a       = place.address || {};
    const city    = a.city || a.town || a.village || a.hamlet || null;
    const rawState = a['ISO3166-2-lvl4'] || '';
    const state   = rawState.replace('US-', '') || abbrevState(a.state || '');
    const zip     = a.postcode || null;
    const houseNo = a.house_number || '';
    const road    = a.road || '';

    const street      = [houseNo, road].filter(Boolean).join(' ');
    const displayAddr = [street, city, state && zip ? `${state} ${zip}` : state]
      .filter(Boolean).join(', ');

    console.log(`[Nominatim] ✓ city=${city}  state=${state}  zip=${zip}  road="${road}"`);
    return { city, state, zip, houseNo, road, displayAddr };
  } catch (e) {
    console.warn(`[Nominatim] ✗ ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 2 & 3: DuckDuckGo Onion Search via Tor
// Resolves the address through Tor-friendly DDG Onion HTML service
// to parse listings & prices from Zillow/Redfin/Realtor.com snippets.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchPriceViaTorSearch(address, isRental = false) {
  const query = isRental ? `${address} rent` : address;
  
  const url = `https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion/html/?q=${encodeURIComponent(query)}`;
  console.log(`[Tor/Search] Querying DDG Onion: ${url}`);

  try {
    const res = await torFetch(url, {
      headers: {
        'User-Agent': TOR_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 25000
    });

    if (!res.ok) {
      console.warn(`[Tor/Search] HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const pricesFound = [];
    const sourceLinks = [];

    $('.result').each((i, el) => {
      const snippet = $(el).find('.result__snippet').text() || '';
      const title   = $(el).find('.result__a').text() || '';
      const link    = $(el).find('.result__a').attr('href') || '';
      
      let realUrl = null;
      if (link.includes('uddg=')) {
        try {
          const urlObj = new URL(link, 'https://duckduckgo.com');
          realUrl = urlObj.searchParams.get('uddg');
        } catch (e) {
          const m = link.match(/[?&]uddg=([^&]+)/);
          if (m) realUrl = decodeURIComponent(m[1]);
        }
      }

      // Regex matching: supports comma-optional dollar prices (e.g. $5000, $5,000, $5000/mo, $5,000/month)
      const matches = snippet.match(/\$\d+(?:,\d{3})*(?:\/\w+)?/gi) || [];
      const titleMatches = title.match(/\$\d+(?:,\d{3})*(?:\/\w+)?/gi) || [];
      const allMatches = [...matches, ...titleMatches];

      for (const m of allMatches) {
        const cleanPrice = m.replace(/[$\s]/g, '');
        pricesFound.push({
          raw: cleanPrice,
          matchedStr: m,
          source: title.trim(),
          url: realUrl
        });
      }

      const lowerTitle = title.toLowerCase();
      let sourceName = 'Web Search (Tor)';
      if (lowerTitle.includes('zillow')) sourceName = 'Zillow';
      else if (lowerTitle.includes('redfin')) sourceName = 'Redfin';
      else if (lowerTitle.includes('realtor')) sourceName = 'Realtor.com';
      else if (lowerTitle.includes('trulia')) sourceName = 'Trulia';
      else if (lowerTitle.includes('homes.com')) sourceName = 'Homes.com';
      else if (lowerTitle.includes('apartments.com')) sourceName = 'Apartments.com';
      else if (lowerTitle.includes('rent.com')) sourceName = 'Rent.com';
      else if (lowerTitle.includes('forrent.com')) sourceName = 'ForRent.com';
      else if (lowerTitle.includes('zumper')) sourceName = 'Zumper';

      if (sourceName !== 'Web Search (Tor)') {
        sourceLinks.push({ name: sourceName, url: realUrl });
      }
    });

    if (pricesFound.length > 0) {
      const priceCounts = {};
      let bestPrice = null;
      let maxCount = 0;
      let bestPriceObj = null;

      for (const p of pricesFound) {
        const val = parseFloat(p.raw.replace(/,/g, ''));
        if (isRental && val > 30000) continue;
        if (!isRental && val < 30000) continue;

        priceCounts[p.raw] = (priceCounts[p.raw] || 0) + 1;
        if (priceCounts[p.raw] > maxCount) {
          maxCount = priceCounts[p.raw];
          bestPrice = p.raw;
          bestPriceObj = p;
        }
      }

      if (!bestPrice && pricesFound.length > 0) {
        bestPrice = pricesFound[0].raw;
        bestPriceObj = pricesFound[0];
      }

      const finalPrice = fmtUSD(bestPrice);
      
      // Determine preferred listing URL and source name
      let finalSource = 'Web Search (Tor)';
      let finalUrl    = bestPriceObj ? bestPriceObj.url : null;

      const preferredSources = isRental
        ? ['Apartments.com', 'Rent.com', 'Zillow', 'Trulia', 'Realtor.com', 'ForRent.com', 'Zumper', 'Homes.com', 'Redfin']
        : ['Redfin', 'Zillow', 'Realtor.com', 'Trulia', 'Homes.com', 'Apartments.com'];

      for (const src of preferredSources) {
        const match = sourceLinks.find(s => s.name === src);
        if (match) {
          finalSource = match.name;
          finalUrl    = match.url;
          break;
        }
      }

      if (!finalUrl && bestPriceObj) {
        finalUrl = bestPriceObj.url;
        if (finalUrl) {
          if (finalUrl.includes('redfin.com')) finalSource = 'Redfin';
          else if (finalUrl.includes('zillow.com')) finalSource = 'Zillow';
          else if (finalUrl.includes('realtor.com')) finalSource = 'Realtor.com';
          else if (finalUrl.includes('trulia.com')) finalSource = 'Trulia';
          else if (finalUrl.includes('homes.com')) finalSource = 'Homes.com';
          else if (finalUrl.includes('apartments.com')) finalSource = 'Apartments.com';
          else if (finalUrl.includes('rent.com')) finalSource = 'Rent.com';
          else if (finalUrl.includes('forrent.com')) finalSource = 'ForRent.com';
          else if (finalUrl.includes('zumper.com')) finalSource = 'Zumper';
        }
      }

      console.log(`[Tor/Search] ✓ Extracted price ${finalPrice} from ${finalSource}`);
      return {
        price:  finalPrice,
        source: finalSource,
        url:    finalUrl
      };
    }

    console.warn('[Tor/Search] No price found in search snippets');
    return null;
  } catch (e) {
    console.warn(`[Tor/Search] ✗ ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 3.5: Location statistics from Felo.ai (AI search engine) via Puppeteer
// ─────────────────────────────────────────────────────────────────────────────
async function fetchFeloStats(city, state) {
  if (!city || !state) return null;
  const query = `For ${city}, ${state}, provide numerical ratings from 0 to 100 for safety, schools, walkability, economy, and overall livability. Respond with a raw comma-separated list of scores in this format exactly: SAFETY=score, SCHOOLS=score, WALKABILITY=score, ECONOMY=score, LIVABILITY=score. No other text.`;
  
  console.log(`[Felo/AI] Querying Felo.ai for stats in ${city}, ${state}...`);
  let browser;
  try {
    const launchOptions = {
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--hide-scrollbars', 
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        `--proxy-server=socks5://tor:9050`
      ],
      headless: 'new'
    };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    await page.evaluateOnNewDocument(`(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    })()`);
    
    await page.goto('https://felo.ai/', { waitUntil: 'networkidle2' });
    const initialUrl = page.url();
    
    // Dismiss initial promotional modal
    await page.evaluate(`(() => {
      const allElements = Array.from(document.querySelectorAll('button, a, div, span'));
      const tryLater = allElements.find(el => (el.textContent || '').trim() === 'Try Later');
      if (tryLater) {
        tryLater.click();
        return;
      }
      const closeBtn = document.querySelector('button[aria-label*="close" i], [class*="close" i]');
      if (closeBtn) closeBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    
    // Force hide overlays
    await page.evaluate(`(() => {
      const overlays = Array.from(document.querySelectorAll('div')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.position === 'fixed' && (style.backgroundColor.includes('rgba') || el.className.includes('overlay') || el.className.includes('backdrop'));
      });
      overlays.forEach(el => {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      });
    })()`);
    
    await page.waitForSelector('textarea', { timeout: 15000 });
    await page.focus('textarea');
    await page.click('textarea');
    await page.type('textarea', query, { delay: 5 });
    
    await page.evaluate(`(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        let parent = textarea.parentElement;
        while (parent) {
          const btn = parent.querySelector('button[type="submit"]');
          if (btn) {
            btn.click();
            return;
          }
          parent = parent.parentElement;
        }
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    })()`);
    await page.keyboard.press('Enter');
    
    let redirected = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const url = page.url();
      if (url !== initialUrl && (url.includes('/search/') || url.includes('thread_query_uuid'))) {
        redirected = true;
        break;
      }
    }
    
    // Wait for the AI response to start generating and stabilize
    await new Promise(r => setTimeout(r, 12000));
    
    const text = await page.evaluate(`(() => document.body.innerText)()`);
    
    const safety      = parseFeloMetric(text, 'safety', 75);
    const schools     = parseFeloMetric(text, 'school', 75);
    const walkability = parseFeloMetric(text, 'walk', 70);
    const economy     = parseFeloMetric(text, 'econ', 70);
    const livability  = parseFeloMetric(text, 'livab', 75);
    
    console.log(`[Felo/AI] ✓ Extracted stats for ${city}, ${state}: safety=${safety}, schools=${schools}, walkability=${walkability}, economy=${economy}, livability=${livability}`);
    
    return { safety, schools, walkability, economy, livability };
    
  } catch (e) {
    console.warn(`[Felo/AI] ✗ Stats query failed: ${e.message}. Using fallback defaults.`);
    // Return sensible fallback defaults if Felo is blocked or fails
    return { safety: 75, schools: 75, walkability: 70, economy: 70, livability: 75 };
  } finally {
    if (browser) await browser.close();
  }
}

function parseFeloMetric(text, keyword, defaultVal) {
  const clean = text.toLowerCase();
  
  // 1. Try format matching: e.g. safety=95 or safety: 95
  const regex = new RegExp(`${keyword.toLowerCase()}\\s*[:=]\\s*(\\d+)`, 'gi');
  const matches = clean.match(regex);
  if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const numMatch = lastMatch.match(/\d+/);
    if (numMatch) {
      const val = parseInt(numMatch[0], 10);
      if (val >= 0 && val <= 100) return val;
    }
  }
  
  // 2. Fallback: find last occurrence of keyword and match the first number close after it
  const index = clean.lastIndexOf(keyword.toLowerCase());
  if (index !== -1) {
    const snippet = clean.substring(index, index + 150);
    const match = snippet.match(/\b([1-9]?\d|100)\b/);
    if (match) {
      return parseInt(match[0], 10);
    }
  }
  return defaultVal;
}

// New helper: Resolve address, fetch stats, and retrieve pricing in a single Puppeteer session
async function fetchFeloCombined(addressInput, isRental = false) {
  if (!addressInput) return null;
  
  const priceSource = isRental 
    ? 'rent price or estimated median cost of rent on Apartments.com or Zillow' 
    : 'active list price or market value on Redfin or Zillow';

  const query = `For ${addressInput}, provide: 1. the complete street address, 2. the ${priceSource} (respond with the number or price range only, e.g. $2,500 or $950,000), and 3. numerical ratings from 0 to 100 for safety, schools, walkability, and economy. Respond in this format exactly: ADDRESS=complete address, PRICE=value, SAFETY=score, SCHOOLS=score, WALKABILITY=score, ECONOMY=score. No other text.`;
  
  console.log(`[Felo/AI] Querying Felo.ai for address resolution, price, and stats...`);
  let browser;
  try {
    const launchOptions = {
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--hide-scrollbars', 
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        `--proxy-server=socks5://tor:9050`
      ],
      headless: 'new'
    };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    await page.evaluateOnNewDocument(`(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    })()`);
    
    await page.goto('https://felo.ai/', { waitUntil: 'networkidle2' });
    const initialUrl = page.url();
    
    // Dismiss initial promotional modal
    await page.evaluate(`(() => {
      const allElements = Array.from(document.querySelectorAll('button, a, div, span'));
      const tryLater = allElements.find(el => (el.textContent || '').trim() === 'Try Later');
      if (tryLater) {
        tryLater.click();
        return;
      }
      const closeBtn = document.querySelector('button[aria-label*="close" i], [class*="close" i]');
      if (closeBtn) closeBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    
    // Force hide overlays
    await page.evaluate(`(() => {
      const overlays = Array.from(document.querySelectorAll('div')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.position === 'fixed' && (style.backgroundColor.includes('rgba') || el.className.includes('overlay') || el.className.includes('backdrop'));
      });
      overlays.forEach(el => {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      });
    })()`);
    
    await page.waitForSelector('textarea', { timeout: 15000 });
    await page.focus('textarea');
    await page.click('textarea');
    await page.type('textarea', query, { delay: 5 });
    
    await page.evaluate(`(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        let parent = textarea.parentElement;
        while (parent) {
          const btn = parent.querySelector('button[type="submit"]');
          if (btn) {
            btn.click();
            return;
          }
          parent = parent.parentElement;
        }
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    })()`);
    await page.keyboard.press('Enter');
    
    let redirected = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const url = page.url();
      if (url !== initialUrl && (url.includes('/search/') || url.includes('thread_query_uuid'))) {
        redirected = true;
        break;
      }
    }
    
    // Wait for the AI response to start generating and stabilize
    let text = '';
    let hasStats = false;
    for (let i = 0; i < 20; i++) { // Max wait 30 seconds
      await new Promise(r => setTimeout(r, 1500));
      text = await page.evaluate(`(() => document.body.innerText)()`);
      
      // Look for safety rating value (e.g. safety=90 or safety: 90)
      if (/safety\s*[:=]\s*\d+/i.test(text)) {
        hasStats = true;
        // Wait another 3 seconds for it to finish typing the rest of the ratings
        await new Promise(r => setTimeout(r, 3000));
        text = await page.evaluate(`(() => document.body.innerText)()`);
        break;
      }
    }
    
    // Parse Address, Price & Stats using lookahead bounds
    let resolvedAddr = null;
    let resolvedPrice = null;
    
    const cleanText = text.toLowerCase();
    const lastPromptIdx = cleanText.lastIndexOf('respond in this format exactly:');
    const searchArea = lastPromptIdx !== -1 ? text.substring(lastPromptIdx) : text;
    const cleanSearchArea = searchArea.toLowerCase();

    // 1. Parse Address (grabs everything between ADDRESS= and , PRICE=)
    const addrRegex = /address\s*[:=]\s*(.*?)(?=\s*,\s*price\b)/gi;
    const addrMatches = cleanSearchArea.match(addrRegex);
    if (addrMatches && addrMatches.length > 0) {
      const lastMatch = addrMatches[addrMatches.length - 1];
      const valMatch = lastMatch.match(/address\s*[:=]\s*(.*)/i);
      if (valMatch && valMatch[1]) {
        const originalIndex = searchArea.toLowerCase().lastIndexOf(valMatch[0].toLowerCase());
        if (originalIndex !== -1) {
          const valStart = originalIndex + valMatch[0].indexOf(valMatch[1]);
          resolvedAddr = searchArea.substring(valStart, valStart + valMatch[1].length).trim();
        } else {
          resolvedAddr = valMatch[1].trim();
        }
      }
    }
    
    // 2. Parse Price (grabs everything between PRICE= and , SAFETY=)
    const priceRegex = /price\s*[:=]\s*(.*?)(?=\s*,\s*safety\b)/gi;
    const priceMatches = cleanSearchArea.match(priceRegex);
    if (priceMatches && priceMatches.length > 0) {
      const lastMatch = priceMatches[priceMatches.length - 1];
      const valMatch = lastMatch.match(/price\s*[:=]\s*(.*)/i);
      if (valMatch && valMatch[1]) {
        const originalIndex = searchArea.toLowerCase().lastIndexOf(valMatch[0].toLowerCase());
        if (originalIndex !== -1) {
          const valStart = originalIndex + valMatch[0].indexOf(valMatch[1]);
          resolvedPrice = searchArea.substring(valStart, valStart + valMatch[1].length).trim();
        } else {
          resolvedPrice = valMatch[1].trim();
        }
      }
    }

    const safety      = parseFeloMetric(searchArea, 'safety', 75);
    const schools     = parseFeloMetric(searchArea, 'school', 75);
    const walkability = parseFeloMetric(searchArea, 'walk', 70);
    const economy     = parseFeloMetric(searchArea, 'econ', 70);
    
    console.log(`[Felo/AI] ✓ Extracted Combined: address="${resolvedAddr}", price="${resolvedPrice}", safety=${safety}, schools=${schools}, walkability=${walkability}, economy=${economy}`);
    
    return {
      resolvedAddress: resolvedAddr,
      price: resolvedPrice,
      stats: { safety, schools, walkability, economy }
    };
    
  } catch (e) {
    console.warn(`[Felo/AI] ✗ Combined query failed: ${e.message}`);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

// Convert address resolved by Felo into Nominatim-like geo object
function parseFeloAddress(addrStr) {
  if (!addrStr) return null;
  const parts = addrStr.split(',').map(p => p.trim());
  if (parts.length < 2) return null;
  
  let countryIndex = parts.indexOf('USA');
  if (countryIndex !== -1) {
    parts.splice(countryIndex, 1);
  }
  
  const stateZipPart = parts[parts.length - 1] || '';
  const szParts = stateZipPart.split(/\s+/).filter(Boolean);
  const state = szParts[0] || '';
  const zip = szParts[1] || null;
  const city = parts[parts.length - 2] || '';
  const road = parts.slice(0, parts.length - 2).join(', ');
  
  return {
    road,
    city,
    state,
    zip,
    fullAddress: addrStr,
    displayAddr: addrStr
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 4: RentCast (optional, requires free API key)
// https://www.rentcast.io/api — 50 free calls/month, no credit card
// ─────────────────────────────────────────────────────────────────────────────
async function fetchRentCast(address, isRental) {
  if (!RENTCAST_KEY) return null;
  try {
    const endpoint = isRental ? 'rentals/listing' : 'listings/sale';
    const url = `https://api.rentcast.io/v1/${endpoint}?address=${encodeURIComponent(address)}&limit=1&status=Active`;
    const res = await timedFetch(url, {
      headers: { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' },
    });
    if (!res.ok) { console.warn(`[RentCast] HTTP ${res.status}`); return null; }
    const listings = await res.json();
    const listing  = Array.isArray(listings) ? listings[0] : listings;
    if (!listing) return null;
    const raw   = isRental
      ? listing.price || listing.rent
      : listing.price || listing.listPrice;
    const price = fmtUSD(raw);
    return price ? { success: true, price, source: 'RentCast', url: null } : null;
  } catch (e) {
    console.warn(`[RentCast] ✗ ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 5: RentCast AVM (estimated value — works for off-market properties)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchRentCastAVM(address, isRental) {
  if (!RENTCAST_KEY) return null;
  try {
    const ep  = isRental ? 'avm/rent/long-term' : 'avm/value';
    const url = `https://api.rentcast.io/v1/${ep}?address=${encodeURIComponent(address)}`;
    const res = await timedFetch(url, {
      headers: { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const d   = await res.json();
    const raw = isRental ? d.rent : d.price;
    return fmtUSD(raw) || null;
  } catch (e) {
    console.warn(`[RentCast AVM] ✗ ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main API endpoint
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/property', async (req, res) => {
  const { address = '', type = 'buy' } = req.query;
  const trimmed  = address.trim();
  const isRental = type === 'rent';

  if (!trimmed) {
    return res.status(400).json({ error: 'address query param is required' });
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[req] address="${trimmed}"  type=${type}`);

  let geo = null;
  let stats = null;
  let priceData = null;

  // ── Step 1 & 2: Run DDG onion price scraping and Felo combined query in parallel ──
  console.log(`[pipeline] executing price scrape and Felo.ai combined address/stats resolve in parallel...`);
  const [priceDataRes, feloCombined] = await Promise.all([
    fetchPriceViaTorSearch(trimmed, isRental),
    fetchFeloCombined(trimmed, isRental)
  ]);
  
  priceData = priceDataRes;

  if (feloCombined && feloCombined.resolvedAddress) {
    geo = parseFeloAddress(feloCombined.resolvedAddress);
    stats = feloCombined.stats;
  }

  // ── Step 2.5 Fallback: If Tor scraping returned null price, try using Felo's price! ──
  if (!priceData?.price && feloCombined?.price) {
    console.log(`[pipeline] Tor price search failed. Using Felo.ai resolved price: "${feloCombined.price}"`);
    priceData = {
      price: feloCombined.price,
      source: isRental ? 'Apartments.com' : 'Zillow',
      url: null
    };
  }

  // ── Step 3 Fallback: If Felo geocoding failed/timed out, try Nominatim ──────
  if (!geo) {
    console.log(`[pipeline] Felo geocoding failed. Trying Nominatim geocoder...`);
    try {
      geo = await geocodeNominatim(trimmed);
    } catch (err) {
      console.warn(`[geocodeNominatim] failed: ${err.message}`);
    }
  }

  // ── Step 4 Fallback: Both Felo and Nominatim failed, parse raw input ──────
  if (!geo) {
    console.log(`[pipeline] Both Felo and Nominatim failed. Building minimal geo from raw input.`);
    const parts = trimmed.split(',').map(p => p.trim());
    geo = {
      road: parts[0] || '',
      city: parts[1] || '',
      state: parts[2] ? parts[2].split(/\s+/)[0] : '',
      zip: parts[2] ? parts[2].split(/\s+/)[1] : null,
      fullAddress: trimmed,
      displayAddr: trimmed
    };
  }

  if (!stats) {
    stats = { safety: 75, schools: 75, walkability: 70, economy: 70, livability: 75 };
  }

  const queryAddress = geo.fullAddress || trimmed;

  // ── Step 5: Try RentCast listing (if key is configured) ──────────────────
  if (!priceData?.price && RENTCAST_KEY) {
    console.log(`[pipeline] trying RentCast listing...`);
    const rc = await fetchRentCast(queryAddress, isRental);
    if (rc?.price) priceData = rc;
  }

  // ── Step 6: RentCast AVM estimate ────────────────────────────────────────
  let avmPrice = null;
  if (!priceData?.price && RENTCAST_KEY) {
    console.log(`[pipeline] trying RentCast AVM estimate...`);
    avmPrice = await fetchRentCastAVM(queryAddress, isRental);
    if (avmPrice) {
      priceData = { price: avmPrice, source: 'RentCast (AVM Est.)', url: null };
    }
  }

  // ── Compose response ──────────────────────────────────────────────────────
  const hasPrice = !!(priceData?.price);

  return res.json({
    success: true,
    address: geo.displayAddr || trimmed,
    city:    geo.city,
    state:   geo.state,
    zip:     geo.zip,
    price:   priceData?.price  || null,
    source:  priceData?.source || 'Nominatim',
    url:     priceData?.url    || null,
    stats,
    note:    !hasPrice && !RENTCAST_KEY
      ? 'Live pricing requires a free RentCast API key — set RENTCAST_API_KEY in docker-compose.yml (rentcast.io/api).'
      : null,
  });
});

app.get('/health', (_req, res) => res.json({
  ok:          true,
  ts:          new Date().toISOString(),
  torProxy:    TOR_SOCKS,
  hasRentCast: !!RENTCAST_KEY,
  hasAttom:    !!ATTOM_KEY,
}));

app.listen(PORT, () =>
  console.log(
    `[listrunners-api] :${PORT} | Tor=${TOR_SOCKS} | RentCast=${RENTCAST_KEY ? 'YES' : 'no'}`
  )
);
