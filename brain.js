
const prices = require("./prices.json");

function classify(t){
  const th = (t || "").toLowerCase();
  if (/(ขอเรท|เรทการ์ด|media ?kit|rate card|ราคา(?:เท่าไร)?)/.test(th)) return "rate_shop";
  if (/(ใบเสนอราคา|po|contract|สัญญา|ออกบิล|invoice)/.test(th)) return "ops";
  if (/(http|bit\.ly|tinyurl)/.test(th) && !/(brand|co|company|official|loreal|cerave|peppermint|solve|paris|th)/.test(th)) return "scam";
  if (/(tiktok|ig|instagram|dual|reel|story|youtube|brief|บรีฟ|ใช้งาน|usage|asset|gencode|whitelist|timeline|งบ|ฟอร์แมต|format|bundle|ซื้อคลิป|ติดตะกร้า|ติดต่อคุณณณ|แจ้งทีมงาน|รอการตอบกลับข้อความ)/.test(th)) return "brief";
  return "unknown";
}

function extractSlots(t){
  const s = {};
  const txt = (t || "").toLowerCase();

  // Contact & notify triggers
  if (/ติดต่อคุณณณ/.test(txt)) s.contact = true;
  if (/แจ้งทีมงาน|รอการตอบกลับข้อความ/.test(txt)) s.notify = true;

  // Format
  if (/\bformat\s*a\b|ฟอร์แมต\s*a|ฟอร์แมตa|แบบ a\b/.test(txt)) s.format = "A";
  if (/\bformat\s*b\b|ฟอร์แมต\s*b|ฟอร์แมตb|แบบ b\b/.test(txt)) s.format = "B";

  // Platform
  if (/ig|instagram/.test(txt)) s.platform = "ig";
  if (/tiktok|tt\b/.test(txt)) s.platform = "tt";
  if (/dual|ig\+tt|ig\+tiktok|ทั้ง\s*ig\s*และ\s*tiktok/.test(txt)) s.platform = "dual";

  // Quantity: bundle of 3 videos
  if (/bundle|3\s*video|3\s*คลิป|แพ็กเกจ\s*3/.test(txt)) s.bundle = "bundle3";
  else s.bundle = s.bundle || "single";

  // Health product premium
  if (/สุขภาพ|health(?:\s*product)?|medical|ยาดม|วิตามิน|supplement|อาหารเสริม/i.test(t)) s.health = true;

  // Usage (asset) window
  if (/(asset|usage).*(1\s*เดือน|1m)/i.test(t)) s.asset = "1m";
  if (/(asset|usage).*(3\s*เดือน|3m)/i.test(t)) s.asset = "3m";
  if (/(asset|usage).*(6\s*เดือน|6m)/i.test(t)) s.asset = "6m";
  if (/(asset|usage).*(ตลอดไป|permanent|ไม่จำกัด|ถาวร)/i.test(t)) s.asset = "permanent";

  // Ad authorization (Gencode)
  if (/gencode.*30|ad.?auth.*30|whitelist.*30/i.test(t)) s.gencode = "30d";
  if (/gencode.*90|ad.?auth.*90|whitelist.*90/i.test(t)) s.gencode = "90d";
  if (/gencode.*180|ad.?auth.*180|whitelist.*180/i.test(t)) s.gencode = "180d";
  if (/gencode.*37|37\s*วัน/i.test(t)) s.gencode = "37d"; // special: treated as free

  // Exclusivity months (cap in rules)
  const ex = t.match(/exclusive|เอ็กซ์คลู|เอกสิทธิ์|exclusivity.*?(\d+)/i);
  if (ex) s.exclusivity_months = parseInt(ex[1],10);

  // Rush if timeline < 7 days
  if (/ด่วน|rush|<\s*7\s*วัน|ภายใน\s*[0-6]\s*วัน|7d/i.test(t)) s.rush = true;

  // Per-line request? (detect '=' lines)
  if (/=.*$/m.test(t)) s.per_line = true;

  // Other fields
  const brand = t.match(/brand[:：]\s*([^\n]+)/i); if (brand) s.brand = brand[1].trim();
  const budget = t.match(/(งบ|budget)\s*[:：]?\s*([<~]?\s*[\d,\.]+k?)/i); if (budget) s.budget = budget[2];
  return s;
}

