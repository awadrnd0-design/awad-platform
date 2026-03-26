import { useState, useEffect, useRef, useCallback } from "react";

// ─── SUPABASE ────────────────────────────────────────────────────────
const SB_URL = "https://nxyhstdngyjylryiqzvx.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54eWhzdGRuZ3lqeWxyeWlxenZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MzE4MjksImV4cCI6MjA4ODUwNzgyOX0.voN8i_soAdtoO-BnXwC_qJ4zqqnMo_B__ieREqiHilc";
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

const db = {
  get: (t, f = {}) => {
    let u = `${SB_URL}/rest/v1/${t}?select=*`;
    Object.entries(f).forEach(([k, v]) => { u += `&${k}=eq.${encodeURIComponent(v)}`; });
    return fetch(u, { headers: H }).then(r => r.json());
  },
  insert: (t, d) => fetch(`${SB_URL}/rest/v1/${t}`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(d)
  }).then(r => r.json()),
  update: (t, id, d) => fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, {
    method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(d)
  }).then(r => r.json()),
  updateWhere: (t, field, val, d) => fetch(`${SB_URL}/rest/v1/${t}?${field}=eq.${encodeURIComponent(val)}`, {
    method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(d)
  }).then(r => r.json()),
  del: (t, id) => fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method: "DELETE", headers: H }),
  setting: async (key) => {
    const r = await fetch(`${SB_URL}/rest/v1/settings?key=eq.${key}&select=value`, { headers: H });
    const d = await r.json();
    return d?.[0]?.value;
  },
  setSetting: (key, value) => fetch(`${SB_URL}/rest/v1/settings?key=eq.${key}`, {
    method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ value })
  }),
};

// ─── SIGNED VIDEO URL ────────────────────────────────────────────────
const signedUrlCache = {};
async function getSignedVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  // Extract key from R2 public URL
  const key = videoUrl.replace("https://pub-4ed4d283e4954a3ea2b97c65c554eb0a.r2.dev/", "");
  const cacheKey = key;
  const now = Date.now();
  // Cache for 90 minutes
  if (signedUrlCache[cacheKey] && signedUrlCache[cacheKey].exp > now) {
    return signedUrlCache[cacheKey].url;
  }
  try {
    const res = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (data.url) {
      signedUrlCache[cacheKey] = { url: data.url, exp: now + 90 * 60 * 1000 };
      return data.url;
    }
  } catch {}
  // Fallback to public URL if signing fails
  return videoUrl;
}



// ─── PERSISTENT SESSION ──────────────────────────────────────────────
const SESSION_KEY = "awad_session";
const saveSession  = s => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} };
const loadSession  = ()  => { try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
const clearSession = ()  => { try { localStorage.removeItem(SESSION_KEY); } catch {} };

// ─── CLOUDFLARE R2 ───────────────────────────────────────────────────
const R2_ENDPOINT = "3f8fd387dc687cccf32ce100b90da373.r2.cloudflarestorage.com";
const R2_BUCKET   = "awad-videos";
const R2_PUBLIC   = "https://pub-4ed4d283e4954a3ea2b97c65c554eb0a.r2.dev";
const R2_ACCESS   = "dd6bed24328e883d7703047773fc50c1";
const R2_SECRET   = "bcc4918f083f723f9aea508b8c51de4c99e55b00374c68539ecb197ca91c093d";

async function sha256hex(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? new TextEncoder().encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, typeof msg === "string" ? new TextEncoder().encode(msg) : msg));
}
async function signingKey(secret, date, region, service) {
  let k = await hmac("AWS4" + secret, date);
  k = await hmac(k, region);
  k = await hmac(k, service);
  return hmac(k, "aws4_request");
}
async function uploadToR2(file, onProgress) {
  const ext = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const fileBuffer = await file.arrayBuffer();
  const payloadHash = await sha256hex(new Uint8Array(fileBuffer));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const canonicalUri = `/${R2_BUCKET}/${fileName}`;
  const canonicalHeaders = `content-type:${file.type}\nhost:${R2_ENDPOINT}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${await sha256hex(canonicalRequest)}`;
  const sk = await signingKey(R2_SECRET, dateStamp, region, "s3");
  const sigBytes = await hmac(sk, stringToSign);
  const signature = Array.from(sigBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const authHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `https://${R2_ENDPOINT}/${R2_BUCKET}/${fileName}`);
    xhr.setRequestHeader("Authorization", authHeader);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-amz-content-sha256", payloadHash);
    xhr.setRequestHeader("x-amz-date", amzDate);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => xhr.status < 300 ? resolve(`${R2_PUBLIC}/${fileName}`) : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(fileBuffer);
  });
}

