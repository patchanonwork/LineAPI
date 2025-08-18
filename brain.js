/*
 * brain.js
 *
 * This module implements simple intent detection, slot extraction and
 * pricing logic for the Line Gatekeeper bot. The heuristics here are
 * intentionally lightweight – based on regular expressions – and can be
 * extended or replaced with more sophisticated NLP models in the future.
 */

// Maps of keywords in both Thai and English for intent classification
const CONTACT_KEYWORDS = [/ติดต่อ/i, /contact/i, /โทรหา/i, /อีเมล/i];
const NOTIFY_KEYWORDS = [/แจ้งเตือน/i, /notify/i, /ขอกลับไปคุย/i, /ขอแจ้ง/i];

// Platform keyword mapping. Keys are canonical platform names, values are
// arrays of regex patterns that match user input.
const PLATFORM_PATTERNS = {
  youtube: [/youtube/i, /yt/i, /ยูทูบ/i, /ยูทูป/i],
  facebook: [/facebook/i, /fb/i, /เฟสบุ๊ค/i, /เฟซบุ๊ก/i],
  instagram: [/instagram/i, /ig/i, /อินสตาแกรม/i],
  tiktok: [/tiktok/i, /tt/i, /ติ๊กต็อก/i, /ติ๊กต่อก/i],
  line: [/line\s?oa/i, /line/i, /ไลน์/i],
  website: [/website/i, /เว็บ/i, /ไซต์/i, /เวบไซต์/i]
};

// Format keyword mapping
const FORMAT_PATTERNS = {
  video: [/video/i, /clip/i, /คลิป/i, /วิดีโอ/i],
  image: [/image/i, /picture/i, /photo/i, /รูป/i, /ภาพ/i],
  text: [/text/i, /ข้อความ/i]
};

// Asset type or generation code
const ASSET_PATTERNS = {
  gencode: [/gencode/i, /generate\s?code/i, /เจนโค้ด/i, /รหัส/i],
  asset: [/asset/i, /แอสเซท/i, /ชิ้นงาน/i, /แอสเซ็ท/i]
};

// Base price per platform (Thai Baht)
const BASE_PRICE = {
  youtube: 10000,
  facebook: 7000,
  instagram: 5000,
  tiktok: 4000,
  line: 3000,
  website: 8000,
  unknown: 5000
};

// Additional cost per format
const FORMAT_PRICE = {
  video: 2000,
  image: 1000,
  text: 500,
  unknown: 1000
};

// Additional cost per asset type
const ASSET_PRICE = {
  gencode: 1500,
  asset: 1000,
  unknown: 0
};

// Thai labels for components to build natural replies
const PLATFORM_LABEL = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  line: 'LINE OA',
  website: 'เว็บไซต์',
  unknown: 'แพลตฟอร์มที่ไม่ระบุ'
};
const FORMAT_LABEL = {
  video: 'วิดีโอ',
  image: 'รูปภาพ',
  text: 'ข้อความ',
  unknown: 'รูปแบบที่ไม่ระบุ'
};
const ASSET_LABEL = {
  gencode: 'แบบกำหนดโค้ด',
  asset: 'แบบมีชิ้นงาน',
  unknown: 'ไม่ระบุ'
};

/**
 * classify determines the high-level intent of a message.
 * Possible return values: 'contact', 'notify', 'quote'.
 * Defaults to 'quote' when no specific intent is detected.
 *
 * @param {string} text
 * @returns {string}
 */
function classify(text) {
  if (!text) return 'quote';
  for (const pattern of CONTACT_KEYWORDS) {
    if (pattern.test(text)) return 'contact';
  }
  for (const pattern of NOTIFY_KEYWORDS) {
    if (pattern.test(text)) return 'notify';
  }
  return 'quote';
}

/**
 * extractSlots scans the text for platform, format and asset keywords.
 * If a value cannot be determined it remains undefined.
 *
 * @param {string} text
 * @returns {Object}
 */
function extractSlots(text) {
  const lower = text.toLowerCase();
  let platform;
  for (const key in PLATFORM_PATTERNS) {
    const patterns = PLATFORM_PATTERNS[key];
    if (patterns.some((p) => p.test(lower))) {
      platform = key;
      break;
    }
  }
  let format;
  for (const key in FORMAT_PATTERNS) {
    const patterns = FORMAT_PATTERNS[key];
    if (patterns.some((p) => p.test(lower))) {
      format = key;
      break;
    }
  }
  let asset;
  for (const key in ASSET_PATTERNS) {
    const patterns = ASSET_PATTERNS[key];
    if (patterns.some((p) => p.test(lower))) {
      asset = key;
      break;
    }
  }
  return { platform, format, asset };
}

/**
 * trustScore returns a numeric score indicating how confident the bot is in
 * the extracted slots. This can be used to gate quick replies if desired.
 *
 * @param {Object} slots
 * @returns {number}
 */
function trustScore(slots) {
  let score = 0;
  if (slots.platform) score += 1;
  if (slots.format) score += 1;
  if (slots.asset) score += 1;
  return score / 3;
}

/**
 * Compute a quote given the provided slots.
 * When slot values are undefined they fall back to 'unknown'.
 * The returned object includes the price and the resolved slot labels.
 *
 * @param {Object} slots
 * @returns {Object}
 */
function quoteFor(slots) {
  const platform = slots.platform || 'unknown';
  const format = slots.format || 'unknown';
  const asset = slots.asset || 'unknown';
  const base = BASE_PRICE[platform] ?? BASE_PRICE.unknown;
  const extraFormat = FORMAT_PRICE[format] ?? FORMAT_PRICE.unknown;
  const extraAsset = ASSET_PRICE[asset] ?? ASSET_PRICE.unknown;
  const price = base + extraFormat + extraAsset;
  return {
    platform,
    format,
    asset,
    price
  };
}

/**
 * Determine if any slot is missing and return a prompt in Thai asking for
 * that information. If all required slots are present, return null.
 *
 * @param {Object} slots
 * @returns {string|null}
 */
function askForMissing(slots) {
  const missing = [];
  if (!slots.platform) missing.push('แพลตฟอร์ม (เช่น Facebook, YouTube)');
  if (!slots.format) missing.push('รูปแบบ (วิดีโอ, รูปภาพ, ข้อความ)');
  if (!slots.asset) missing.push('ประเภทชิ้นงาน (asset หรือ gencode)');
  if (missing.length === 0) return null;
  return `กรุณาระบุ${missing.join(' และ ')}`;
}

/**
 * Convert a quote object into a human readable Thai string.
 *
 * @param {Object} quote
 * @returns {string}
 */
function quoteText(quote) {
  const platformThai = PLATFORM_LABEL[quote.platform] || PLATFORM_LABEL.unknown;
  const formatThai = FORMAT_LABEL[quote.format] || FORMAT_LABEL.unknown;
  const assetThai = ASSET_LABEL[quote.asset] || ASSET_LABEL.unknown;
  const priceThai = quote.price.toLocaleString('th-TH');
  return `ราคาโดยประมาณ ${priceThai} บาท สำหรับ ${platformThai} รูปแบบ ${formatThai} และ ${assetThai}`;
}

module.exports = {
  classify,
  extractSlots,
  trustScore,
  quoteFor,
  askForMissing,
  quoteText
};