function trustScore(_source, text, s){
  let score = 0;
  if (/https?:\/\/[^\s]+/i.test(text)) score += 15;
  if (s.platform) score += 10;
  if (s.format || s.bundle) score += 10;
  if (s.asset || s.gencode) score += 10;
  if (/timeline|post date|โพส|ส่งงาน|script|draft/i.test(text)) score += 10;
  if (/ติดตะกร้า|ซื้อคลิป|ดัดแปลง|before\s*&\s*after|barter|boost/i.test(text)) score += 10;
  if (/(bit\.ly|tinyurl|cutt\.ly|goo\.gl)/i.test(text)) score -= 20;
  if (/โอนก่อน|คริปโต|crypto|วันนี้เลย|ภายใน\s*(?:วันนี้|พรุ่งนี้)/i.test(text)) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function pctLookup(table, key, fallback){ if (!key) return fallback; return (table[key] ?? fallback); }
function roundK(n){ return Math.round(n/1000)*1000; }

function quoteFor(s){
  const format = s.format === "B" ? "B" : "A";
  const platform = ["ig","tt","dual"].includes(s.platform) ? s.platform : "tt";
  const bundle = s.bundle === "bundle3" ? "bundle3" : "single";
  const base = prices.base[bundle][format][platform];

  const assetPct   = pctLookup(prices.asset_pct, s.asset, 0);
  // Treat 37d as FREE (same as 30d)
  const gencodeKey = (s.gencode === "37d") ? "30d" : s.gencode;
  const gencodePct = pctLookup(prices.gencode_pct, gencodeKey, 0);
  const exclMonths = Math.min(Math.max(Number(s.exclusivity_months||0), 0), prices.exclusivity_max_months);
  const exclPct    = prices.exclusivity_pct_per_month * exclMonths;
  const rushPct    = s.rush ? prices.rush_pct : 0;
  const healthFee  = s.health ? prices.fees.health_premium_flat : 0;

  const addonsPct = (assetPct + gencodePct + exclPct + rushPct);
  const total = roundK(base + healthFee + base * addonsPct);

  if (s.coarse) {
    const low  = roundK(total * (prices.range_pad.low  || 0.9));
    const high = roundK(total * (prices.range_pad.high || 1.2));
    return { min: low, max: high, base, breakdown: { assetPct, gencodePct, exclPct, rushPct, healthFee } };
  }
  return { exact: total, base, breakdown: { assetPct, gencodePct, exclPct, rushPct, healthFee } };
}

function gateQuickReply(){
  return {
    type: "text",
    text: "เพื่อให้ราคาแม่นยำ เลือกข้อมูลสั้น ๆ ด้านล่าง แล้วทีมจะสรุปเลขประมาณให้ทันทีค่ะ",
    quickReply: { items: [
      qr("ติดต่อคุณณณ","ติดต่อคุณณณ"),
      qr("Format: A","Format A"), qr("Format: B","Format B"),
      qr("Platform: IG","IG"), qr("Platform: TikTok","TikTok"), qr("Platform: Dual IG+TikTok","Dual IG+TikTok"),
      qr("Bundle: 3 videos","Bundle 3 videos"),
      qr("Usage (Asset): 1m","Usage Asset 1 เดือน"), qr("Usage (Asset): 3m","Usage Asset 3 เดือน"), qr("Usage (Asset): 6m","Usage Asset 6 เดือน"),
      qr("Gencode: 30d","Gencode 30 วัน"), qr("Gencode: 90d","Gencode 90 วัน"), qr("Gencode: 180d","Gencode 180 วัน"),
      qr("คุยกับทีมงาน","คุยกับทีมงาน")
    ] }
  };
}
function qr(text,label){ return { type:"action", action:{ type:"message", label, text } }; }

function askForMissing(range, s){
  return { type:"text", text:
`จากข้อมูลเบื้องต้น เบสงานอยู่ที่ ~฿${range.min.toLocaleString()}–฿${range.max.toLocaleString()} (ex-VAT)
โปรดระบุเพิ่ม: Format (A/B), Platform (IG/TT/Dual), Asset (1/3/6m/ถาวร), Gencode (30/90/180 วัน${s.gencode==="37d"?" • 37 วัน: ฟรี":""}), Exclusivity (0–2 เดือน)` };
}

function quoteText(q, s){
  const asset = s.asset ? `Asset ${s.asset}` : "Asset 1m (ถ้ายืนยัน)";
  let gencode = s.gencode ? `Gencode ${s.gencode}` : "Gencode 30d (ฟรี)";
  if (s.gencode === "37d") gencode = "Gencode 37d (ฟรี)";
  const excl = s.exclusivity_months ? `Exclusivity ${s.exclusivity_months}m` : "No exclusivity";
  const rush = s.rush ? "Rush +10%" : "No rush";
  const health = s.health ? " + Health premium ฿20,000" : "";
  const scope = `${s.bundle==="bundle3"?"Bundle 3 ":""}Format ${s.format||"A"} • ${toPlat(s.platform)} • ${asset} • ${gencode} • ${excl} • ${rush}${health}`;

  const number = (q.exact ?? q.min);
  return { type:"text", text:
`สcope: ${scope}
ค่าบริการโดยประมาณ: ฿${number.toLocaleString()} (ยังไม่รวมภาษี)
สูตร: Base + [Health flat + Asset%×Base + Gencode%×Base + 0.15×Base×Exclusivity + Rush%×Base]
ต้องการใบเสนอราคาไหมคะ?` };
}
function toPlat(p){ return p==="dual"?"Dual (IG+TikTok)":(p==="ig"?"IG Reels":"TikTok"); }

module.exports = {
  classify, extractSlots, trustScore, quoteFor,
  gateQuickReply, askForMissing, quoteText
};