// ─── CODE GENERATOR ──────────────────────────────────────────────────
const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}-${seg()}`;
};

// ─── THEME ───────────────────────────────────────────────────────────
const useDark = () => {
  const [d, setD] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = e => setD(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return d;
};

const mk = dark => ({
  bg:      dark ? "#000000" : "#ffffff",
  bg2:     dark ? "#1c1c1e" : "#f5f5f7",
  bg3:     dark ? "#2c2c2e" : "#e8e8ed",
  card:    dark ? "#1c1c1e" : "#ffffff",
  cardBdr: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  sep:     dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
  text:    dark ? "#f5f5f7" : "#1d1d1f",
  sub:     dark ? "#98989d" : "#6e6e73",
  muted:   dark ? "#48484a" : "#d1d1d6",
  blue:    dark ? "#0a84ff" : "#0071e3",
  blueBg:  dark ? "rgba(10,132,255,0.1)" : "rgba(0,113,227,0.07)",
  green:   dark ? "#30d158" : "#1d8348",
  greenBg: dark ? "rgba(48,209,88,0.1)" : "rgba(29,131,72,0.07)",
  red:     dark ? "#ff453a" : "#d70015",
  redBg:   dark ? "rgba(255,69,58,0.1)" : "rgba(215,0,21,0.06)",
  orange:  dark ? "#ff9f0a" : "#f59e0b",
  shadow:  dark ? "0 1px 0 rgba(255,255,255,0.06),0 4px 16px rgba(0,0,0,0.5)" : "0 1px 0 rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.08)",
  shadowLg:dark ? "0 8px 40px rgba(0,0,0,0.7)" : "0 8px 40px rgba(0,0,0,0.12)",
});

// ─── GLOBAL STYLES ───────────────────────────────────────────────────
const GS = ({ dark }) => (
  <style>{`
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{color-scheme:${dark ? "dark" : "light"};-webkit-text-size-adjust:100%}
    body{background:${dark ? "#000" : "#fff"};font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:17px;line-height:1.47059;letter-spacing:-0.022em;overflow-x:hidden}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-thumb{background:${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"};border-radius:4px}
    input,button,textarea,select{font-family:inherit;letter-spacing:inherit;-webkit-appearance:none}
    input:focus,textarea:focus,select:focus{outline:none}
    button{cursor:pointer;-webkit-tap-highlight-color:transparent}
    ::selection{background:rgba(0,113,227,0.2)}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fade{from{opacity:0}to{opacity:1}}
    @keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .vid-ctrl{opacity:0;transition:opacity 0.3s}
    .vid-wrap:hover .vid-ctrl,.vid-wrap:active .vid-ctrl{opacity:1}
    .vid-wrap:fullscreen .vid-ctrl,:fullscreen .vid-ctrl{opacity:1}
    .speed-btn:hover{background:rgba(255,255,255,0.15)!important}
    /* Block Samsung Internet Smart Video Player overlay */
    video::-webkit-media-controls{display:none!important}
    video::-webkit-media-controls-enclosure{display:none!important}
    video::-webkit-media-controls-panel{display:none!important}
    video::-webkit-media-controls-play-button{display:none!important}
    .vid-wrap video{-webkit-touch-callout:none!important;pointer-events:none!important}
    .tab-content{animation:slideIn 0.25s cubic-bezier(0.4,0,0.2,1)}
    .hover-lift{transition:transform 0.2s,box-shadow 0.2s}
    .hover-lift:hover{transform:translateY(-2px)}
    /* ── Medium screens (tablets, split windows 600-900px) ── */
    @media(max-width:900px){
      .admin-sidebar{width:64px!important}
      .admin-sidebar .sidebar-logo{padding:16px 0!important;text-align:center}
      .admin-sidebar .sidebar-logo .logo-name{display:none!important}
      .admin-sidebar .sidebar-logo .logo-dot{display:block!important;width:8px;height:8px;border-radius:50%;background:currentColor;margin:0 auto}
      .admin-sidebar nav{padding:6px 4px!important}
      .admin-nav-btn span{display:none!important}
      .admin-nav-btn{padding:10px!important;justify-content:center!important;border-radius:10px!important}
      .sidebar-footer .footer-name{display:none!important}
      .sidebar-footer{padding:8px 4px!important}
      .admin-main{padding:24px 20px!important}
      .stat-grid{grid-template-columns:1fr 1fr!important}
      .card-grid{grid-template-columns:1fr!important}
    }
    /* ── Small screens (phones < 600px) ── */
    @media(max-width:600px){
      .admin-sidebar{position:fixed!important;bottom:0!important;left:0!important;right:0!important;width:100%!important;height:56px!important;flex-direction:row!important;border-right:none!important;border-top:1px solid rgba(128,128,128,0.15)!important;z-index:200!important;padding:0!important;overflow-x:auto}
      .admin-sidebar .sidebar-logo{display:none!important}
      .admin-sidebar nav{flex-direction:row!important;padding:0!important;overflow-x:auto!important;gap:0!important;flex:1;height:56px}
      .admin-sidebar .sidebar-footer{display:none!important}
      .admin-main{padding:16px 14px 72px!important}
      .admin-nav-btn{flex-direction:column!important;gap:1px!important;padding:6px 8px!important;font-size:10px!important;border-radius:0!important;min-width:56px!important;align-items:center!important;justify-content:center!important;height:56px!important}
      .admin-nav-btn span{display:block!important;font-size:9px!important;margin-top:2px}
      .admin-nav-btn.active{border-top:2px solid var(--blue)!important;background:transparent!important}
      .stat-grid{grid-template-columns:1fr 1fr!important}
      .card-grid{grid-template-columns:1fr!important}
      .student-nav-links button{padding:0 8px!important;font-size:13px!important}
    }
  `}</style>
);

// ─── PRIMITIVES ──────────────────────────────────────────────────────
const Spinner = ({ size = 20, color }) => (
  <div style={{ width: size, height: size, border: `2px solid rgba(128,128,128,0.2)`, borderTopColor: color || "#0071e3", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
);

const Btn = ({ children, onClick, disabled, full, sm, variant = "primary", t }) => {
  const [hov, setHov] = useState(false);
  const s = {
    primary:   { bg: hov ? "#0077ed" : t.blue, color: "#fff", border: "none" },
    secondary: { bg: hov ? t.bg3 : t.bg2, color: t.text, border: `1px solid ${t.sep}` },
    danger:    { bg: hov ? t.redBg : "transparent", color: t.red, border: `1px solid ${t.red}30` },
    ghost:     { bg: hov ? t.bg2 : "transparent", color: t.sub, border: "none" },
  }[variant];
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: s.bg, color: s.color, border: s.border || "none", borderRadius: sm ? 8 : 12, padding: sm ? "6px 14px" : "12px 22px", fontSize: sm ? 13 : 15, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", width: full ? "100%" : "auto", whiteSpace: "nowrap", transform: hov && !disabled ? "scale(1.01)" : "none", WebkitTapHighlightColor: "transparent" }}>
      {children}
    </button>
  );
};

const Input = ({ label, value, onChange, type = "text", placeholder, t, hint, autoFocus }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ background: t.bg2, border: `1.5px solid ${focused ? t.blue : "transparent"}`, borderRadius: 10, padding: "11px 14px", color: t.text, fontSize: 15, transition: "border-color 0.15s", boxShadow: focused ? `0 0 0 4px ${t.blueBg}` : "none" }} />
      {hint && <span style={{ fontSize: 12, color: t.sub }}>{hint}</span>}
    </div>
  );
};

const Track = ({ value = 0, color, h = 4, t }) => (
  <div style={{ height: h, borderRadius: h, background: t.bg3, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", background: color || t.blue, borderRadius: h, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
  </div>
);

const Tag = ({ children, color, t }) => (
  <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, background: (color || t.blue) + "14", color: color || t.blue, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
    {children}
  </span>
);

const Av = ({ name = "?", size = 32, t }) => {
  const colors = [t.blue, t.green, "#ff9f0a", "#bf5af2", "#ff375f"];
  const c = colors[(name.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: c + "18", display: "flex", alignItems: "center", justifyContent: "center", color: c, fontSize: size * 0.38, fontWeight: 600 }}>
      {name[0]?.toUpperCase()}
    </div>
  );
};

const Card = ({ children, t, style: sx, onClick, hover }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => hover && setHov(true)} onMouseLeave={() => hover && setHov(false)}
      style={{ background: t.card, border: `1px solid ${t.cardBdr}`, borderRadius: 18, boxShadow: hov ? t.shadowLg : t.shadow, transition: "box-shadow 0.25s cubic-bezier(0.4,0,0.2,1),transform 0.25s cubic-bezier(0.4,0,0.2,1),border-color 0.25s", transform: hov ? "translateY(-2px)" : "none", cursor: onClick ? "pointer" : "default", ...sx }}>
      {children}
    </div>
  );
};

const Stat = ({ label, value, t, i = 0 }) => (
  <Card t={t} style={{ padding: "20px 22px", animation: `fadeUp 0.4s ease ${i * 0.06}s both` }}>
    <div style={{ fontSize: 32, fontWeight: 300, color: t.text, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 6 }}>{value}</div>
    <div style={{ fontSize: 14, color: t.sub }}>{label}</div>
  </Card>
);

const Sep = ({ t }) => <div style={{ height: 1, background: t.sep }} />;

// ─── SPLASH ──────────────────────────────────────────────────────────
function Splash({ t }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, zIndex: 9999 }}>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.35em", color: t.text, textTransform: "uppercase" }}>AWAD</div>
      <Spinner color={t.blue} />
    </div>
  );
}

// ─── AUTH ────────────────────────────────────────────────────────────

// ─── TERMS MODAL ─────────────────────────────────────────────────────
function TermsModal({ onClose, t }) {
  const ARTICLES = [
    ["Article 1 — Acceptance of Terms",
     "By registering on AWAD Educational Platform, you unconditionally accept these Terms and Conditions in full. These Terms constitute a legally binding agreement between you and AWAD Educational Platform, governed by the laws of the Arab Republic of Egypt, including but not limited to Law No. 175 of 2018 on Combating Information Technology Crimes and Law No. 82 of 2002 on the Protection of Intellectual Property Rights."],
    ["Article 2 — Account Access & Credentials",
     "Access to AWAD is granted exclusively to the registered account holder. You are strictly prohibited from sharing, selling, or otherwise transferring your account credentials to any third party. Any breach of this obligation shall result in immediate and permanent account termination without prior notice and without entitlement to any refund."],
    ["Article 3 — Intellectual Property Rights",
     "All content published on AWAD — including without limitation video lectures, course materials, assessments, and any associated media — constitutes the exclusive intellectual property of AWAD Educational Platform. This content is fully protected under Egyptian and international intellectual property law. Any unauthorized reproduction, distribution, public display, or commercial exploitation is expressly prohibited and shall be prosecuted to the fullest extent of the law."],
    ["Article 4 — Prohibited Conduct",
     "The following acts are strictly and absolutely prohibited: (a) Recording, copying, screenshotting, or capturing any course content by any means; (b) Distributing, uploading, or sharing content on any platform, channel, or medium; (c) Reselling, sublicensing, or commercially exploiting any portion of the platform; (d) Circumventing, disabling, or otherwise undermining any technical protection measure employed by the platform. Violation of any of the above constitutes grounds for civil liability and criminal prosecution under Egyptian law."],
    ["Article 5 — Digital Watermarking & Identification",
     "AWAD deploys advanced digital watermarking technology that permanently and uniquely identifies each user within all accessed content. In the event of unauthorized distribution or leakage of any content, this identifying information shall be submitted as legally admissible evidence to the competent authorities without further notice to the user."],
    ["Article 6 — User Representations & Obligations",
     "By using this platform, you represent and warrant that: (a) All personal information provided is accurate, complete, and current; (b) You are using the platform solely for your personal, non-commercial educational purposes; (c) You will promptly notify AWAD of any unauthorized access to or use of your account."],
    ["Article 7 — Termination",
     "AWAD reserves the absolute and unconditional right to suspend or permanently terminate any account at any time, with or without cause, and without liability to the user. Termination does not waive AWAD's right to pursue any legal remedies arising from prior violations."],
    ["Article 8 — Governing Law & Jurisdiction",
     "These Terms shall be exclusively governed by and construed in accordance with the laws of the Arab Republic of Egypt. Any dispute, claim, or controversy arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the competent Egyptian courts."],
    ["Article 9 — Amendments",
     "AWAD reserves the right to modify these Terms at any time without prior notice. Your continued use of the platform following any amendment constitutes your binding acceptance of the revised Terms."],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(16px)" }}>
      <Card t={t} style={{ width: "100%", maxWidth: 580, maxHeight: "88vh", display: "flex", flexDirection: "column", animation: "scaleIn 0.22s ease" }}>
        {/* Header */}
        <div style={{ padding: "22px 28px", borderBottom: `1px solid ${t.sep}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: t.sub, textTransform: "uppercase", marginBottom: 6 }}>AWAD Educational Platform</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: t.text, letterSpacing: "-0.01em" }}>Terms & Conditions</div>
              <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Effective {new Date().getFullYear()} · Governed by Egyptian Law</div>
            </div>
            <button onClick={onClose} style={{ background: t.bg2, border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, fontSize: 14, cursor: "pointer", flexShrink: 0, marginLeft: 16 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px", overflow: "auto", flex: 1 }}>
          <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.7, marginBottom: 24, padding: "12px 16px", background: t.bg2, borderRadius: 10, borderLeft: `3px solid ${t.blue}` }}>
            Please read these Terms carefully. By proceeding, you acknowledge that you have read, understood, and unconditionally agree to be bound by all provisions set forth herein.
          </div>
          {ARTICLES.map(([title, text]) => (
            <div key={title} style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 7, letterSpacing: "0.01em" }}>{title}</div>
              <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.8 }}>{text}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px", borderTop: `1px solid ${t.sep}`, flexShrink: 0, display: "flex", gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: t.blue, border: "none", borderRadius: 10, padding: "12px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", letterSpacing: "0.01em" }}>
            I Acknowledge and Accept
          </button>
          <button onClick={onClose}
            style={{ background: t.bg2, border: `1px solid ${t.sep}`, borderRadius: 10, padding: "12px 18px", color: t.sub, fontSize: 14, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── NAME COLLECTION SCREEN ──────────────────────────────────────────
function NameCollectionScreen({ onComplete, t }) {
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [gender,    setGender]    = useState("");
  const [pledge,    setPledge]    = useState(false);
  const [terms,     setTerms]     = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [err,       setErr]       = useState("");
  const [loading,   setLoading]   = useState(false);
  const [exiting,   setExiting]   = useState(false);

  const validateName = n => {
    const v = n.trim();
    if (v.length < 3) return "too short";
    if (!/^[a-zA-Z]{1,2}$/.test(v) === false) return "abbreviation";
    if (!/^[a-zA-Z]/.test(v)) return "not english";
    if (/[^a-zA-Z\s\-']/.test(v)) return "invalid chars";
    return true;
  };

  const submit = async () => {
    setErr("");
    const fn = validateName(firstName);
    const ln = validateName(lastName);
    if (fn !== true) return setErr(fn === "not english" || fn === "invalid chars" ? "Names must be written in English only." : "Please enter a valid first name — minimum 3 characters.");
    if (ln !== true) return setErr(ln === "not english" || ln === "invalid chars" ? "Names must be written in English only." : "Please enter a valid last name — minimum 3 characters.");
    if (!gender) return setErr("Please select your gender.");
    if (!terms)  return setErr("You must accept the Terms & Conditions before continuing.");
    if (!pledge) return setErr("You must accept the pledge before continuing.");
    setLoading(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    setExiting(true);
    window._pendingGender = gender;
    await new Promise(r => setTimeout(r, 520));
    await onComplete(fullName);
    setLoading(false);
  };

  const ready = firstName.trim().length >= 3 && lastName.trim().length >= 3 && gender && pledge && terms;

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');`}</style>
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} t={t} />}
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px", opacity: exiting ? 0 : 1, transform: exiting ? "scale(1.04) translateY(-8px)" : "scale(1) translateY(0)", transition: "opacity 0.52s cubic-bezier(0.4,0,0.2,1), transform 0.52s cubic-bezier(0.4,0,0.2,1)" }}>
        <div style={{ width: "100%", maxWidth: 440, animation: "fadeUp 0.5s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.35em", color: t.text, textTransform: "uppercase", marginBottom: 10 }}>AWAD</div>
            <div style={{ fontSize: 26, fontWeight: 300, color: t.text, marginBottom: 6, letterSpacing: "-0.02em" }}>Almost there</div>
            <div style={{ fontSize: 14, color: t.sub }}>Enter your full legal name to continue.</div>
          </div>

          <Card t={t} style={{ padding: "28px 24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* First name */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Ahmed" autoFocus
                  style={{ background: t.bg2, border: "1.5px solid transparent", borderRadius: 10, padding: "12px 14px", color: t.text, fontSize: 15, width: "100%", transition: "border-color 0.15s" }}
                  onFocus={e => e.target.style.borderColor = t.blue} onBlur={e => e.target.style.borderColor = "transparent"} />
              </div>

              {/* Last name */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Al-Rashidi"
                  style={{ background: t.bg2, border: "1.5px solid transparent", borderRadius: 10, padding: "12px 14px", color: t.text, fontSize: 15, width: "100%", transition: "border-color 0.15s" }}
                  onFocus={e => e.target.style.borderColor = t.blue} onBlur={e => e.target.style.borderColor = "transparent"}
                  onKeyDown={e => e.key === "Enter" && submit()} />
              </div>

              {/* Gender */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>Gender</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {["Male", "Female"].map(g => (
                    <button key={g} type="button" onClick={() => setGender(g)}
                      style={{ flex: 1, padding: "11px", borderRadius: 10, background: gender === g ? t.blueBg : t.bg2, border: `1.5px solid ${gender === g ? t.blue : "transparent"}`, color: gender === g ? t.blue : t.sub, fontSize: 14, fontWeight: gender === g ? 500 : 400, cursor: "pointer", transition: "all 0.18s" }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 12, color: t.sub, background: t.bg2, borderRadius: 8, padding: "9px 12px", lineHeight: 1.5 }}>
                Your name will be embedded in all course videos as part of our content protection system. Use your real legal name.
              </div>

              {/* Terms & Conditions */}
              <div style={{ background: t.bg2, border: `1.5px solid ${terms ? t.blue + "40" : t.sep}`, borderRadius: 12, padding: "14px 16px", transition: "border-color 0.2s" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }} onClick={() => setTerms(v => !v)}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${terms ? t.blue : t.muted}`, background: terms ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s", flexShrink: 0, marginTop: 1 }}>
                    {terms && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 13, color: t.text, lineHeight: 1.65 }}>
                    I have read and agree to the{" "}
                    <span onClick={e => { e.stopPropagation(); setShowTerms(true); }}
                      style={{ color: t.blue, fontWeight: 500, textDecoration: "underline", cursor: "pointer" }}>
                      Terms & Conditions
                    </span>
                    . Sharing or distributing course content is strictly prohibited and subject to legal action under Egyptian law.
                  </span>
                </label>
              </div>

              {/* Arabic Pledge - reduced tashkeel, dark red */}
              <div style={{ background: t.bg2, border: `1.5px solid ${pledge ? "#c0392b40" : t.sep}`, borderRadius: 12, padding: "14px 16px", transition: "border-color 0.2s" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }} onClick={() => setPledge(v => !v)}>
                  <span style={{ fontSize: 19, lineHeight: 2.1, direction: "rtl", textAlign: "right", fontFamily: "'Amiri', 'Traditional Arabic', serif", color: "#c0392b", flex: 1 }}>
                    أتعهدُ أمامَ اللهِ وبضميري أنني لن أقومَ بتسريبِ أيِّ محتوىً تعليميٍّ أو مشاركتِه أو المتاجرةِ به، وأُدركُ أنَّ الإخلالَ بهذا التعهدِ خيانةٌ للأمانةِ تستوجبُ المساءلةَ أمامَ اللهِ والقانونِ.
                  </span>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${pledge ? "#c0392b" : t.muted}`, background: pledge ? "#c0392b" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s", flexShrink: 0, marginTop: 4 }}>
                    {pledge && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </label>
              </div>

              {err && <div style={{ background: t.redBg, border: `1px solid ${t.red}22`, borderRadius: 8, padding: "10px 14px", color: t.red, fontSize: 13, animation: "fadeUp 0.2s ease" }}>{err}</div>}

              <button onClick={submit} disabled={loading || !ready}
                style={{ background: ready ? t.blue : t.bg3, border: "none", borderRadius: 12, padding: "14px", color: ready ? "#fff" : t.muted, fontSize: 15, fontWeight: 500, cursor: ready ? "pointer" : "not-allowed", transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loading ? <Spinner size={16} color="#fff" /> : "Enter AWAD →"}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Auth({ onLogin, t }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [keep, setKeep] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [signupsOpen, setSignupsOpen] = useState(true);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    db.setting("signups_open").then(v => setSignupsOpen(v !== "false"));
  }, []);

  const login = async () => {
    setErr(""); setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password: pass })
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); setLoading(false); return; }
      setLoading(false);
      return onLogin(data.role, data.user, keep);
    } catch { setErr("Something went wrong. Please try again."); }
    setLoading(false);
  };

  const signup = async () => {
    if (!name || !email || !pass) return setErr("Please fill in all fields.");
    if (pass.length < 6) return setErr("Password must be at least 6 characters.");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signup", name, email, password: pass })
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); setLoading(false); return; }
      onLogin("student", data.user, keep);
    } catch { setErr("Something went wrong. Please try again."); }
    setLoading(false);
  };

  const oauth = () => { window.location.href = `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=https://awad-platform.vercel.app`; };

  const sendForgot = async () => {
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      await fetch(`${SB_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SB_KEY },
        body: JSON.stringify({ 
          email: forgotEmail,
          redirect_to: "https://awad-platform.vercel.app"
        })
      });
      setForgotSent(true);
    } catch {}
    setForgotLoading(false);
  };

  if (forgotMode) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, animation: "fadeUp 0.5s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.35em", color: t.text, textTransform: "uppercase" }}>AWAD</div>
        </div>
        <Card t={t} style={{ padding: "28px 24px" }}>
          {forgotSent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: t.greenBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22, color: t.green }}>✓</div>
              <div style={{ fontSize: 17, fontWeight: 500, color: t.text, marginBottom: 8 }}>Check your email</div>
              <div style={{ fontSize: 14, color: t.sub, marginBottom: 22, lineHeight: 1.5 }}>We sent a password reset link to <b>{forgotEmail}</b></div>
              <Btn variant="secondary" onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); }} t={t}>Back to Sign In</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: t.text }}>Reset password</div>
              <div style={{ fontSize: 14, color: t.sub }}>Enter your email and we'll send you a reset link.</div>
              <Input label="Email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} type="email" placeholder="you@example.com" t={t} autoFocus />
              <Btn onClick={sendForgot} disabled={forgotLoading || !forgotEmail} full t={t}>
                {forgotLoading ? <Spinner size={16} color="#fff" /> : "Send Reset Link"}
              </Btn>
              <button onClick={() => setForgotMode(false)} style={{ background: "none", border: "none", color: t.sub, fontSize: 14, cursor: "pointer", textAlign: "center" }}>← Back to Sign In</button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, animation: "fadeUp 0.5s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.35em", color: t.text, textTransform: "uppercase" }}>AWAD</div>
        </div>
        <Card t={t} style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${t.sep}` }}>
            {[["login", "Sign In"], ...(signupsOpen ? [["signup", "Create Account"]] : [])].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setErr(""); setDone(false); }}
                style={{ flex: 1, padding: 14, background: "transparent", border: "none", borderBottom: `2px solid ${mode === m ? t.blue : "transparent"}`, color: mode === m ? t.blue : t.sub, fontSize: 14, fontWeight: mode === m ? 600 : 400, cursor: "pointer", transition: "all 0.15s", marginBottom: -1 }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ padding: "28px 24px" }}>
            {done ? (
              <div style={{ textAlign: "center", animation: "scaleIn 0.3s ease" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: t.greenBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22, color: t.green }}>✓</div>
                <div style={{ fontSize: 17, fontWeight: 500, color: t.text, marginBottom: 8 }}>Account created</div>
                <div style={{ fontSize: 14, color: t.sub, lineHeight: 1.5, marginBottom: 22 }}>You can now sign in with your credentials.</div>
                <Btn variant="secondary" onClick={() => { setMode("login"); setDone(false); }} t={t}>Sign In</Btn>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <button onClick={oauth}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: t.bg2, border: `1px solid ${t.sep}`, borderRadius: 10, padding: 11, color: t.text, fontSize: 15, cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = t.bg3}
                  onMouseLeave={e => e.currentTarget.style.background = t.bg2}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Sep t={t} /><span style={{ fontSize: 13, color: t.muted, flexShrink: 0 }}>or</span><Sep t={t} />
                </div>
                {mode === "signup" && <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" t={t} />}
                <Input label="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" t={t} autoFocus={mode === "login"} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>Password</label>
                    {mode === "login" && <button type="button" onClick={() => setForgotMode(true)} style={{ background: "none", border: "none", color: t.blue, fontSize: 13, cursor: "pointer", padding: 0 }}>Forgot password?</button>}
                  </div>
                  <div style={{ position: "relative" }}>
                    <input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••"
                      style={{ background: t.bg2, border: "1.5px solid transparent", borderRadius: 10, padding: "11px 44px 11px 14px", color: t.text, fontSize: 15, width: "100%", transition: "border-color 0.15s" }}
                      onFocus={e => e.target.style.borderColor = t.blue}
                      onBlur={e => e.target.style.borderColor = "transparent"} />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.sub, cursor: "pointer", padding: 4, lineHeight: 1, display: "flex", alignItems: "center" }}>
                      {showPass
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>

                {/* Keep me signed in */}
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }} onClick={() => setKeep(k => !k)}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${keep ? t.blue : t.muted}`, background: keep ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}>
                    {keep && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 14, color: t.sub }}>Keep me signed in</span>
                </label>


                {err && <div style={{ background: t.redBg, border: `1px solid ${t.red}22`, borderRadius: 8, padding: "10px 14px", color: t.red, fontSize: 13 }}>{err}</div>}
                <Btn onClick={mode === "login" ? login : signup} disabled={loading} full t={t}>
                  {loading ? <Spinner size={16} color="#fff" /> : mode === "login" ? "Sign In" : "Create Account"}
                </Btn>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── VIDEO PLAYER ────────────────────────────────────────────────────
function VideoPlayer({ lesson, userEmail, userName, onClose, onComplete, t, resumeFrom, onSaveTime }) {
  const videoRef    = useRef(null);
  const wrapRef     = useRef(null);
  const seekBarRef  = useRef(null);
  const seekHitRef  = useRef(null);
  const hideTimer   = useRef(null);
  const seekDrag    = useRef(false);
  const tapTimer    = useRef(null);
  const tapCount    = useRef(0);
  const saveTimer   = useRef(null);
  const frameRef    = useRef(null);

  const [playing,      setPlaying]      = useState(false);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [buffered,     setBuffered]      = useState(0);
  const [volume,       setVolume]       = useState(() => parseFloat(localStorage.getItem("awad_vol") || "1"));
  const [muted,        setMuted]        = useState(false);
  const [speed,        setSpeed]        = useState(1);
  const [showSpeed,    setShowSpeed]    = useState(false);
  const [fullscreen,   setFullscreen]   = useState(false);
  const [showCtrl,     setShowCtrl]     = useState(true);
  const [done,         setDone]         = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [signedUrl,    setSignedUrl]    = useState(null);
  const [seekPct,      setSeekPct]      = useState(0);
  const [hoverInfo,    setHoverInfo]    = useState(null);
  const [thumbUrl,     setThumbUrl]     = useState(null);
  const [skipAnim,     setSkipAnim]     = useState(null);
  const [showResume,   setShowResume]   = useState(false);
  const [isMobile,     setIsMobile]     = useState(false);
  const [isLandscape,  setIsLandscape]  = useState(false);

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Detect mobile & orientation
  useEffect(() => {
    const check = () => {
      setIsMobile(window.matchMedia("(pointer: coarse)").matches);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };
  }, []);

  // Signed URL
  useEffect(() => {
    if (lesson.video_url) getSignedVideoUrl(lesson.video_url).then(url => setSignedUrl(url));
  }, [lesson.video_url]);

  // Resume prompt - show only once on mount, never again
  const resumeShown = useRef(false);
  useEffect(() => {
    if (resumeFrom && resumeFrom > 5 && !resumeShown.current) {
      resumeShown.current = true;
      setShowResume(true);
    }
  }, []); // empty deps — runs once only

  // Save progress every 10s
  useEffect(() => {
    clearInterval(saveTimer.current);
    if (playing) {
      saveTimer.current = setInterval(() => {
        if (videoRef.current) onSaveTime?.(Math.floor(videoRef.current.currentTime));
      }, 10000);
    }
    return () => clearInterval(saveTimer.current);
  }, [playing]);

  const fmt = s => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
  };

  const revealCtrl = () => {
    setShowCtrl(true);
    clearTimeout(hideTimer.current);
    if (videoRef.current && !videoRef.current.paused) {
      hideTimer.current = setTimeout(() => setShowCtrl(false), 3500);
    }
  };

  // Video events
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onMeta   = () => { setDuration(v.duration); setLoading(false); };
    const onTime   = () => {
      if (!seekDrag.current) { setCurrentTime(v.currentTime); setSeekPct(v.duration ? (v.currentTime / v.duration) * 100 : 0); }
      if (v.buffered.length) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
      if (!done && v.currentTime / v.duration > 0.97) { setDone(true); onComplete?.(); }
    };
    const onPlay   = () => { setPlaying(true); hideTimer.current = setTimeout(() => setShowCtrl(false), 3500); };
    const onPause  = () => { setPlaying(false); setShowCtrl(true); clearTimeout(hideTimer.current); };
    const onWait   = () => setLoading(true);
    const onResume = () => setLoading(false);
    const onEnded  = () => { setDone(true); setPlaying(false); setShowCtrl(true); onComplete?.(); };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWait);
    v.addEventListener("playing", onResume);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("playing", onResume);
      v.removeEventListener("ended", onEnded);
    };
  }, [done]);

  // Fullscreen
  useEffect(() => {
    const onFS = () => setFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFS);
    document.addEventListener("webkitfullscreenchange", onFS);
    return () => { document.removeEventListener("fullscreenchange", onFS); document.removeEventListener("webkitfullscreenchange", onFS); };
  }, []);

  // Samsung block
  useEffect(() => {
    const onHide = () => { const v = videoRef.current; if (v && !v.paused) { v.pause(); setPlaying(false); } };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === "INPUT") return;
      revealCtrl();
      if (e.code === "Space" || e.code === "KeyK") { e.preventDefault(); togglePlay(); }
      if (e.code === "ArrowRight" || e.code === "KeyL") { e.preventDefault(); skip(10); }
      if (e.code === "ArrowLeft"  || e.code === "KeyJ") { e.preventDefault(); skip(-10); }
      if (e.code === "ArrowUp")   { e.preventDefault(); setVol(Math.min(1, volume + 0.1)); }
      if (e.code === "ArrowDown") { e.preventDefault(); setVol(Math.max(0, volume - 0.1)); }
      if (e.code === "KeyF") toggleFS();
      if (e.code === "KeyM") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [volume]);

  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); revealCtrl(); };
  const skip = secs => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + secs));
    setSkipAnim(secs > 0 ? "right" : "left");
    setTimeout(() => setSkipAnim(null), 700);
    revealCtrl();
  };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); };
  const setVol = val => {
    const v = videoRef.current; if (!v) return;
    const c = Math.max(0, Math.min(1, val));
    v.volume = c; v.muted = c === 0; setVolume(c); setMuted(c === 0);
    localStorage.setItem("awad_vol", c);
  };
  const setSpd = s => { const v = videoRef.current; if (!v) return; v.playbackRate = s; setSpeed(s); setShowSpeed(false); };

  // Seek
  const getSeekPct = e => {
    const ref = seekHitRef.current || seekBarRef.current; if (!ref) return 0;
    const r = ref.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (cx - r.left) / r.width));
  };
  const captureThumb = timeSec => {
    const v = videoRef.current; if (!v || !duration) return;
    const canvas = document.createElement("canvas");
    const tmp = document.createElement("video");
    tmp.src = v.src; tmp.crossOrigin = "anonymous"; tmp.muted = true;
    tmp.addEventListener("seeked", () => {
      try { canvas.width = 160; canvas.height = 90; canvas.getContext("2d").drawImage(tmp, 0, 0, 160, 90); setThumbUrl(canvas.toDataURL("image/jpeg", 0.6)); } catch {}
    }, { once: true });
    tmp.currentTime = Math.max(0, Math.min(duration, timeSec));
  };
  const onSeekDown = e => {
    e.preventDefault(); seekDrag.current = true;
    const p = getSeekPct(e); setSeekPct(p * 100);
    if (videoRef.current) videoRef.current.currentTime = p * duration;
    revealCtrl();
  };
  const onSeekMove = e => {
    const ref = seekHitRef.current; if (!ref) return;
    const r = ref.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const p = Math.max(0, Math.min(1, (cx - r.left) / r.width));
    const clamped = Math.max(20, Math.min(r.width - 20, cx - r.left));
    setHoverInfo({ pct: p * 100, time: fmt(p * duration), x: clamped });
    captureThumb(p * duration);
    if (seekDrag.current) { setSeekPct(p * 100); if (videoRef.current) videoRef.current.currentTime = p * duration; }
  };
  const onSeekUp = e => {
    if (!seekDrag.current) return; seekDrag.current = false;
    const p = getSeekPct(e);
    if (videoRef.current) videoRef.current.currentTime = p * duration;
    setHoverInfo(null); setThumbUrl(null);
  };

  // Tap zones
  const handleTap = e => {
    if (e.target.closest("[data-seek]")) return;
    const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const x = cx - rect.left, third = rect.width / 3;
    tapCount.current++;
    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => { tapCount.current = 0; if (!e.touches) togglePlay(); else revealCtrl(); }, 260);
    } else if (tapCount.current === 2) {
      clearTimeout(tapTimer.current); tapCount.current = 0;
      if (x < third) skip(-10); else if (x > third * 2) skip(10); else togglePlay();
    }
  };

  const toggleFS = () => {
    const v = videoRef.current, wrap = wrapRef.current;
    if (v?.webkitEnterFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) { v.webkitEnterFullscreen(); return; }
    const isFS = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFS) { const el = wrap || v; el?.requestFullscreen ? el.requestFullscreen() : el?.webkitRequestFullscreen?.(); }
    else { document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.(); }
  };

  const hasVideo = !!(signedUrl || lesson.video_url);
  const pct = duration ? (currentTime / duration) * 100 : 0;

  // Thin always-visible progress bar at very bottom
  const ThinBar = () => (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, zIndex: 6, pointerEvents: "none" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: "rgba(255,255,255,0.5)", transition: "width 0.4s linear" }} />
    </div>
  );

  // SVG icon helpers
  const Icon = ({ path, size = 22, fill = "none", stroke = "white", sw = 2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{path}</svg>
  );
  const PlayI  = () => <Icon fill="white" stroke="none" path={<path d="M5 3l14 9L5 21V3z"/>} />;
  const PauseI = () => <Icon fill="white" stroke="none" path={<><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>} />;
  const Back10 = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="rgba(255,255,255,0.85)"/>
      <text x="12" y="14.5" textAnchor="middle" fontSize="6.5" fill="rgba(255,255,255,0.85)" fontFamily="system-ui,sans-serif" fontWeight="600">10</text>
    </svg>
  );
  const Fwd10 = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" fill="rgba(255,255,255,0.85)"/>
      <text x="12" y="14.5" textAnchor="middle" fontSize="6.5" fill="rgba(255,255,255,0.85)" fontFamily="system-ui,sans-serif" fontWeight="600">10</text>
    </svg>
  );
  const FSI = () => fullscreen
    ? <Icon path={<><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></>} stroke="rgba(255,255,255,0.85)" />
    : <Icon path={<><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></>} stroke="rgba(255,255,255,0.85)" />;

  const VolI = () => muted || volume === 0
    ? <Icon path={<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>} stroke="rgba(255,255,255,0.8)" />
    : volume < 0.5
      ? <Icon path={<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>} stroke="rgba(255,255,255,0.8)" />
      : <Icon path={<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>} stroke="rgba(255,255,255,0.8)" />;

  const ctrlBtn = (onClick, children, extra = {}) => (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      style={{ background: "none", border: "none", cursor: "pointer", padding: isMobile ? "10px 8px" : "6px 8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, WebkitTapHighlightColor: "transparent", ...extra }}>
      {children}
    </button>
  );

  return (
    <div ref={wrapRef} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "#000", display: "flex", flexDirection: "column", userSelect: "none", touchAction: "none" }}
      onMouseMove={revealCtrl}
      onTouchStart={handleTap}
      onClick={() => setShowSpeed(false)}>

      {/* Video */}
      {hasVideo ? (
        <>
          <video ref={videoRef} src={signedUrl || lesson.video_url}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
            playsInline crossOrigin="anonymous"
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture disableRemotePlayback
            onContextMenu={e => e.preventDefault()} />
          <div style={{ position: "absolute", inset: 0, zIndex: 3 }}
            onContextMenu={e => e.preventDefault()} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
            <div style={{ fontSize: 15 }}>No video uploaded yet</div>
          </div>
        </div>
      )}

      {/* Watermark — sharp, low opacity, no blur/shadow */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 2 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ position: "absolute", left: "-20%", right: "-20%", top: 0, display: "flex", alignItems: "center", justifyContent: "center", transform: `rotate(-15deg) translateY(${i * 140 - 60}px)` }}>
            <div style={{ fontSize: 11, fontFamily: "ui-monospace,monospace", whiteSpace: "nowrap", userSelect: "none", letterSpacing: 6, fontWeight: 400, color: "rgba(255,255,255,0.11)", WebkitFontSmoothing: "none", MozOsxFontSmoothing: "unset" }}>
              {[...Array(6)].fill(userEmail).join("     ·     ")}
            </div>
          </div>
        ))}
      </div>

      {/* Buffering spinner */}
      {loading && hasVideo && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
          <div style={{ width: 48, height: 48, border: "3px solid rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.8)", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
        </div>
      )}

      {/* Skip animation */}
      {skipAnim && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: skipAnim === "left" ? "flex-start" : "flex-end", pointerEvents: "none", zIndex: 6, padding: "0 32px" }}>
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: "50%", width: 80, height: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "scaleIn 0.15s ease", backdropFilter: "blur(4px)" }}>
            <span style={{ fontSize: 26, color: "#fff" }}>{skipAnim === "left" ? "↺" : "↻"}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2, fontWeight: 600 }}>10s</span>
          </div>
        </div>
      )}

      {/* Resume prompt */}
      {showResume && !done && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 11, animation: "fade 0.2s ease" }}>
          <div style={{ background: "rgba(28,28,30,0.96)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "32px 36px", textAlign: "center", maxWidth: 300, width: "90%" }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: "#fff", marginBottom: 6 }}>Continue watching?</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 24 }}>
              You left off at <span style={{ color: "#fff", fontFamily: "ui-monospace,monospace", fontWeight: 600 }}>{fmt(resumeFrom)}</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowResume(false); if (videoRef.current) { videoRef.current.currentTime = 0; setSeekPct(0); } }}
                style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "11px", color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer", fontWeight: 500 }}>
                Start over
              </button>
              <button onClick={() => { setShowResume(false); if (videoRef.current) { videoRef.current.currentTime = resumeFrom; setSeekPct(duration ? (resumeFrom / duration) * 100 : 0); } setTimeout(() => videoRef.current?.play(), 80); }}
                style={{ flex: 1, background: "#0a84ff", border: "none", borderRadius: 12, padding: "11px", color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 500 }}>
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion overlay */}
      {done && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.84)", backdropFilter: "blur(10px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, zIndex: 10 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(48,209,88,0.15)", border: "1.5px solid rgba(48,209,88,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#30d158", fontSize: 30 }}>✓</div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 300, letterSpacing: "-0.01em" }}>Lecture complete</div>
          <button onClick={onClose} style={{ background: "#fff", border: "none", borderRadius: 14, padding: "13px 36px", color: "#000", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Continue</button>
        </div>
      )}

      {/* Speed bottom sheet on mobile */}
      {showSpeed && isMobile && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20 }} onClick={() => setShowSpeed(false)}>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(18,18,20,0.98)", borderRadius: "20px 20px 0 0", padding: "8px 0 32px", animation: "fadeUp 0.22s ease" }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, margin: "12px auto 20px" }} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: 12, letterSpacing: "0.05em", textTransform: "uppercase" }}>Playback Speed</div>
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpd(s)}
                style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", background: "transparent", border: "none", color: speed === s ? "#0a84ff" : "rgba(255,255,255,0.8)", fontSize: 16, fontWeight: speed === s ? 600 : 400, cursor: "pointer" }}>
                <span>{s === 1 ? "Normal" : `${s}×`}</span>
                {speed === s && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thin persistent progress bar */}
      <ThinBar />

      {/* User info - above seekbar, below video content */}
      <div style={{ position: "absolute", bottom: isMobile ? 108 : 90, left: "50%", transform: "translateX(-50%)", zIndex: 8, pointerEvents: "none", whiteSpace: "nowrap" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "3px 10px" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "ui-monospace,monospace", letterSpacing: "0.04em" }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{userName}</span>
            {" · "}{userEmail}
          </span>
        </div>
      </div>

      {/* Controls overlay */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 7, pointerEvents: "none" }}>

        {/* Top bar */}
        <div style={{ background: "linear-gradient(to bottom,rgba(0,0,0,0.8) 0%,transparent 100%)", padding: isMobile ? "14px 16px 36px" : "16px 20px 40px", display: "flex", alignItems: "center", gap: 12, opacity: showCtrl ? 1 : 0, transition: "opacity 0.3s", pointerEvents: showCtrl ? "auto" : "none" }}>
          <button onClick={e => { e.stopPropagation(); onClose(); }}
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", borderRadius: 8, color: "#fff", padding: isMobile ? "8px 14px" : "7px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            {!isMobile && "Back"}
          </button>
          <span style={{ color: "rgba(255,255,255,0.88)", fontSize: isMobile ? 14 : 15, fontWeight: 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.title}</span>
          {speed !== 1 && !isMobile && <span style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 10px", color: "#fff", fontSize: 12, fontFamily: "ui-monospace,monospace" }}>{speed}×</span>}
        </div>

        {/* Bottom controls */}
        <div style={{ background: "linear-gradient(to top,rgba(0,0,0,0.92) 0%,transparent 100%)", padding: isMobile ? "36px 12px 12px" : "40px 18px 14px", opacity: showCtrl ? 1 : 0, transition: "opacity 0.3s", pointerEvents: showCtrl ? "auto" : "none" }}>

          {/* Seekbar */}
          <div style={{ marginBottom: isMobile ? 10 : 8, position: "relative" }} data-seek>
            {/* Thumbnail preview */}
            {hoverInfo && !isMobile && (
              <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: hoverInfo.x, transform: "translateX(-50%)", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                {thumbUrl && <div style={{ width: 128, height: 72, borderRadius: 6, overflow: "hidden", border: "2px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 20px rgba(0,0,0,0.8)" }}><img src={thumbUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>}
                <div style={{ background: "rgba(0,0,0,0.88)", color: "#fff", fontSize: 12, padding: "3px 8px", borderRadius: 5, fontFamily: "ui-monospace,monospace" }}>{hoverInfo.time}</div>
              </div>
            )}
            {/* Touch time label on mobile */}
            {hoverInfo && isMobile && (
              <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: hoverInfo.x, transform: "translateX(-50%)", background: "rgba(0,0,0,0.85)", color: "#fff", fontSize: 12, padding: "3px 8px", borderRadius: 5, fontFamily: "ui-monospace,monospace", pointerEvents: "none" }}>{hoverInfo.time}</div>
            )}

            {/* Invisible large touch target */}
            <div ref={seekHitRef} data-seek="true"
              style={{ height: isMobile ? 28 : 20, cursor: "pointer", position: "relative", display: "flex", alignItems: "center" }}
              onMouseDown={onSeekDown} onMouseMove={onSeekMove} onMouseLeave={() => { setHoverInfo(null); setThumbUrl(null); }} onMouseUp={onSeekUp}
              onTouchStart={onSeekDown} onTouchMove={onSeekMove} onTouchEnd={onSeekUp}>
              {/* Track */}
              <div ref={seekBarRef} style={{ position: "absolute", left: 0, right: 0, height: isMobile ? 5 : 4, borderRadius: 6, background: "rgba(255,255,255,0.18)", overflow: "visible" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${buffered}%`, background: "rgba(255,255,255,0.28)", borderRadius: 6 }} />
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${seekPct}%`, background: "#fff", borderRadius: 6 }}>
                  <div style={{ position: "absolute", right: -(isMobile ? 8 : 6), top: "50%", transform: "translateY(-50%)", width: isMobile ? 16 : 13, height: isMobile ? 16 : 13, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px rgba(0,0,0,0.5)" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 0 : 2 }}>
            {ctrlBtn(togglePlay, playing ? <PauseI /> : <PlayI />, { padding: isMobile ? "10px 12px" : "6px 8px" })}
            {ctrlBtn(() => skip(-10), <Back10 />)}
            {ctrlBtn(() => skip(10), <Fwd10 />)}

            {/* Volume — desktop only */}
            {!isMobile && (
              <>
                {ctrlBtn(toggleMute, <VolI />)}
                <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume}
                  onChange={e => { e.stopPropagation(); setVol(parseFloat(e.target.value)); }}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 72, accentColor: "#fff", cursor: "pointer", flexShrink: 0 }} />
              </>
            )}

            {/* Time */}
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: isMobile ? 11 : 12, fontFamily: "ui-monospace,monospace", marginLeft: isMobile ? 4 : 8, flexShrink: 0 }}>
              {fmt(currentTime)}{!isMobile && ` / ${fmt(duration)}`}
            </span>
            {isMobile && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "ui-monospace,monospace", marginLeft: 2 }}> / {fmt(duration)}</span>}

            <div style={{ flex: 1 }} />

            {/* Speed */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              {ctrlBtn(() => setShowSpeed(s => !s),
                <span style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fff", padding: isMobile ? "4px 10px" : "4px 11px", fontSize: isMobile ? 12 : 13, fontFamily: "ui-monospace,monospace", fontWeight: 500 }}>{speed}×</span>
              )}
              {/* Desktop dropdown */}
              {showSpeed && !isMobile && (
                <div onClick={e => e.stopPropagation()}
                  style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, background: "rgba(18,18,20,0.97)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden", minWidth: 120, boxShadow: "0 8px 32px rgba(0,0,0,0.8)", zIndex: 20 }}>
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => setSpd(s)}
                      style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", padding: "11px 18px", background: speed === s ? "rgba(255,255,255,0.08)" : "transparent", border: "none", color: speed === s ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 14, fontFamily: "ui-monospace,monospace", cursor: "pointer", fontWeight: speed === s ? 600 : 400 }}>
                      <span>{s === 1 ? "Normal" : `${s}×`}</span>
                      {speed === s && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            {ctrlBtn(toggleFS, <FSI />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuizModal({ quiz, existing, onSubmit, onClose, t }) {
  const [ans, setAns] = useState({});
  const [submitted, setSubmitted] = useState(existing !== undefined);
  const [score, setScore] = useState(existing ?? null);

  const submit = () => {
    let ok = 0; quiz.questions.forEach(q => { if (ans[q.id] === q.answer) ok++; });
    const s = Math.round((ok / quiz.questions.length) * 100);
    setScore(s); setSubmitted(true); onSubmit(s);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(12px)" }}>
      <Card t={t} style={{ width: "100%", maxWidth: 520, maxHeight: "88vh", overflow: "auto", animation: "scaleIn 0.22s ease" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.sep}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: t.text }}>{quiz.title}</div>
          <button onClick={onClose} style={{ background: t.bg2, border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          {submitted && (
            <div style={{ textAlign: "center", padding: 24, background: score >= 70 ? t.greenBg : t.redBg, borderRadius: 14, marginBottom: 28 }}>
              <div style={{ fontSize: 48, fontWeight: 200, color: score >= 70 ? t.green : t.red, letterSpacing: "-0.04em" }}>{score}%</div>
              <div style={{ fontSize: 15, color: t.sub, marginTop: 6 }}>{score >= 70 ? "Passed" : "Keep studying and try again"}</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {quiz.questions.map((q, qi) => (
              <div key={q.id}>
                <div style={{ fontSize: 15, fontWeight: 500, color: t.text, marginBottom: 12, lineHeight: 1.5 }}>{qi + 1}. {q.text}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {q.options.map((opt, oi) => {
                    const sel = ans[q.id] === oi, correct = submitted && oi === q.answer, wrong = submitted && sel && oi !== q.answer;
                    return (
                      <button key={oi} onClick={() => !submitted && setAns(a => ({ ...a, [q.id]: oi }))}
                        style={{ background: correct ? t.greenBg : wrong ? t.redBg : sel ? t.blueBg : t.bg2, border: `1.5px solid ${correct ? t.green + "40" : wrong ? t.red + "40" : sel ? t.blue + "50" : "transparent"}`, borderRadius: 10, padding: "11px 16px", color: t.text, textAlign: "left", fontSize: 15, cursor: submitted ? "default" : "pointer", transition: "all 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{opt}</span>
                        {correct && <span style={{ color: t.green }}>✓</span>}
                        {wrong && <span style={{ color: t.red }}>✗</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {!submitted && <div style={{ marginTop: 24 }}><Btn onClick={submit} disabled={Object.keys(ans).length < quiz.questions.length} full t={t}>Submit</Btn></div>}
        </div>
      </Card>
    </div>
  );
}

// ─── REDEEM MODAL ────────────────────────────────────────────────────
function RedeemModal({ studentId, studentEmail, courses, onSuccess, onClose, t }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const redeem = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return setErr("Please enter a code.");
    setErr(""); setLoading(true);
    try {
      const results = await db.get("codes", { code: trimmed });
      if (!results?.length) { setLoading(false); return setErr("This code doesn't exist."); }
      const entry = results[0];
      if (entry.used) { setLoading(false); return setErr("This code has already been used."); }
      await db.updateWhere("codes", "code", trimmed, { used: true, used_by: studentEmail, used_at: new Date().toISOString() });
      const studs = await db.get("students", { id: studentId });
      const current = studs[0]?.enrolled_courses || [];
      if (!current.includes(entry.course_id)) await db.update("students", studentId, { enrolled_courses: [...current, entry.course_id] });
      const course = courses.find(c => c.id === entry.course_id);
      onSuccess(course?.title || "your course");
    } catch { setErr("Something went wrong."); }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(12px)" }}>
      <Card t={t} style={{ width: "100%", maxWidth: 400, animation: "scaleIn 0.22s ease" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.sep}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: t.text }}>Enter Access Code</div>
          <button onClick={onClose} style={{ background: t.bg2, border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 14, color: t.sub, lineHeight: 1.5 }}>Enter the code you received to unlock your course.</div>
          <Input label="Access Code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" t={t} autoFocus />
          {err && <div style={{ background: t.redBg, borderRadius: 8, padding: "10px 14px", color: t.red, fontSize: 13 }}>{err}</div>}
          <Btn onClick={redeem} disabled={loading || !code.trim()} full t={t}>
            {loading ? <Spinner size={16} color="#fff" /> : "Unlock Course"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── VIDEO UPLOAD MODAL ──────────────────────────────────────────────
function VideoUploadModal({ lesson, courseId, courses, setCourses, onClose, t }) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const getVideoDuration = (file) => new Promise(resolve => {
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(vid.src);
      const s = Math.floor(vid.duration);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      resolve(`${m}:${String(sec).padStart(2, "0")}`);
    };
    vid.onerror = () => resolve("0:00");
    vid.src = URL.createObjectURL(file);
  });

  const upload = async () => {
    if (!file) return;
    setErr(""); setUploading(true);
    try {
      const [videoUrl, duration] = await Promise.all([
        uploadToR2(file, setProgress),
        getVideoDuration(file)
      ]);
      const course = courses.find(c => c.id === courseId);
      const updatedChapters = (course.chapters || []).map(ch => ({
        ...ch, lessons: (ch.lessons || []).map(l => l.id === lesson.id ? { ...l, video_url: videoUrl, duration } : l)
      }));
      await db.update("courses", courseId, { chapters: updatedChapters });
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, chapters: updatedChapters } : c));
      setDone(true);
    } catch (e) { setErr(e.message || "Upload failed."); }
    setUploading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(12px)" }}>
      <Card t={t} style={{ width: "100%", maxWidth: 440, animation: "scaleIn 0.22s ease" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.sep}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: t.text }}>Upload Video</div>
            <div style={{ fontSize: 13, color: t.sub, marginTop: 3 }}>{lesson.title}</div>
          </div>
          <button onClick={onClose} style={{ background: t.bg2, border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: t.greenBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22, color: t.green }}>✓</div>
              <div style={{ fontSize: 17, fontWeight: 500, color: t.text, marginBottom: 16 }}>Video uploaded</div>
              <Btn variant="secondary" onClick={onClose} t={t}>Done</Btn>
            </div>
          ) : (
            <>
              {lesson.video_url && !file && (
                <div style={{ background: t.greenBg, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: t.green }}>✓</span>
                  <span style={{ fontSize: 13, color: t.green }}>Already uploaded — drop a new file to replace</span>
                </div>
              )}
              <div onClick={() => fileRef.current.click()}
                style={{ border: `2px dashed ${file ? t.blue : t.sep}`, borderRadius: 14, padding: "32px 20px", textAlign: "center", cursor: "pointer", background: file ? t.blueBg : "transparent", transition: "all 0.15s" }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("video/")) setFile(f); }}>
                <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
                {file ? (
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{file.name}</div>
                    <div style={{ fontSize: 13, color: t.sub, marginTop: 4 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: t.text }}>Drop video here</div>
                    <div style={{ fontSize: 13, color: t.sub, marginTop: 4 }}>or click to browse</div>
                  </div>
                )}
              </div>
              {uploading && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: t.sub }}>Uploading…</span>
                    <span style={{ fontSize: 13, color: t.blue }}>{progress}%</span>
                  </div>
                  <Track value={progress} t={t} h={5} />
                </div>
              )}
              {err && <div style={{ background: t.redBg, borderRadius: 8, padding: "10px 14px", color: t.red, fontSize: 13 }}>{err}</div>}
              <Btn onClick={upload} disabled={!file || uploading} full t={t}>
                {uploading ? <><Spinner size={16} color="#fff" /> Uploading {progress}%</> : "Upload to R2"}
              </Btn>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── ADMIN ───────────────────────────────────────────────────────────

// ─── COURSE BUILDER ──────────────────────────────────────────────────
function CourseBuilder({ courses, setCourses, notify, t }) {
  const [selCourse, setSelCourse] = useState(null);
  const [editingChap, setEditingChap] = useState(null); // {chapId, name}
  const [editingLec,  setEditingLec]  = useState(null); // {chapId, lecId, title, duration}
  const [newChapName, setNewChapName] = useState("");
  const [addingChap,  setAddingChap]  = useState(false);
  const [saving, setSaving] = useState(false);

  const uid = () => Math.random().toString(36).slice(2, 10);

  const course = courses.find(c => c.id === selCourse);

  const saveChapters = async (updatedChapters) => {
    setSaving(true);
    await db.update("courses", selCourse, { chapters: updatedChapters });
    setCourses(prev => prev.map(c => c.id === selCourse ? { ...c, chapters: updatedChapters } : c));
    setSaving(false);
  };

  // Add chapter
  const addChapter = async () => {
    if (!newChapName.trim()) return;
    const ch = { id: uid(), title: newChapName.trim(), lessons: [] };
    const updated = [...(course.chapters || []), ch];
    await saveChapters(updated);
    setNewChapName(""); setAddingChap(false);
    notify("Chapter added");
  };

  // Rename chapter
  const renameChapter = async (chapId, newName) => {
    const updated = (course.chapters || []).map(ch => ch.id === chapId ? { ...ch, title: newName } : ch);
    await saveChapters(updated);
    setEditingChap(null);
    notify("Chapter renamed");
  };

  // Delete chapter
  const deleteChapter = async (chapId) => {
    const updated = (course.chapters || []).filter(ch => ch.id !== chapId);
    await saveChapters(updated);
    notify("Chapter deleted", false);
  };

  // Add lecture
  const addLecture = async (chapId) => {
    const updated = (course.chapters || []).map(ch =>
      ch.id === chapId ? { ...ch, lessons: [...(ch.lessons || []), { id: uid(), title: "New Lecture", duration: "00:00" }] } : ch
    );
    await saveChapters(updated);
    notify("Lecture added");
  };

  // Save lecture edits
  const saveLecture = async () => {
    if (!editingLec) return;
    const updated = (course.chapters || []).map(ch =>
      ch.id === editingLec.chapId
        ? { ...ch, lessons: (ch.lessons || []).map(l => l.id === editingLec.lecId ? { ...l, title: editingLec.title, duration: editingLec.duration } : l) }
        : ch
    );
    await saveChapters(updated);
    setEditingLec(null);
    notify("Lecture saved");
  };

  // Delete lecture
  const deleteLecture = async (chapId, lecId) => {
    const updated = (course.chapters || []).map(ch =>
      ch.id === chapId ? { ...ch, lessons: (ch.lessons || []).filter(l => l.id !== lecId) } : ch
    );
    await saveChapters(updated);
    notify("Lecture deleted", false);
  };

  // Move chapter up/down
  const moveChap = async (idx, dir) => {
    const chs = [...(course.chapters || [])];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= chs.length) return;
    [chs[idx], chs[newIdx]] = [chs[newIdx], chs[idx]];
    await saveChapters(chs);
  };

  // Move lecture up/down
  const moveLec = async (chapId, idx, dir) => {
    const updated = (course.chapters || []).map(ch => {
      if (ch.id !== chapId) return ch;
      const ls = [...(ch.lessons || [])];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= ls.length) return ch;
      [ls[idx], ls[newIdx]] = [ls[newIdx], ls[idx]];
      return { ...ch, lessons: ls };
    });
    await saveChapters(updated);
  };

  return (
    <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Course Builder</h1>
          <div style={{ fontSize: 15, color: t.sub }}>Build chapters and lectures for each course.</div>
        </div>
        {saving && <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.sub, fontSize: 13 }}><Spinner size={14} color={t.sub} />Saving…</div>}
      </div>

      {/* Course selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {courses.map(c => (
          <button key={c.id} onClick={() => setSelCourse(c.id)}
            style={{ background: selCourse === c.id ? t.blue : t.bg2, border: `1.5px solid ${selCourse === c.id ? t.blue : "transparent"}`, borderRadius: 10, padding: "10px 18px", color: selCourse === c.id ? "#fff" : t.text, fontSize: 14, fontWeight: selCourse === c.id ? 500 : 400, cursor: "pointer", transition: "all 0.15s" }}>
            {c.title}
          </button>
        ))}
      </div>

      {!selCourse && (
        <Card t={t} style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: 15, color: t.sub }}>Select a course above to start building.</div>
        </Card>
      )}

      {course && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Chapters */}
          {(course.chapters || []).map((ch, ci) => (
            <Card key={ch.id} t={t} style={{ overflow: "hidden" }}>
              <div style={{ height: 3, background: course.color || t.blue }} />
              <div style={{ padding: "16px 20px" }}>
                {/* Chapter header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  {editingChap?.chapId === ch.id ? (
                    <>
                      <input value={editingChap.name} onChange={e => setEditingChap(x => ({ ...x, name: e.target.value }))}
                        autoFocus
                        style={{ flex: 1, background: t.bg2, border: `1.5px solid ${t.blue}`, borderRadius: 8, padding: "8px 12px", color: t.text, fontSize: 15, fontWeight: 500 }} />
                      <button onClick={() => renameChapter(ch.id, editingChap.name)}
                        style={{ background: t.blue, border: "none", borderRadius: 8, padding: "8px 14px", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingChap(null)}
                        style={{ background: t.bg2, border: "none", borderRadius: 8, padding: "8px 14px", color: t.sub, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 600, color: t.text, flex: 1 }}>{ch.title}</div>
                      <Tag color={course.color || t.blue} t={t}>{(ch.lessons || []).length} lectures</Tag>
                      <button onClick={() => moveChap(ci, -1)} style={{ background: t.bg2, border: "none", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, cursor: "pointer", fontSize: 14 }}>↑</button>
                      <button onClick={() => moveChap(ci, 1)} style={{ background: t.bg2, border: "none", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, cursor: "pointer", fontSize: 14 }}>↓</button>
                      <button onClick={() => setEditingChap({ chapId: ch.id, name: ch.title })}
                        style={{ background: t.bg2, border: "none", borderRadius: 8, padding: "6px 12px", color: t.sub, fontSize: 13, cursor: "pointer" }}>Rename</button>
                      <button onClick={() => deleteChapter(ch.id)}
                        style={{ background: t.redBg, border: `1px solid ${t.red}25`, borderRadius: 8, padding: "6px 12px", color: t.red, fontSize: 13, cursor: "pointer" }}>Delete</button>
                    </>
                  )}
                </div>

                {/* Lectures */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(ch.lessons || []).map((l, li) => (
                    <div key={l.id}>
                      {editingLec?.lecId === l.id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: t.blueBg, border: `1.5px solid ${t.blue}30`, borderRadius: 10 }}>
                          <input value={editingLec.title} onChange={e => setEditingLec(x => ({ ...x, title: e.target.value }))}
                            placeholder="Lecture title" autoFocus
                            style={{ flex: 1, background: t.bg2, border: `1.5px solid ${t.blue}`, borderRadius: 8, padding: "7px 12px", color: t.text, fontSize: 14 }} />
                          <input value={editingLec.duration} onChange={e => setEditingLec(x => ({ ...x, duration: e.target.value }))}
                            placeholder="e.g. 12:30"
                            style={{ width: 80, background: t.bg2, border: `1.5px solid ${t.sep}`, borderRadius: 8, padding: "7px 10px", color: t.text, fontSize: 14, fontFamily: "ui-monospace,monospace" }} />
                          <button onClick={saveLecture}
                            style={{ background: t.blue, border: "none", borderRadius: 8, padding: "7px 14px", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Save</button>
                          <button onClick={() => setEditingLec(null)}
                            style={{ background: t.bg2, border: "none", borderRadius: 8, padding: "7px 10px", color: t.sub, fontSize: 13, cursor: "pointer" }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: t.bg2, borderRadius: 10 }}>
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: l.video_url ? t.greenBg : t.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: l.video_url ? t.green : t.sub, flexShrink: 0 }}>
                            {l.video_url ? "✓" : "▶"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{l.title}</div>
                          </div>
                          <span style={{ fontSize: 12, color: t.sub, fontFamily: "ui-monospace,monospace", minWidth: 40 }}>{l.duration || "—"}</span>
                          <button onClick={() => moveLec(ch.id, li, -1)} style={{ background: t.bg3, border: "none", borderRadius: 5, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, cursor: "pointer", fontSize: 12 }}>↑</button>
                          <button onClick={() => moveLec(ch.id, li, 1)} style={{ background: t.bg3, border: "none", borderRadius: 5, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, cursor: "pointer", fontSize: 12 }}>↓</button>
                          <button onClick={() => setEditingLec({ chapId: ch.id, lecId: l.id, title: l.title, duration: l.duration || "" })}
                            style={{ background: t.bg3, border: "none", borderRadius: 7, padding: "5px 10px", color: t.sub, fontSize: 12, cursor: "pointer" }}>Edit</button>
                          <button onClick={() => deleteLecture(ch.id, l.id)}
                            style={{ background: t.redBg, border: `1px solid ${t.red}20`, borderRadius: 7, padding: "5px 10px", color: t.red, fontSize: 12, cursor: "pointer" }}>✕</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add lecture button */}
                  <button onClick={() => addLecture(ch.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "transparent", border: `1.5px dashed ${t.sep}`, borderRadius: 10, color: t.sub, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = t.blue; e.currentTarget.style.color = t.blue; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = t.sep; e.currentTarget.style.color = t.sub; }}>
                    + Add Lecture
                  </button>
                </div>
              </div>
            </Card>
          ))}

          {/* Add chapter */}
          {addingChap ? (
            <Card t={t} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={newChapName} onChange={e => setNewChapName(e.target.value)} placeholder="Chapter title…" autoFocus
                  onKeyDown={e => { if (e.key === "Enter") addChapter(); if (e.key === "Escape") setAddingChap(false); }}
                  style={{ flex: 1, background: t.bg2, border: `1.5px solid ${t.blue}`, borderRadius: 8, padding: "10px 14px", color: t.text, fontSize: 15 }} />
                <button onClick={addChapter} style={{ background: t.blue, border: "none", borderRadius: 8, padding: "10px 18px", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Add</button>
                <button onClick={() => { setAddingChap(false); setNewChapName(""); }} style={{ background: t.bg2, border: "none", borderRadius: 8, padding: "10px 14px", color: t.sub, fontSize: 14, cursor: "pointer" }}>Cancel</button>
              </div>
            </Card>
          ) : (
            <button onClick={() => setAddingChap(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px", background: "transparent", border: `2px dashed ${t.sep}`, borderRadius: 14, color: t.sub, fontSize: 15, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.blue; e.currentTarget.style.color = t.blue; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = t.sep; e.currentTarget.style.color = t.sub; }}>
              + Add Chapter
            </button>
          )}
        </div>
      )}
    </div>
  );
}


// ─── SIGNUP TOGGLE ───────────────────────────────────────────────────
function SignupToggle({ t }) {
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.setting("signups_open").then(v => setOpen(v !== "false"));
  }, []);

  const toggle = async () => {
    setSaving(true);
    const newVal = !open;
    await db.setSetting("signups_open", newVal ? "true" : "false");
    setOpen(newVal);
    setSaving(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: t.bg2, border: `1px solid ${t.sep}`, borderRadius: 12, padding: "10px 16px" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>New signups</div>
        <div style={{ fontSize: 12, color: open ? t.green : t.red, marginTop: 2 }}>{open ? "Accepting" : "Closed"}</div>
      </div>
      <button onClick={toggle} disabled={saving}
        style={{ width: 44, height: 26, borderRadius: 13, background: open ? t.green : t.bg3, border: "none", cursor: "pointer", position: "relative", transition: "background 0.25s", flexShrink: 0, opacity: saving ? 0.5 : 1 }}>
        <div style={{ position: "absolute", top: 3, left: open ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
      </button>
    </div>
  );
}

function Admin({ me, onLogout, t }) {
  const [tab, setTab] = useState("overview");
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [ns, setNs] = useState({ name: "", email: "", password: "", courses: [] });
  const [genCourseId, setGenCourseId] = useState("");
  const [genCount, setGenCount] = useState(1);
  const [generatedCodes, setGeneratedCodes] = useState([]);
  const [copied, setCopied] = useState(null);
  const [deleteLocked, setDeleteLocked] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(true);
  const lockTimer = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [autoApprove, setAutoApprove] = useState(true);

  const notify = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const unlockDelete = () => {
    setDeleteLocked(false);
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => { setDeleteLocked(true); notify("Delete lock re-enabled"); }, 5 * 60 * 1000);
  };

  useEffect(() => {
    Promise.all([db.get("students"), db.get("courses"), db.get("codes"), db.setting("auto_approve")])
      .then(([s, c, cd, aa]) => {
        setStudents(s || []); setCourses(c || []); setCodes(cd || []);
        setAutoApprove(aa !== "false");
        setLoading(false);
      });
  }, []);

  const approve = async (id, courseIds) => {
    const update = { status: "active" };
    if (courseIds?.length) update.enrolled_courses = courseIds;
    await db.update("students", id, update);
    setStudents(s => s.map(x => x.id === id ? { ...x, status: "active", ...(courseIds?.length ? { enrolled_courses: courseIds } : {}) } : x));
    setModal(null);
    notify("Student approved");
  };
  const remove = async id => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_student", userId: id })
    });
    setStudents(s => s.filter(x => x.id !== id));
    notify("Student deleted", false);
  };
  const invite  = async () => {
    if (!ns.name || !ns.email || !ns.password) return;
    const r = await db.insert("students", { name: ns.name, email: ns.email, password: ns.password, status: "active", enrolled_courses: ns.courses, join_date: new Date().toISOString().slice(0, 10), progress: {} });
    if (r?.[0]) setStudents(s => [...s, r[0]]);
    setNs({ name: "", email: "", password: "", courses: [] }); setModal(null); notify("Student invited");
  };

  const generateCodes = async () => {
    if (!genCourseId) return;
    const newCodes = [];
    for (let i = 0; i < genCount; i++) {
      const code = generateCode();
      const result = await db.insert("codes", { code, course_id: genCourseId, used: false });
      if (result?.[0]) { newCodes.push(result[0]); setCodes(prev => [...prev, result[0]]); }
    }
    setGeneratedCodes(newCodes); notify(`${newCodes.length} code${newCodes.length > 1 ? "s" : ""} generated`);
  };

  const copyCode = code => { navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 2000); };
  const copyAll  = () => { navigator.clipboard.writeText(generatedCodes.map(c => c.code).join("\n")); notify("All codes copied"); };

  if (loading) return <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner t={t} /></div>;

  const pending     = students.filter(s => s.status === "pending");
  const active      = students.filter(s => s.status === "active");
  const allL        = courses.flatMap(c => (c.chapters || []).flatMap(ch => ch.lessons || []));
  const pct         = s => allL.length ? Math.round(Object.values(s.progress || {}).flatMap(p => p.watched || []).length / allL.length * 100) : 0;
  const unusedCodes = codes.filter(c => !c.used).length;

  const navTabs = [
    { id: "overview",  label: "Overview",      icon: "⊞" },
    { id: "students",  label: "Students",      icon: "◎", badge: pending.length },
    { id: "courses",   label: "Courses",       icon: "▤" },
    { id: "builder",   label: "Course Builder",icon: "✎" },
    { id: "videos",    label: "Videos",        icon: "▶" },
    { id: "codes",     label: "Access Codes",  icon: "⌘" },
    { id: "analytics", label: "Analytics",     icon: "↗" },
  ];

  const ModalWrap = ({ children, maxW = 440 }) => (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(12px)" }}>
      <Card t={t} style={{ width: "100%", maxWidth: maxW, animation: "scaleIn 0.22s ease", maxHeight: "90vh", overflow: "auto" }}>{children}</Card>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: t.bg, position: "relative" }}>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: t.card, border: `1px solid ${toast.ok ? t.green + "25" : t.red + "25"}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: t.shadowLg, animation: "fadeUp 0.25s ease" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: toast.ok ? t.green : t.red, flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: t.text }}>{toast.msg}</span>
        </div>
      )}

      {modal?.type === "upload" && <VideoUploadModal lesson={modal.lesson} courseId={modal.courseId} courses={courses} setCourses={setCourses} onClose={() => setModal(null)} t={t} />}

      {/* Approve Modal */}
      {modal?.type === "approve" && (() => {
        const s = modal.s;
        const [selCourses, setSelCourses] = useState([]);
        return (
          <ModalWrap maxW={460}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.sep}`, display: "flex", alignItems: "center", gap: 14 }}>
              <Av name={s.name} size={40} t={t} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600, color: t.text }}>{s.name}</div>
                <div style={{ fontSize: 13, color: t.sub }}>{s.email}</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: t.bg2, border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 14, color: t.sub }}>Approve this student and optionally enroll them in courses.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: t.sub, textTransform: "uppercase", letterSpacing: "0.04em" }}>Enroll in Courses</label>
                {courses.map(c => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: selCourses.includes(c.id) ? t.blueBg : t.bg2, border: `1.5px solid ${selCourses.includes(c.id) ? t.blue + "30" : "transparent"}`, borderRadius: 10, cursor: "pointer", transition: "all 0.15s" }}
                    onClick={() => setSelCourses(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${selCourses.includes(c.id) ? t.blue : t.muted}`, background: selCourses.includes(c.id) ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}>
                      {selCourses.includes(c.id) && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{c.title}</div>
                    </div>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color || t.blue }} />
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn onClick={() => { approve(s.id, selCourses); setModal(null); }} full t={t}>
                  ✓ Approve{selCourses.length > 0 ? ` + ${selCourses.length} course${selCourses.length > 1 ? "s" : ""}` : ""}
                </Btn>
                <Btn variant="danger" onClick={() => { remove(s.id); setModal(null); }} t={t}>Decline</Btn>
              </div>
            </div>
          </ModalWrap>
        );
      })()}

      {/* Confirm delete student */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(12px)" }}>
          <Card t={t} style={{ width: "100%", maxWidth: 380, animation: "scaleIn 0.22s ease", padding: "28px 24px" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: t.text, marginBottom: 8 }}>Delete student?</div>
            <div style={{ fontSize: 14, color: t.sub, marginBottom: 6 }}>
              <b style={{ color: t.text }}>{deleteTarget.name}</b>
            </div>
            <div style={{ fontSize: 13, color: t.sub, marginBottom: 22, lineHeight: 1.5 }}>
              This will permanently remove their account and all progress. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={() => { remove(deleteTarget.id); setDeleteTarget(null); }} variant="danger" full t={t}>Delete</Btn>
              <Btn onClick={() => setDeleteTarget(null)} variant="secondary" t={t}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {modal?.type === "invite" && (
        <ModalWrap>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.sep}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: t.text }}>Invite Student</div>
            <button onClick={() => setModal(null)} style={{ background: t.bg2, border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Full Name" value={ns.name} onChange={e => setNs(x => ({ ...x, name: e.target.value }))} placeholder="Jane Doe" t={t} />
            <Input label="Email" type="email" value={ns.email} onChange={e => setNs(x => ({ ...x, email: e.target.value }))} placeholder="jane@example.com" t={t} />
            <Input label="Temporary Password" type="password" value={ns.password} onChange={e => setNs(x => ({ ...x, password: e.target.value }))} placeholder="Min. 6 characters" t={t} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>Enroll in courses</label>
              {courses.map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: ns.courses.includes(c.id) ? t.blueBg : t.bg2, border: `1px solid ${ns.courses.includes(c.id) ? t.blue + "30" : "transparent"}`, borderRadius: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={ns.courses.includes(c.id)} onChange={e => setNs(x => ({ ...x, courses: e.target.checked ? [...x.courses, c.id] : x.courses.filter(i => i !== c.id) }))} style={{ accentColor: t.blue, width: 15, height: 15 }} />
                  <span style={{ color: t.text, fontSize: 14 }}>{c.title}</span>
                </label>
              ))}
            </div>
            <Btn onClick={invite} full t={t}>Send Invitation</Btn>
          </div>
        </ModalWrap>
      )}

      {modal?.type === "detail" && (() => {
        const s = modal.s;
        const toggleCourse = async (cid) => {
          const current = s.enrolled_courses || [];
          const updated = current.includes(cid) ? current.filter(x => x !== cid) : [...current, cid];
          await db.update("students", s.id, { enrolled_courses: updated });
          const updatedS = { ...s, enrolled_courses: updated };
          setStudents(prev => prev.map(x => x.id === s.id ? updatedS : x));
          setModal({ type: "detail", s: updatedS });
          notify(`Course ${current.includes(cid) ? "removed" : "added"}`);
        };
        return (
          <ModalWrap maxW={560}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.sep}`, display: "flex", alignItems: "center", gap: 14 }}>
              <Av name={s.name} size={44} t={t} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600, color: t.text }}>{s.name}</div>
                <div style={{ fontSize: 13, color: t.sub }}>{s.email}</div>
              </div>
              <Tag color={s.status === "active" ? t.green : t.orange} t={t}>{s.status}</Tag>
              <button onClick={() => setModal(null)} style={{ background: t.bg2, border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t.sub, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[["Watched", Object.values(s.progress || {}).flatMap(p => p.watched || []).length], ["Progress", `${pct(s)}%`], ["Joined", s.join_date]].map(([l, v]) => (
                  <div key={l} style={{ background: t.bg2, borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 24, fontWeight: 300, color: t.text, letterSpacing: "-0.02em" }}>{v}</div>
                    <div style={{ fontSize: 12, color: t.sub, marginTop: 4 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Course enrollment */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: t.sub, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Course Access</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {courses.map(c => {
                    const enrolled = (s.enrolled_courses || []).includes(c.id);
                    const sp = (s.progress || {})[c.id] || { watched: [] };
                    const cl = (c.chapters || []).flatMap(ch => ch.lessons || []);
                    const cp = cl.length ? Math.round(((sp.watched?.length || 0) / cl.length) * 100) : 0;
                    return (
                      <div key={c.id} style={{ background: t.bg2, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${enrolled ? (c.color || t.blue) + "30" : "transparent"}`, transition: "all 0.15s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: enrolled ? 10 : 0 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color || t.blue, flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 500, color: t.text, flex: 1 }}>{c.title}</span>
                          <button onClick={() => toggleCourse(c.id)}
                            style={{ background: enrolled ? t.redBg : t.blueBg, border: `1px solid ${enrolled ? t.red + "30" : t.blue + "30"}`, borderRadius: 8, padding: "5px 14px", color: enrolled ? t.red : t.blue, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}>
                            {enrolled ? "Remove" : "Enroll"}
                          </button>
                        </div>
                        {enrolled && (
                          <div>
                            <Track value={cp} color={c.color || t.blue} t={t} />
                            <div style={{ fontSize: 12, color: t.sub, marginTop: 4 }}>{cp}% complete · {sp.watched?.length || 0}/{cl.length} lectures</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ModalWrap>
        );
      })()}

      {/* Sidebar */}
      <div className="admin-sidebar" style={{ width: 220, background: t.card, borderRight: `1px solid ${t.sep}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
        <div className="sidebar-logo" style={{ padding: "24px 18px 20px", borderBottom: `1px solid ${t.sep}` }}>
          <div className="logo-name" style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.3em", color: t.text, textTransform: "uppercase" }}>AWAD</div>
          <div className="logo-name" style={{ fontSize: 12, color: t.sub, marginTop: 4 }}>Admin</div>
          <div className="logo-dot" style={{ display: "none" }} />
        </div>
        <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
          {navTabs.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              className={`admin-nav-btn${tab === n.id ? " active" : ""}`}
              style={{ background: tab === n.id ? t.bg2 : "transparent", border: "none", borderRadius: 10, padding: "10px 12px", color: tab === n.id ? t.text : t.sub, fontSize: 14, fontWeight: tab === n.id ? 500 : 400, textAlign: "left", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", "--blue": t.blue, width: "100%" }}>
              <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>{n.icon}</span>
              <span style={{ flex: 1, fontSize: "inherit" }}>{n.label}</span>
              {n.badge > 0 && <Tag color={t.orange} t={t}>{n.badge}</Tag>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer" style={{ padding: "12px 8px", borderTop: `1px solid ${t.sep}` }}>
          <div style={{ padding: "10px 12px", background: t.bg2, borderRadius: 10, marginBottom: 6 }}>
            <div className="footer-name" style={{ fontSize: 13, fontWeight: 500, color: t.text }}>{me.name}</div>
            <div className="footer-name" style={{ fontSize: 11, color: t.sub }}>Administrator</div>
            <div style={{ fontSize: 18, textAlign: "center", display: "none" }} className="footer-icon"><Av name={me.name} size={28} t={t} /></div>
          </div>
          <button onClick={onLogout} className="footer-name" style={{ background: "none", border: "none", color: t.sub, fontSize: 13, padding: "8px 12px", cursor: "pointer", width: "100%", textAlign: "left" }}>Sign out</button>
        </div>
      </div>

      {/* Main content */}
      <div className="admin-main" style={{ flex: 1, overflow: "auto", padding: "36px 40px" }}>

        {tab === "overview" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Overview</h1>
                <div style={{ fontSize: 15, color: t.sub }}>Your platform at a glance.</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <SignupToggle t={t} />
                {/* Auto-approve toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: t.bg2, border: `1px solid ${t.sep}`, borderRadius: 12, padding: "10px 16px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>Auto-approve</div>
                    <div style={{ fontSize: 12, color: autoApprove ? t.green : t.orange, marginTop: 2 }}>{autoApprove ? "On" : "Manual only"}</div>
                  </div>
                  <button onClick={async () => {
                    const next = !autoApprove;
                    setAutoApprove(next);
                    await db.setSetting("auto_approve", next ? "true" : "false");
                  }}
                    style={{ width: 44, height: 26, borderRadius: 13, background: autoApprove ? t.green : t.bg3, border: "none", cursor: "pointer", position: "relative", transition: "background 0.25s", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: 3, left: autoApprove ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                  </button>
                </div>
              </div>
            </div>
            <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
              <Stat label="Total students" value={students.length} t={t} i={0} />
              <Stat label="Active" value={active.length} t={t} i={1} />
              <Stat label="Courses" value={courses.length} t={t} i={2} />
              <Stat label="Available codes" value={unusedCodes} t={t} i={3} />
            </div>
            {pending.length > 0 && (
              <Card t={t} style={{ padding: "20px 22px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: t.text }}>Pending approval</div>
                  <Tag color={t.orange} t={t}>{pending.length}</Tag>
                </div>
                {pending.map((s, i) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i > 0 ? `1px solid ${t.sep}` : "none" }}>
                    <Av name={s.name} t={t} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: t.sub }}>{s.email}</div>
                    </div>
                    <Btn sm onClick={() => setModal({ type: "approve", s })} t={t}>Approve</Btn>
                    <Btn sm variant="danger" onClick={() => remove(s.id)} t={t}>Decline</Btn>
                  </div>
                ))}
              </Card>
            )}
            <Card t={t} style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: t.text, marginBottom: 16 }}>Student progress</div>
              {active.length === 0 && <div style={{ fontSize: 14, color: t.sub }}>No active students yet.</div>}
              {active.slice(0, 8).map((s, i) => (
                <div key={s.id} onClick={() => setModal({ type: "detail", s })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i > 0 ? `1px solid ${t.sep}` : "none", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.6"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  <Av name={s.name} size={30} t={t} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: t.text, marginBottom: 5 }}>{s.name}</div>
                    <Track value={pct(s)} t={t} />
                  </div>
                  <span style={{ fontSize: 13, color: t.blue, minWidth: 36, textAlign: "right" }}>{pct(s)}%</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "students" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Students</h1>
                <div style={{ fontSize: 15, color: t.sub }}>{students.length} total · {active.length} active</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Delete settings */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.bg2, border: `1px solid ${t.sep}`, borderRadius: 12, padding: "8px 14px" }}>
                  {/* Confirm toggle */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }} onClick={() => setDeleteConfirm(v => !v)}>
                    <div style={{ width: 32, height: 18, borderRadius: 9, background: deleteConfirm ? t.blue : t.bg3, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                      <div style={{ position: "absolute", top: 2, left: deleteConfirm ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                    </div>
                    <span style={{ fontSize: 12, color: t.sub, whiteSpace: "nowrap" }}>Confirm delete</span>
                  </label>
                  <div style={{ width: 1, height: 16, background: t.sep }} />
                  {/* Lock toggle */}
                  <button onClick={() => deleteLocked ? unlockDelete() : setDeleteLocked(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <span style={{ fontSize: 16 }}>{deleteLocked ? "🔒" : "🔓"}</span>
                    <span style={{ fontSize: 12, color: deleteLocked ? t.sub : t.red, whiteSpace: "nowrap" }}>
                      {deleteLocked ? "Locked" : "Unlocked (5 min)"}
                    </span>
                  </button>
                </div>
                <Btn onClick={() => setModal({ type: "invite" })} t={t}>+ Invite</Btn>
              </div>
            </div>
            <Card t={t} style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.5fr 1fr 1fr auto", padding: "12px 20px", borderBottom: `1px solid ${t.sep}`, background: t.bg2 }}>
                {["Name", "Email", "Gender", "Courses", "Progress", "Status", ""].map(h => <span key={h} style={{ fontSize: 12, fontWeight: 500, color: t.sub }}>{h}</span>)}
              </div>
              {students.map(s => (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.5fr 1fr 1fr auto", padding: "13px 20px", borderBottom: `1px solid ${t.sep}`, alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Av name={s.name} size={28} t={t} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{s.name}</span>
                  </div>
                  <span style={{ fontSize: 13, color: t.sub, fontFamily: "ui-monospace,monospace" }}>{s.email}</span>
                  <span style={{ fontSize: 13, color: t.sub }}>{s.gender || "—"}</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(s.enrolled_courses || []).map(cid => { const c = courses.find(x => x.id === cid); return c ? <Tag key={cid} color={c.color || t.blue} t={t}>{c.title.split(" ")[0]}</Tag> : null; })}
                    {!s.enrolled_courses?.length && <span style={{ color: t.muted, fontSize: 13 }}>—</span>}
                  </div>
                  <div>
                    <span style={{ fontSize: 13, color: t.blue }}>{pct(s)}%</span>
                    <div style={{ marginTop: 5 }}><Track value={pct(s)} t={t} /></div>
                  </div>
                  <Tag color={s.status === "active" ? t.green : t.orange} t={t}>{s.status}</Tag>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn sm variant="secondary" onClick={() => setModal({ type: "detail", s })} t={t}>View</Btn>
                    {s.status === "pending" && <Btn sm onClick={() => setModal({ type: "approve", s })} t={t}>✓</Btn>}
                    <button
                      disabled={deleteLocked}
                      onClick={() => {
                        if (deleteLocked) return;
                        if (deleteConfirm) setDeleteTarget(s);
                        else remove(s.id);
                      }}
                      style={{ background: deleteLocked ? t.bg3 : t.redBg, border: `1px solid ${deleteLocked ? "transparent" : t.red + "30"}`, borderRadius: 8, padding: "6px 14px", color: deleteLocked ? t.muted : t.red, fontSize: 13, fontWeight: 500, cursor: deleteLocked ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "courses" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Courses</h1>
            <div style={{ fontSize: 15, color: t.sub, marginBottom: 28 }}>{courses.length} published</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {courses.map(c => {
                const lessons = (c.chapters || []).flatMap(ch => ch.lessons || []);
                const enrolled = students.filter(s => (s.enrolled_courses || []).includes(c.id)).length;
                const withVideo = lessons.filter(l => l.video_url).length;
                return (
                  <Card key={c.id} t={t} style={{ overflow: "hidden" }}>
                    <div style={{ height: 3, background: c.color || t.blue }} />
                    <div style={{ padding: "22px 24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 19, fontWeight: 500, color: t.text, marginBottom: 5 }}>{c.title}</div>
                          <div style={{ fontSize: 14, color: t.sub }}>{c.description}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <Tag color={c.color || t.blue} t={t}>{lessons.length} lectures</Tag>
                          <Tag color={t.green} t={t}>{enrolled} students</Tag>
                          <Tag color={withVideo === lessons.length ? t.green : t.orange} t={t}>{withVideo}/{lessons.length} videos</Tag>
                        </div>
                      </div>
                      {(c.chapters || []).map(ch => (
                        <div key={ch.id} style={{ background: t.bg2, borderRadius: 10, padding: "12px 16px", marginBottom: 7 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: t.text, marginBottom: 8 }}>{ch.title}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {(ch.lessons || []).map(l => (
                              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: t.card, borderRadius: 8, border: `1px solid ${t.sep}` }}>
                                <div style={{ width: 24, height: 24, borderRadius: 6, background: l.video_url ? t.greenBg : t.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: l.video_url ? t.green : t.sub, flexShrink: 0 }}>
                                  {l.video_url ? "✓" : "▶"}
                                </div>
                                <span style={{ flex: 1, fontSize: 13, color: t.text }}>{l.title}</span>
                                <span style={{ fontSize: 12, color: t.sub, fontFamily: "ui-monospace,monospace" }}>{l.duration}</span>
                                <Btn sm variant="secondary" onClick={() => setModal({ type: "upload", lesson: l, courseId: c.id })} t={t}>
                                  {l.video_url ? "Replace" : "Upload"}
                                </Btn>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {tab === "videos" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Videos</h1>
            <div style={{ fontSize: 15, color: t.sub, marginBottom: 28 }}>Upload lecture videos to each lesson.</div>
            {courses.map(c => {
              const lessons = (c.chapters || []).flatMap(ch => ch.lessons || []);
              const withVideo = lessons.filter(l => l.video_url).length;
              return (
                <Card key={c.id} t={t} style={{ marginBottom: 14, overflow: "hidden" }}>
                  <div style={{ height: 3, background: c.color || t.blue }} />
                  <div style={{ padding: "18px 22px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontSize: 17, fontWeight: 500, color: t.text }}>{c.title}</div>
                      <Tag color={withVideo === lessons.length ? t.green : t.orange} t={t}>{withVideo}/{lessons.length} uploaded</Tag>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {lessons.map(l => (
                        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: t.bg2, borderRadius: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: l.video_url ? t.greenBg : t.bg3, border: `1px solid ${l.video_url ? t.green + "25" : t.sep}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                            {l.video_url ? "✓" : "🎬"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{l.title}</div>
                            <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{l.video_url ? "Video uploaded" : "No video yet"}</div>
                          </div>
                          <Btn sm variant={l.video_url ? "secondary" : "primary"} onClick={() => setModal({ type: "upload", lesson: l, courseId: c.id })} t={t}>
                            {l.video_url ? "Replace" : "Upload"}
                          </Btn>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === "codes" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Access Codes</h1>
            <div style={{ fontSize: 15, color: t.sub, marginBottom: 28 }}>Generate and share codes after payment.</div>
            <Card t={t} style={{ padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 20 }}>Generate New Codes</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>Course</label>
                  <select value={genCourseId} onChange={e => setGenCourseId(e.target.value)}
                    style={{ background: t.bg2, border: "1.5px solid transparent", borderRadius: 10, padding: "11px 14px", color: genCourseId ? t.text : t.sub, fontSize: 15, cursor: "pointer" }}>
                    <option value="">Select a course...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: t.sub }}>Quantity</label>
                  <input type="number" min="1" max="50" value={genCount} onChange={e => setGenCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    style={{ background: t.bg2, border: "1.5px solid transparent", borderRadius: 10, padding: "11px 14px", color: t.text, fontSize: 15 }}
                    onFocus={e => e.target.style.borderColor = t.blue} onBlur={e => e.target.style.borderColor = "transparent"} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Btn onClick={generateCodes} disabled={!genCourseId} t={t}>Generate {genCount} Code{genCount > 1 ? "s" : ""}</Btn>
                {generatedCodes.length > 0 && <Btn variant="secondary" onClick={copyAll} t={t}>Copy All</Btn>}
              </div>
              {generatedCodes.length > 0 && (
                <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.sub, marginBottom: 4 }}>Generated — click to copy</div>
                  {generatedCodes.map(c => (
                    <div key={c.id} onClick={() => copyCode(c.code)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.bg2, borderRadius: 10, padding: "12px 16px", cursor: "pointer", border: `1px solid ${copied === c.code ? t.green + "40" : "transparent"}`, transition: "all 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = t.bg3}
                      onMouseLeave={e => e.currentTarget.style.background = t.bg2}>
                      <span style={{ fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 16, fontWeight: 500, color: t.text, letterSpacing: "0.1em" }}>{c.code}</span>
                      <span style={{ fontSize: 12, color: copied === c.code ? t.green : t.sub }}>{copied === c.code ? "Copied!" : "Copy"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card t={t} style={{ overflow: "hidden" }}>
              <div style={{ padding: "16px 22px", borderBottom: `1px solid ${t.sep}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: t.text }}>All Codes</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Tag color={t.green} t={t}>{codes.filter(c => !c.used).length} available</Tag>
                  <Tag color={t.sub} t={t}>{codes.filter(c => c.used).length} used</Tag>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", padding: "12px 22px", borderBottom: `1px solid ${t.sep}`, background: t.bg2 }}>
                {["Code", "Course", "Status", "Used by"].map(h => <span key={h} style={{ fontSize: 12, fontWeight: 500, color: t.sub }}>{h}</span>)}
              </div>
              {codes.length === 0 && <div style={{ padding: 40, textAlign: "center", color: t.sub, fontSize: 14 }}>No codes generated yet.</div>}
              {codes.map(c => {
                const course = courses.find(x => x.id === c.course_id);
                return (
                  <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", padding: "13px 22px", borderBottom: `1px solid ${t.sep}`, alignItems: "center" }}>
                    <span style={{ fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 14, color: c.used ? t.muted : t.text, letterSpacing: "0.08em" }}>{c.code}</span>
                    <span style={{ fontSize: 13, color: t.sub }}>{course?.title || "—"}</span>
                    <Tag color={c.used ? t.sub : t.green} t={t}>{c.used ? "Used" : "Available"}</Tag>
                    <span style={{ fontSize: 12, color: t.sub, fontFamily: "ui-monospace,monospace" }}>{c.used_by || "—"}</span>
                  </div>
                );
              })}
            </Card>
          </div>
        )}


        {tab === "builder" && (
          <CourseBuilder courses={courses} setCourses={setCourses} notify={notify} t={t} />
        )}

        {tab === "analytics" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 28 }}>Analytics</h1>
            <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card t={t} style={{ padding: "22px 24px" }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: t.text, marginBottom: 22 }}>Course completion</div>
                {courses.map(c => {
                  const cl = (c.chapters || []).flatMap(ch => ch.lessons || []);
                  const en = students.filter(s => (s.enrolled_courses || []).includes(c.id));
                  const avg = en.length ? Math.round(en.reduce((a, s) => a + (((s.progress || {})[c.id]?.watched?.length || 0) / (cl.length || 1)) * 100, 0) / en.length) : 0;
                  return (
                    <div key={c.id} style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                        <span style={{ fontSize: 14, color: t.text }}>{c.title}</span>
                        <span style={{ fontSize: 13, color: c.color || t.blue }}>{avg}%</span>
                      </div>
                      <Track value={avg} color={c.color || t.blue} height={5} t={t} />
                      <div style={{ fontSize: 12, color: t.sub, marginTop: 4 }}>{en.length} enrolled</div>
                    </div>
                  );
                })}
              </Card>
              <Card t={t} style={{ padding: "22px 24px" }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: t.text, marginBottom: 22 }}>Leaderboard</div>
                {active.sort((a, b) => pct(b) - pct(a)).slice(0, 8).map((s, i) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i > 0 ? `1px solid ${t.sep}` : "none" }}>
                    <span style={{ fontSize: 13, color: t.muted, minWidth: 22, fontFamily: "ui-monospace,monospace" }}>#{i + 1}</span>
                    <Av name={s.name} size={28} t={t} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: t.text, marginBottom: 4 }}>{s.name}</div>
                      <Track value={pct(s)} t={t} />
                    </div>
                    <span style={{ fontSize: 13, color: t.blue }}>{pct(s)}%</span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STUDENT ─────────────────────────────────────────────────────────

// ─── DELETE ACCOUNT BUTTON ───────────────────────────────────────────
function DeleteAccountBtn({ me, onDeleted, t }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const deleteAccount = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_student", userId: me.id })
      });
      clearSession();
      onDeleted();
    } catch { setLoading(false); }
  };

  if (!confirm) return (
    <Btn variant="danger" onClick={() => setConfirm(true)} t={t}>Delete My Account</Btn>
  );

  return (
    <div style={{ background: t.redBg, border: `1px solid ${t.red}25`, borderRadius: 12, padding: "16px" }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: t.red, marginBottom: 8 }}>Are you absolutely sure?</div>
      <div style={{ fontSize: 13, color: t.sub, marginBottom: 14 }}>This will permanently delete your account and all progress. This cannot be undone.</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="danger" onClick={deleteAccount} disabled={loading} t={t}>
          {loading ? <Spinner size={14} color={t.red} /> : "Yes, delete my account"}
        </Btn>
        <Btn variant="secondary" onClick={() => setConfirm(false)} t={t}>Cancel</Btn>
      </div>
    </div>
  );
}


// ─── DELETE ACCOUNT BUTTON ───────────────────────────────────────────
function DeleteAccountButton({ me, onDeleted, t }) {
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped]     = useState("");
  const [loading, setLoading] = useState(false);

  const deleteAccount = async () => {
    if (typed !== "Delete") return;
    setLoading(true);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_student", userId: me.id })
      });
      clearSession();
      onDeleted();
    } catch { setLoading(false); }
  };

  if (!confirm) return (
    <button onClick={() => setConfirm(true)}
      style={{ background: t.redBg, border: `1px solid ${t.red}30`, borderRadius: 10, padding: "11px 20px", color: t.red, fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }}>
      Delete My Account
    </button>
  );

  return (
    <div style={{ animation: "scaleIn 0.2s ease" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.red, marginBottom: 6 }}>⚠ Warning</div>
      <div style={{ fontSize: 13, color: t.sub, marginBottom: 16, lineHeight: 1.6 }}>
        This will permanently delete your account and all your progress. This action <b style={{ color: t.text }}>cannot be undone</b>.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: t.sub }}>Type <b style={{ color: t.text, fontFamily: "ui-monospace,monospace" }}>Delete</b> to confirm</label>
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Delete"
          style={{ background: t.bg2, border: `1.5px solid ${typed === "Delete" ? t.red : "transparent"}`, borderRadius: 10, padding: "11px 14px", color: t.text, fontSize: 15, transition: "border-color 0.2s" }}
          onFocus={e => e.target.style.borderColor = typed === "Delete" ? t.red : t.blue}
          onBlur={e => e.target.style.borderColor = typed === "Delete" ? t.red : "transparent"} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={deleteAccount} disabled={loading || typed !== "Delete"}
          style={{ background: typed === "Delete" ? t.red : t.bg3, border: "none", borderRadius: 10, padding: "11px 22px", color: typed === "Delete" ? "#fff" : t.muted, fontSize: 14, fontWeight: 500, cursor: typed === "Delete" ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
          {loading ? "Deleting…" : "Confirm Delete"}
        </button>
        <button onClick={() => { setConfirm(false); setTyped(""); }}
          style={{ background: t.bg2, border: "none", borderRadius: 10, padding: "11px 18px", color: t.sub, fontSize: 14, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StudentView({ me: initMe, onLogout, t }) {
  const [tab, setTab] = useState("home");
  const [me, setMe] = useState(initMe);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [player, setPlayer] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [redeem, setRedeem] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(null);

  useEffect(() => { db.get("courses").then(c => { setCourses(c || []); setLoading(false); }); }, []);

  const mine = courses.filter(c => (me.enrolled_courses || []).includes(c.id));
  const allL = courses.flatMap(c => (c.chapters || []).flatMap(ch => ch.lessons || []));
  const totalW = Object.values(me.progress || {}).flatMap(p => p.watched || []).length;
  const overallPct = allL.length ? Math.round(totalW / allL.length * 100) : 0;

  const markWatched = async (cid, lid) => {
    const cp = (me.progress || {})[cid] || { watched: [], quizScores: {} };
    if (cp.watched.includes(lid)) return;
    const np = { ...me.progress, [cid]: { ...cp, watched: [...cp.watched, lid] } };
    await db.update("students", me.id, { progress: np });
    setMe(m => ({ ...m, progress: np }));
  };

  const saveVideoTime = async (cid, lid, time) => {
    const cp = (me.progress || {})[cid] || { watched: [], quizScores: {}, times: {} };
    const np = { ...me.progress, [cid]: { ...cp, times: { ...(cp.times || {}), [lid]: time } } };
    await db.update("students", me.id, { progress: np });
    setMe(m => ({ ...m, progress: np }));
  };

  const saveQuiz = async (cid, qid, score) => {
    const cp = (me.progress || {})[cid] || { watched: [], quizScores: {} };
    const np = { ...me.progress, [cid]: { ...cp, quizScores: { ...cp.quizScores, [qid]: score } } };
    await db.update("students", me.id, { progress: np });
    setMe(m => ({ ...m, progress: np }));
  };

  const deleteAccount = async () => {
    if (!window.confirm("Are you sure you want to permanently delete your account? This cannot be undone.")) return;
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_student", userId: me.id })
      });
      onLogout();
    } catch { alert("Something went wrong. Please try again."); }
  };

  const onRedeemSuccess = async courseTitle => {
    setRedeem(false); setRedeemSuccess(courseTitle);
    const updated = await db.get("students", { id: me.id });
    if (updated?.[0]) setMe(updated[0]);
    const updatedCourses = await db.get("courses");
    setCourses(updatedCourses || []);
    setTimeout(() => setRedeemSuccess(null), 4000);
  };

  if (loading) return <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner t={t} /></div>;
  if (player) {
    const savedTime = (me.progress || {})[player.cid]?.times?.[player.lesson.id] || 0;
    return <VideoPlayer lesson={player.lesson} userName={me.name} userEmail={me.email || me.name} onClose={() => setPlayer(null)} onComplete={() => markWatched(player.cid, player.lesson.id)} resumeFrom={savedTime} onSaveTime={(time) => saveVideoTime(player.cid, player.lesson.id, time)} t={t} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg }}>
      {redeem && <RedeemModal studentId={me.id} studentEmail={me.email} courses={courses} onSuccess={onRedeemSuccess} onClose={() => setRedeem(false)} t={t} />}
      {redeemSuccess && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: t.card, border: `1px solid ${t.green}25`, borderRadius: 12, padding: "14px 22px", display: "flex", alignItems: "center", gap: 10, boxShadow: t.shadowLg, animation: "fadeUp 0.3s ease", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          <span style={{ fontSize: 14, color: t.text, fontWeight: 500 }}><b>{redeemSuccess}</b> unlocked!</span>
        </div>
      )}

      {/* Nav */}
      <div className="student-nav" style={{ position: "sticky", top: 0, zIndex: 100, background: t.bg + "e8", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderBottom: `1px solid ${t.sep}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 52 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.3em", color: t.text, textTransform: "uppercase", flexShrink: 0 }}>AWAD</div>
          <div className="student-nav-links" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            {[["home", "Home"], ["courses", "Courses"], ["progress", "Progress"], ["profile", "Profile"]].map(([id, lb]) => (
              <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", padding: "0 14px", height: 52, color: tab === id ? t.text : t.sub, fontSize: 14, fontWeight: tab === id ? 500 : 400, cursor: "pointer", borderBottom: `2px solid ${tab === id ? t.blue : "transparent"}`, transition: "all 0.15s", marginBottom: -1 }}>{lb}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setRedeem(true)} style={{ background: t.blue, border: "none", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ Enter Code</button>
            <Av name={me.name} size={28} t={t} />
            <button onClick={onLogout} style={{ background: "none", border: "none", color: t.sub, fontSize: 13, cursor: "pointer" }}>Sign out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 24px 80px" }}>
        {tab === "home" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Hello, {me.name?.split(" ")[0]}.</h1>
              <div style={{ fontSize: 15, color: t.sub }}>Continue learning where you left off.</div>
            </div>
            <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
              <Stat label="Lectures completed" value={totalW} t={t} i={0} />
              <Stat label="Overall progress" value={`${overallPct}%`} t={t} i={1} />
              <Stat label="Courses enrolled" value={mine.length} t={t} i={2} />
            </div>
            {mine.length === 0 ? (
              <Card t={t} style={{ padding: "48px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📚</div>
                <div style={{ fontSize: 19, fontWeight: 300, color: t.text, marginBottom: 8 }}>No courses yet</div>
                <div style={{ fontSize: 14, color: t.sub, marginBottom: 22 }}>Enter your access code to get started.</div>
                <Btn onClick={() => setRedeem(true)} t={t}>Enter Access Code</Btn>
              </Card>
            ) : (
              <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {mine.map(c => {
                  const cl = (c.chapters || []).flatMap(ch => ch.lessons || []);
                  const w = (me.progress || {})[c.id]?.watched || [];
                  const p = cl.length ? Math.round((w.length / cl.length) * 100) : 0;
                  const next = cl.find(l => !w.includes(l.id));
                  return (
                    <Card key={c.id} t={t} hover style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => { setTab("courses"); setOpen(c.id); }}>
                      <div style={{ height: 3, background: c.color || t.blue }} />
                      <div style={{ padding: "18px 20px" }}>
                        <div style={{ fontSize: 17, fontWeight: 500, color: t.text, marginBottom: 12 }}>{c.title}</div>
                        <Track value={p} color={c.color || t.blue} t={t} />
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
                          <span style={{ fontSize: 13, color: t.sub }}>{w.length}/{cl.length} lectures</span>
                          <span style={{ fontSize: 13, color: c.color || t.blue }}>{p}%</span>
                        </div>
                        {next && <div style={{ marginTop: 12, fontSize: 13, color: t.sub, display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: t.blue, fontSize: 10 }}>▶</span>{next.title}</div>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "courses" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em" }}>My Courses</h1>
              <Btn variant="secondary" onClick={() => setRedeem(true)} t={t}>+ Enter Code</Btn>
            </div>
            {mine.length === 0 ? (
              <Card t={t} style={{ padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 15, color: t.sub }}>No courses yet. Enter an access code to get started.</div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {mine.map(c => {
                  const sp = (me.progress || {})[c.id] || { watched: [], quizScores: {} };
                  const isOpen = open === c.id;
                  const cl = (c.chapters || []).flatMap(ch => ch.lessons || []);
                  const p = cl.length ? Math.round(((sp.watched?.length || 0) / cl.length) * 100) : 0;
                  return (
                    <Card key={c.id} t={t} style={{ overflow: "hidden" }}>
                      <div style={{ height: 3, background: c.color || t.blue }} />
                      <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : c.id)}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 17, fontWeight: 500, color: t.text, marginBottom: 8 }}>{c.title}</div>
                          <div style={{ width: 200 }}><Track value={p} color={c.color || t.blue} t={t} /></div>
                        </div>
                        <Tag color={c.color || t.blue} t={t}>{p}%</Tag>
                        <span style={{ color: t.sub, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none", display: "inline-block", lineHeight: 1, fontSize: 16 }}>⌄</span>
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${t.sep}`, padding: "10px 22px 20px" }}>
                          {(c.chapters || []).map(ch => (
                            <div key={ch.id} style={{ marginTop: 18 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: t.sub, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>{ch.title}</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {(ch.lessons || []).map(l => {
                                  const watched = sp.watched?.includes(l.id);
                                  return (
                                    <div key={l.id} onClick={() => setPlayer({ lesson: l, cid: c.id })}
                                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: watched ? (c.color || t.blue) + "08" : t.bg2, border: `1.5px solid ${watched ? (c.color || t.blue) + "20" : "transparent"}`, borderRadius: 10, cursor: "pointer", transition: "all 0.15s" }}
                                      onMouseEnter={e => e.currentTarget.style.transform = "translateX(4px)"}
                                      onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                                      <div style={{ width: 28, height: 28, borderRadius: 7, background: watched ? (c.color || t.blue) + "15" : t.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: watched ? (c.color || t.blue) : t.sub, flexShrink: 0, fontWeight: 600 }}>
                                        {watched ? "✓" : "▶"}
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{l.title}</div>
                                        <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{l.duration || "—"}</div>
                                      </div>
                                      {!l.video_url && <Tag color={t.sub} t={t}>No video</Tag>}
                                      {watched && <Tag color={c.color || t.blue} t={t}>Done</Tag>}
                                    </div>
                                  );
                                })}
                                {ch.quiz && (
                                  <div onClick={() => setQuiz({ q: ch.quiz, cid: c.id })}
                                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: sp.quizScores?.[ch.quiz.id] !== undefined ? t.blueBg : t.bg2, border: `1.5px solid ${sp.quizScores?.[ch.quiz.id] !== undefined ? t.blue + "25" : "transparent"}`, borderRadius: 10, cursor: "pointer", transition: "all 0.15s" }}
                                    onMouseEnter={e => e.currentTarget.style.transform = "translateX(4px)"}
                                    onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                                    <div style={{ width: 28, height: 28, borderRadius: 7, background: t.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>◈</div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{ch.quiz.title}</div>
                                      <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{ch.quiz.questions.length} questions</div>
                                    </div>
                                    {sp.quizScores?.[ch.quiz.id] !== undefined
                                      ? <Tag color={sp.quizScores[ch.quiz.id] >= 70 ? t.green : t.red} t={t}>{sp.quizScores[ch.quiz.id]}%</Tag>
                                      : <Tag color={t.blue} t={t}>Take Quiz</Tag>}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)", maxWidth: 480 }}>
            <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 6 }}>Settings</h1>
            <div style={{ fontSize: 15, color: t.sub, marginBottom: 28 }}>Manage your account.</div>

            {/* Profile info */}
            <Card t={t} style={{ padding: "22px 24px", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: t.sub, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>Profile</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Av name={me.name || "?"} size={48} t={t} />
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500, color: t.text }}>{me.name}</div>
                  <div style={{ fontSize: 14, color: t.sub }}>{me.email}</div>
                </div>
              </div>
            </Card>

            {/* Delete account */}
            <Card t={t} style={{ padding: "22px 24px", border: `1px solid ${t.red}25` }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: t.red, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>Account Deletion</div>
              <DeleteAccountButton me={me} onDeleted={onLogout} t={t} />
            </Card>
          </div>
        )}

        {tab === "progress" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 28 }}>Progress</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {mine.map(c => {
                const sp = (me.progress || {})[c.id] || { watched: [], quizScores: {} };
                const cl = (c.chapters || []).flatMap(ch => ch.lessons || []);
                const p = cl.length ? Math.round(((sp.watched?.length || 0) / cl.length) * 100) : 0;
                const quizzes = (c.chapters || []).filter(ch => ch.quiz);
                const qDone = quizzes.filter(ch => sp.quizScores?.[ch.quiz.id] !== undefined).length;
                return (
                  <Card key={c.id} t={t} style={{ padding: "22px 24px" }}>
                    <div style={{ height: 2, background: c.color || t.blue, width: `${p}%`, borderRadius: 2, marginBottom: 18, transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }} />
                    <div style={{ fontSize: 17, fontWeight: 500, color: t.text, marginBottom: 18 }}>{c.title}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 14, color: t.sub }}>Lectures</span>
                          <span style={{ fontSize: 13, color: c.color || t.blue }}>{sp.watched?.length || 0} / {cl.length}</span>
                        </div>
                        <Track value={p} color={c.color || t.blue} height={5} t={t} />
                      </div>
                      {quizzes.length > 0 && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 14, color: t.sub }}>Assessments</span>
                            <span style={{ fontSize: 13, color: t.blue }}>{qDone} / {quizzes.length}</span>
                          </div>
                          <Track value={quizzes.length ? (qDone / quizzes.length) * 100 : 0} height={5} t={t} />
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
              {mine.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: t.sub, fontSize: 15 }}>No courses enrolled yet.</div>}
            </div>
          </div>
        )}

        {tab === "profile" && (
          <div style={{ animation: "slideIn 0.25s cubic-bezier(0.4,0,0.2,1)", maxWidth: 480 }}>
            <h1 style={{ fontSize: 34, fontWeight: 300, color: t.text, letterSpacing: "-0.03em", marginBottom: 28 }}>Profile</h1>

            {/* Account info */}
            <Card t={t} style={{ padding: "22px 24px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <Av name={me.name} size={52} t={t} />
                <div>
                  <div style={{ fontSize: 19, fontWeight: 500, color: t.text }}>{me.name}</div>
                  <div style={{ fontSize: 14, color: t.sub, marginTop: 3 }}>{me.email}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[["Joined", me.join_date], ["Courses enrolled", (me.enrolled_courses || []).length], ["Lectures completed", Object.values(me.progress || {}).flatMap(p => p.watched || []).length]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${t.sep}` }}>
                    <span style={{ fontSize: 14, color: t.sub }}>{l}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Account deletion */}
            <Card t={t} style={{ padding: "22px 24px", border: `1px solid ${t.red}20` }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: t.red, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>Account Deletion</div>
              <DeleteAccountButton me={me} onDeleted={onLogout} t={t} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────
export default function App() {
  const dark  = useDark();
  const theme = mk(dark);
  const [splash,  setSplash]  = useState(true);
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  // Restore session on load + handle Google OAuth callback
  useEffect(() => {
    const init = async () => {
      // ── Handle Google OAuth redirect ──────────────────────────────
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        try {
          const params = new URLSearchParams(hash.replace("#", "?"));
          const accessToken = params.get("access_token");
          if (accessToken) {
            // Get user info from Supabase auth
            const res = await fetch(`${SB_URL}/auth/v1/user`, {
              headers: { ...H, Authorization: `Bearer ${accessToken}` }
            });
            const authUser = await res.json();
            if (authUser?.email) {
              // Find or create student record
              let rows = await db.get("students", { email: authUser.email });
              if (!rows?.length) {
                // Auto-create account for new Google users - name_verified = false so pledge screen shows
                const aaVal = await db.setting("auto_approve");
                const autoApprove = aaVal !== "false";
                const inserted = await db.insert("students", {
                  name: "", email: authUser.email, password: "", status: autoApprove ? "active" : "pending",
                  enrolled_courses: [], join_date: new Date().toISOString().slice(0, 10), progress: {},
                  name_verified: false
                });
                rows = inserted;
              }
              if (rows?.[0]) {
                window.history.replaceState(null, "", window.location.pathname);
                setSplash(false);
                setChecking(false);
                // Use handleLogin so name_verified check runs
                handleLogin("student", rows[0], true);
                return;
              }
            }
          }
        } catch (e) { console.error("OAuth error", e); }
        window.history.replaceState(null, "", window.location.pathname);
      }

      // ── Restore saved session ─────────────────────────────────────
      const saved = loadSession();
      if (saved) {
        const table = saved.role === "admin" ? "admins" : "students";
        db.get(table, { id: saved.user.id }).then(rows => {
          if (rows?.[0]) setSession({ role: saved.role, user: rows[0] });
          setChecking(false);
        }).catch(() => setChecking(false));
      } else {
        setChecking(false);
      }
    };

    init();
    setTimeout(() => setSplash(false), 1400);
  }, []);

  const [needsName, setNeedsName] = useState(null); // {role, user, keep}

  const handleLogin = (role, user, keep) => {
    // Always show name/pledge screen for students who haven't verified their name yet
    if (role === "student" && !user.name_verified) {
      setNeedsName({ role, user, keep });
      return;
    }
    setSession({ role, user });
    if (keep) saveSession({ role, user });
  };

  const handleNameComplete = async (fullName) => {
    if (!needsName) return;
    const { role, user, keep } = needsName;
    try {
      await db.update("students", user.id, { name: fullName, name_verified: true, gender: window._pendingGender || "" });
      const updatedUser = { ...user, name: fullName, name_verified: true, gender: window._pendingGender || "" };
      setNeedsName(null);
      setSession({ role, user: updatedUser });
      if (keep) saveSession({ role, user: updatedUser });
    } catch {
      setNeedsName(null);
      setSession({ role, user: { ...user, name: fullName, name_verified: true } });
    }
  };

  const handleLogout = () => {
    setSession(null);
    clearSession();
  };

  if (splash || checking) return <><GS dark={dark} /><Splash t={theme} /></>;

  return (
    <>
      <GS dark={dark} />
      {needsName
        ? <NameCollectionScreen onComplete={handleNameComplete} t={theme} />
        : !session
          ? <Auth onLogin={handleLogin} t={theme} />
          : session.role === "admin"
            ? <Admin me={session.user} onLogout={handleLogout} t={theme} />
            : <StudentView me={session.user} onLogout={handleLogout} t={theme} />
      }
    </>
  );
}
