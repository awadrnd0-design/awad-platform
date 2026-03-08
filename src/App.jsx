import { useState, useRef, useEffect } from "react";

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GS = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #080809; font-family: 'IBM Plex Sans', sans-serif; }
    ::-webkit-scrollbar { width: 3px; }
    ::-webkit-scrollbar-track { background: #0e0e10; }
    ::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 2px; }
    input:focus, textarea:focus { outline: none; }
    button { cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; }
    @keyframes fadeUp   { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
    @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
    @keyframes scaleIn  { from { opacity:0; transform:scale(0.95) } to { opacity:1; transform:scale(1) } }
    @keyframes shimmer  { 0%,100% { opacity:.4 } 50% { opacity:1 } }
    @keyframes spin     { to { transform:rotate(360deg) } }
    @keyframes pulse    { 0%,100% { opacity:1 } 50% { opacity:.3 } }
    @keyframes slideR   { from { opacity:0; transform:translateX(30px) } to { opacity:1; transform:translateX(0) } }
    @keyframes glow     { 0%,100% { box-shadow:0 0 20px rgba(212,175,55,0.15) } 50% { box-shadow:0 0 40px rgba(212,175,55,0.35) } }
  `}</style>
);

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:      "#080809",
  surface: "#0e0e11",
  card:    "#121215",
  raised:  "#171719",
  border:  "#1f1f24",
  borderHi:"#2e2e35",
  gold:    "#d4af37",
  goldDim: "rgba(212,175,55,0.1)",
  goldBdr: "rgba(212,175,55,0.22)",
  text:    "#eeeef0",
  soft:    "#9898a8",
  muted:   "#5a5a68",
  success: "#22c55e",
  error:   "#ef4444",
  warn:    "#f59e0b",
  info:    "#3b82f6",
};

const F = {
  display: "'Cormorant Garamond', serif",
  body:    "'IBM Plex Sans', sans-serif",
  mono:    "'IBM Plex Mono', monospace",
};

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const INIT = {
  admin: { email: "admin@awad.com", password: "awad2024", name: "Awad" },
  courses: [
    {
      id: 1, title: "Leadership Mastery", category: "Leadership",
      description: "Develop the mindset and skills of exceptional leaders.", color: "#d4af37",
      chapters: [
        { id: 1, title: "Foundations of Leadership", lessons: [
          { id: 1, title: "What Makes a True Leader", duration: "14:22" },
          { id: 2, title: "The Leadership Mindset", duration: "19:08" },
        ], quiz: { id: 1, title: "Chapter 1 Assessment", questions: [
          { id: 1, text: "What is the most important trait of a great leader?", options: ["Authority","Empathy","Wealth","Popularity"], answer: 1 },
          { id: 2, text: "Leadership is primarily about:", options: ["Giving orders","Inspiring others","Managing tasks","Being feared"], answer: 1 },
        ]}},
        { id: 2, title: "Communication & Influence", lessons: [
          { id: 3, title: "The Art of Persuasion", duration: "22:45" },
          { id: 4, title: "Public Speaking Mastery", duration: "28:30" },
        ], quiz: { id: 2, title: "Chapter 2 Assessment", questions: [
          { id: 3, text: "Effective communication starts with:", options: ["Talking","Listening","Writing","Reading"], answer: 1 },
        ]}},
      ],
    },
    {
      id: 2, title: "Financial Intelligence", category: "Finance",
      description: "Master money, investments, and financial freedom.", color: "#22c55e",
      chapters: [
        { id: 3, title: "Money Fundamentals", lessons: [
          { id: 5, title: "How Money Really Works", duration: "17:00" },
          { id: 6, title: "Budgeting for Success", duration: "21:15" },
        ], quiz: { id: 3, title: "Chapter 1 Assessment", questions: [
          { id: 4, text: "The first step to financial freedom is:", options: ["Earning more","Spending less","Saving consistently","Investing everything"], answer: 2 },
        ]}},
      ],
    },
    {
      id: 3, title: "Entrepreneurship Bootcamp", category: "Business",
      description: "From idea to thriving business — the complete guide.", color: "#3b82f6",
      chapters: [
        { id: 4, title: "Building Your Vision", lessons: [
          { id: 7, title: "Finding Your Business Idea", duration: "16:40" },
          { id: 8, title: "Validating Your Market", duration: "24:10" },
        ], quiz: { id: 4, title: "Chapter 1 Assessment", questions: [
          { id: 5, text: "Before starting a business you must:", options: ["Quit your job","Validate your idea","Build a website","Register a company"], answer: 1 },
        ]}},
      ],
    },
  ],
  students: [
    { id: 1, name: "Sarah Mitchell", email: "sarah@example.com", password: "1234", status: "active", enrolledCourses: [1, 2], joinDate: "2024-10-15",
      progress: { 1: { watched: [1, 2], quizScores: { 1: 100 }, completed: false }, 2: { watched: [5], quizScores: {}, completed: false } } },
    { id: 2, name: "Omar Hassan", email: "omar@example.com", password: "1234", status: "active", enrolledCourses: [1, 3], joinDate: "2024-11-02",
      progress: { 1: { watched: [1], quizScores: {}, completed: false }, 3: { watched: [7, 8], quizScores: { 4: 80 }, completed: false } } },
    { id: 3, name: "Priya Sharma", email: "priya@example.com", password: "1234", status: "pending", enrolledCourses: [], joinDate: "2025-01-20", progress: {} },
  ],
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
const Badge = ({ color = T.gold, children, sm }) => (
  <span style={{
    background: color + "18", border: `1px solid ${color}40`,
    color, borderRadius: 5, padding: sm ? "2px 7px" : "4px 11px",
    fontSize: sm ? 9 : 11, fontFamily: F.mono, fontWeight: 500,
    letterSpacing: 1, whiteSpace: "nowrap", textTransform: "uppercase",
  }}>{children}</span>
);

const Pill = ({ value, color = T.gold, height = 5 }) => (
  <div style={{ height, background: T.border, borderRadius: height, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", background: color, borderRadius: height, transition: "width 0.6s ease" }} />
  </div>
);

const Av = ({ name, size = 36, color }) => {
  const palette = [T.gold, "#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#f59e0b"];
  const c = color || palette[(name?.charCodeAt(0) || 0) % palette.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: c + "1a", border: `1.5px solid ${c}44`, display: "flex", alignItems: "center", justifyContent: "center", color: c, fontFamily: F.display, fontWeight: 700, fontSize: size * 0.42 }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );
};

const Btn = ({ children, onClick, variant = "primary", sm, disabled, full, style: sx }) => {
  const [hov, setHov] = useState(false);
  const v = {
    primary: { bg: hov ? "#e8c84a" : T.gold, color: "#080809", border: "none" },
    ghost:   { bg: hov ? T.raised : "transparent", color: T.text, border: `1px solid ${T.border}` },
    danger:  { bg: hov ? "#dc2626" : "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" },
    success: { bg: hov ? "#16a34a" : "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" },
    outline: { bg: hov ? T.goldDim : "transparent", color: T.gold, border: `1px solid ${T.goldBdr}` },
  }[variant];
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onClick} disabled={disabled}
      style={{ ...v, borderRadius: 10, padding: sm ? "7px 15px" : "12px 24px", fontSize: sm ? 12 : 14, fontWeight: 600, transition: "all 0.18s", letterSpacing: 0.3, opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer", width: full ? "100%" : "auto", ...(sx || {}) }}>
      {children}
    </button>
  );
};

const Inp = ({ label, value, onChange, type = "text", placeholder, sx }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
    {label && <label style={{ color: T.soft, fontSize: 11, fontFamily: F.mono, letterSpacing: 1 }}>{label.toUpperCase()}</label>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 15px", color: T.text, fontSize: 14, fontFamily: F.body, transition: "border 0.2s", ...(sx || {}) }}
      onFocus={e => e.target.style.borderColor = T.gold}
      onBlur={e => e.target.style.borderColor = T.border}
    />
  </div>
);

const KPI = ({ icon, label, value, note, color = T.gold }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px 22px", animation: "fadeUp 0.4s ease" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <Badge color={color} sm>{note}</Badge>
    </div>
    <div style={{ fontFamily: F.display, fontSize: 32, fontWeight: 700, color: T.text, marginBottom: 4 }}>{value}</div>
    <div style={{ color: T.muted, fontSize: 13 }}>{label}</div>
  </div>
);

// ─── PROTECTED VIDEO PLAYER ───────────────────────────────────────────────────
function VideoPlayer({ lesson, userEmail, onClose, onComplete }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shielding, setShielding] = useState(true);
  const [done, setDone] = useState(false);
  const iv = useRef(null);

  useEffect(() => { const t = setTimeout(() => setShielding(false), 2000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (playing && !done) {
      iv.current = setInterval(() => setProgress(p => {
        if (p >= 100) { clearInterval(iv.current); setPlaying(false); setDone(true); onComplete?.(); return 100; }
        return p + 0.07;
      }), 100);
    } else clearInterval(iv.current);
    return () => clearInterval(iv.current);
  }, [playing, done]);

  const total = (() => { const [m, s] = lesson.duration.split(":").map(Number); return m * 60 + s; })();
  const cur = Math.floor((progress / 100) * total);
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "#000", display: "flex", flexDirection: "column" }}>
      <GS />
      {shielding && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 60, height: 60, border: `2px solid ${T.gold}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <div style={{ fontFamily: F.display, fontSize: 22, color: T.gold, letterSpacing: 2 }}>AWAD</div>
          <div style={{ color: T.muted, fontSize: 11, fontFamily: F.mono, letterSpacing: 2 }}>SECURING YOUR STREAM</div>
        </div>
      )}

      {/* Video canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", cursor: "pointer", background: "#000" }} onClick={() => !done && setPlaying(p => !p)}>
        <div style={{ position: "absolute", inset: 0, background: playing ? `linear-gradient(160deg, #0a0a0e ${100 - progress * 0.6}%, #12101a)` : "linear-gradient(160deg,#0a0a0e,#0e0c16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!playing && !done && (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.goldDim, border: `2px solid ${T.goldBdr}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, animation: "glow 2s ease infinite" }}>▶</div>
          )}
        </div>

        {/* Watermark grid */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ color: "rgba(255,255,255,0.038)", fontSize: 11, fontFamily: F.mono, whiteSpace: "nowrap", transform: `rotate(-28deg) translateY(${(i - 2.5) * 85}px)`, letterSpacing: 2 }}>
              {userEmail} · AWAD PROTECTED · {userEmail} · AWAD PROTECTED · {userEmail}
            </div>
          </div>
        ))}

        {/* Top HUD */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "14px 18px", background: "linear-gradient(to bottom,rgba(0,0,0,0.8),transparent)", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, color: T.text, padding: "8px 14px", fontSize: 13, fontFamily: F.body, fontWeight: 600, backdropFilter: "blur(8px)" }}>← Back</button>
          <span style={{ color: T.text, fontFamily: F.body, fontWeight: 600, fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.title}</span>
          <div style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 7, padding: "5px 11px", display: "flex", alignItems: "center", gap: 6, color: "#fca5a5", fontSize: 10, fontFamily: F.mono, letterSpacing: 1 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1.5s infinite" }} />
            REC BLOCKED
          </div>
        </div>

        {/* Done overlay */}
        {done && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <div style={{ fontSize: 52 }}>✅</div>
            <div style={{ fontFamily: F.display, fontSize: 26, color: T.text, fontWeight: 600 }}>Lesson Complete</div>
            <Btn onClick={onClose}>Continue →</Btn>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ background: "#0a0a0c", borderTop: `1px solid ${T.border}`, padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
          <span style={{ color: T.muted, fontSize: 11, fontFamily: F.mono, minWidth: 38 }}>{fmt(cur)}</span>
          <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, cursor: "pointer", position: "relative" }}
            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setProgress(((e.clientX - r.left) / r.width) * 100); }}>
            <div style={{ width: `${progress}%`, height: "100%", background: T.gold, borderRadius: 2 }} />
            <div style={{ position: "absolute", top: "50%", left: `${progress}%`, transform: "translate(-50%,-50%)", width: 11, height: 11, borderRadius: "50%", background: T.gold, boxShadow: `0 0 8px ${T.gold}` }} />
          </div>
          <span style={{ color: T.muted, fontSize: 11, fontFamily: F.mono, minWidth: 38 }}>{lesson.duration}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setProgress(p => Math.max(0, p - 4))} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "8px 13px", fontSize: 12 }}>⏮ 10s</button>
          <button onClick={() => setPlaying(p => !p)} style={{ background: T.gold, border: "none", borderRadius: "50%", width: 46, height: 46, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "#080809" }}>{playing ? "⏸" : "▶"}</button>
          <button onClick={() => setProgress(p => Math.min(100, p + 4))} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "8px 13px", fontSize: 12 }}>10s ⏭</button>
          <div style={{ marginLeft: "auto" }}><Badge sm>🔒 Protected</Badge></div>
        </div>
      </div>
    </div>
  );
}

// ─── QUIZ ─────────────────────────────────────────────────────────────────────
function QuizModal({ quiz, courseId, existing, onSubmit, onClose }) {
  const [ans, setAns] = useState({});
  const [submitted, setSubmitted] = useState(existing !== undefined);
  const [score, setScore] = useState(existing ?? null);

  const submit = () => {
    let ok = 0;
    quiz.questions.forEach(q => { if (ans[q.id] === q.answer) ok++; });
    const s = Math.round((ok / quiz.questions.length) * 100);
    setScore(s); setSubmitted(true); onSubmit(s);
  };

  const pass = score >= 70;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(10px)" }}>
      <GS />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, width: "100%", maxWidth: 540, maxHeight: "88vh", overflow: "auto", animation: "scaleIn 0.25s ease" }}>
        <div style={{ padding: "22px 26px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, color: T.text }}>{quiz.title}</div>
            <div style={{ color: T.muted, fontSize: 13, marginTop: 3 }}>{quiz.questions.length} questions</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 22, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 22 }}>
          {submitted && (
            <div style={{ background: pass ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${pass ? T.success : T.error}33`, borderRadius: 14, padding: "20px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>{pass ? "🏆" : "📖"}</div>
              <div style={{ fontFamily: F.display, fontSize: 36, fontWeight: 700, color: pass ? T.success : T.error }}>{score}%</div>
              <div style={{ color: T.soft, fontSize: 14, marginTop: 6 }}>{pass ? "Excellent! You passed." : "Review the material and try again."}</div>
            </div>
          )}
          {quiz.questions.map((q, qi) => (
            <div key={q.id}>
              <div style={{ color: T.text, fontFamily: F.body, fontWeight: 600, fontSize: 15, marginBottom: 12, lineHeight: 1.5 }}>{qi + 1}. {q.text}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.options.map((opt, oi) => {
                  const sel = ans[q.id] === oi;
                  const correct = submitted && oi === q.answer;
                  const wrong = submitted && sel && oi !== q.answer;
                  return (
                    <button key={oi} onClick={() => !submitted && setAns(a => ({ ...a, [q.id]: oi }))}
                      style={{ background: correct ? "rgba(34,197,94,0.12)" : wrong ? "rgba(239,68,68,0.12)" : sel ? T.goldDim : T.surface, border: `1px solid ${correct ? T.success + "55" : wrong ? T.error + "55" : sel ? T.goldBdr : T.border}`, borderRadius: 10, padding: "12px 16px", color: T.text, textAlign: "left", fontSize: 14, fontFamily: F.body, cursor: submitted ? "default" : "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span><span style={{ fontFamily: F.mono, color: T.muted, marginRight: 10, fontSize: 11 }}>{String.fromCharCode(65 + oi)}.</span>{opt}</span>
                      {correct && <span>✅</span>}{wrong && <span>❌</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!submitted && (
            <Btn onClick={submit} disabled={Object.keys(ans).length < quiz.questions.length} full>Submit Assessment →</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SPLASH ───────────────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <GS />
      <div style={{ textAlign: "center", animation: "fadeUp 0.6s ease" }}>
        <div style={{ width: 80, height: 80, border: `1.5px solid ${T.gold}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", animation: "glow 2s ease infinite" }}>
          <div style={{ fontFamily: F.display, fontSize: 32, color: T.gold, fontWeight: 700, letterSpacing: 1 }}>A</div>
        </div>
        <div style={{ fontFamily: F.display, fontSize: 44, fontWeight: 700, color: T.text, letterSpacing: 3 }}>AWAD</div>
        <div style={{ color: T.muted, fontSize: 12, fontFamily: F.mono, letterSpacing: 4, marginTop: 8 }}>LEARNING PLATFORM</div>
      </div>
      <div style={{ position: "absolute", bottom: 40, display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: T.gold, animation: `shimmer 1.2s ease ${i * 0.2}s infinite` }} />)}
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({ data, onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const go = () => {
    setErr(""); setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (email === data.admin.email && pass === data.admin.password) return onLogin("admin", data.admin);
      const s = data.students.find(x => x.email === email && x.password === pass);
      if (s) {
        if (s.status === "pending") return setErr("Your account is awaiting admin approval.");
        return onLogin("student", s);
      }
      setErr("Incorrect email or password.");
    }, 700);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      <GS />
      {/* background decoration */}
      <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp 0.5s ease" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ width: 64, height: 64, border: `1.5px solid ${T.goldBdr}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", background: T.goldDim }}>
            <span style={{ fontFamily: F.display, fontSize: 28, color: T.gold, fontWeight: 700 }}>A</span>
          </div>
          <div style={{ fontFamily: F.display, fontSize: 34, fontWeight: 700, color: T.text, letterSpacing: 3 }}>AWAD</div>
          <div style={{ color: T.muted, fontSize: 11, fontFamily: F.mono, letterSpacing: 3, marginTop: 6 }}>LEARNING PLATFORM</div>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "32px 28px" }}>
          <div style={{ fontFamily: F.display, fontSize: 22, color: T.text, fontWeight: 600, marginBottom: 24, textAlign: "center" }}>Welcome Back</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Inp label="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@email.com" />
            <Inp label="Password" value={pass} onChange={e => setPass(e.target.value)} type="password" placeholder="••••••••" />
            {err && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "11px 14px", color: "#f87171", fontSize: 13, textAlign: "center" }}>{err}</div>
            )}
            <Btn onClick={go} disabled={loading} full style={{ marginTop: 4 }}>
              {loading ? "Signing in..." : "Sign In →"}
            </Btn>
          </div>
        </div>

        {/* Demo shortcuts */}
        <div style={{ marginTop: 20, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ color: T.muted, fontSize: 10, fontFamily: F.mono, letterSpacing: 1.5, marginBottom: 12 }}>DEMO ACCOUNTS — CLICK TO FILL</div>
          {[["Admin", "admin@awad.com", "awad2024"], ["Student", "sarah@example.com", "1234"]].map(([role, e, p]) => (
            <div key={role} onClick={() => { setEmail(e); setPass(p); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 9, cursor: "pointer", marginBottom: 6, border: `1px solid ${T.border}`, background: T.card, transition: "border 0.15s" }}
              onMouseEnter={el => el.currentTarget.style.borderColor = T.goldBdr}
              onMouseLeave={el => el.currentTarget.style.borderColor = T.border}>
              <Badge sm color={role === "Admin" ? T.gold : T.info}>{role}</Badge>
              <span style={{ color: T.soft, fontSize: 12, fontFamily: F.mono }}>{e}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 20 }}>
          {["🔒 Encrypted", "💧 Watermarked", "📵 Rec Blocked"].map(x => (
            <span key={x} style={{ color: T.muted, fontSize: 11, fontFamily: F.mono }}>{x}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function Admin({ data, setData, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [ns, setNs] = useState({ name: "", email: "", password: "", courses: [] });

  const pop = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const approve = id => { setData(d => ({ ...d, students: d.students.map(s => s.id === id ? { ...s, status: "active" } : s) })); pop("Student approved!"); };
  const remove  = id => { setData(d => ({ ...d, students: d.students.filter(s => s.id !== id) })); pop("Student removed.", "warn"); };
  const addStud = () => {
    if (!ns.name || !ns.email || !ns.password) return;
    const s = { id: Date.now(), ...ns, enrolledCourses: ns.courses, status: "active", joinDate: new Date().toISOString().slice(0, 10), progress: {} };
    setData(d => ({ ...d, students: [...d.students, s] }));
    setNs({ name: "", email: "", password: "", courses: [] });
    setModal(null); pop("Student invited!");
  };

  const pending = data.students.filter(s => s.status === "pending");
  const active  = data.students.filter(s => s.status === "active");
  const allLessons = data.courses.flatMap(c => c.chapters.flatMap(ch => ch.lessons));
  const avgProg = active.length ? Math.round(active.reduce((a, s) => {
    const w = Object.values(s.progress).flatMap(p => p.watched || []).length;
    return a + (allLessons.length ? w / allLessons.length * 100 : 0);
  }, 0) / active.length) : 0;

  const navs = [
    { id: "overview",  label: "Overview",  icon: "◈" },
    { id: "students",  label: "Students",  icon: "⊞" },
    { id: "courses",   label: "Courses",   icon: "◧" },
    { id: "analytics", label: "Analytics", icon: "◉" },
  ];

  // Student detail modal
  const StudDetail = ({ s }) => {
    const w = Object.values(s.progress).flatMap(p => p.watched || []).length;
    const pct = allLessons.length ? Math.round(w / allLessons.length * 100) : 0;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(10px)" }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, width: "100%", maxWidth: 600, maxHeight: "88vh", overflow: "auto", animation: "scaleIn 0.25s ease" }}>
          <div style={{ padding: "22px 26px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14 }}>
            <Av name={s.name} size={50} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, color: T.text }}>{s.name}</div>
              <div style={{ color: T.muted, fontSize: 12, fontFamily: F.mono, marginTop: 3 }}>{s.email}</div>
            </div>
            <Badge color={s.status === "active" ? T.success : T.warn}>{s.status}</Badge>
            <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: T.muted, fontSize: 22 }}>✕</button>
          </div>
          <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[["Lessons Watched", w], ["Overall Progress", `${pct}%`], ["Joined", s.joinDate]].map(([l, v]) => (
                <div key={l} style={{ background: T.surface, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontFamily: F.display, fontSize: 22, color: T.text, fontWeight: 700 }}>{v}</div>
                  <div style={{ color: T.muted, fontSize: 12, marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
            {data.courses.filter(c => s.enrolledCourses.includes(c.id)).map(c => {
              const sp = s.progress[c.id] || { watched: [], quizScores: {} };
              const cl = c.chapters.flatMap(ch => ch.lessons);
              const cp = Math.round(((sp.watched?.length || 0) / cl.length) * 100);
              return (
                <div key={c.id} style={{ background: T.surface, borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontFamily: F.body, fontWeight: 600, color: T.text, fontSize: 14 }}>{c.title}</div>
                    <span style={{ color: c.color, fontFamily: F.mono, fontSize: 13 }}>{cp}%</span>
                  </div>
                  <Pill value={cp} color={c.color} />
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {cl.map(l => (
                      <div key={l.id} style={{ background: sp.watched?.includes(l.id) ? c.color + "18" : T.card, border: `1px solid ${sp.watched?.includes(l.id) ? c.color + "44" : T.border}`, borderRadius: 6, padding: "3px 9px", fontSize: 11, color: sp.watched?.includes(l.id) ? c.color : T.muted }}>
                        {sp.watched?.includes(l.id) ? "✓ " : ""}{l.title}
                      </div>
                    ))}
                    {c.chapters.filter(ch => ch.quiz && sp.quizScores?.[ch.quiz.id] !== undefined).map(ch => (
                      <Badge key={ch.quiz.id} color={sp.quizScores[ch.quiz.id] >= 70 ? T.success : T.error} sm>Quiz {sp.quizScores[ch.quiz.id]}%</Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg }}>
      <GS />
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: toast.type === "ok" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${toast.type === "ok" ? T.success : T.error}44`, borderRadius: 12, padding: "12px 20px", color: toast.type === "ok" ? T.success : T.error, fontSize: 13, fontWeight: 600, backdropFilter: "blur(12px)", animation: "fadeUp 0.3s ease" }}>
          {toast.msg}
        </div>
      )}
      {modal?.type === "detail" && <StudDetail s={modal.s} />}
      {modal?.type === "add" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(10px)" }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, width: "100%", maxWidth: 440, animation: "scaleIn 0.25s ease" }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: F.display, fontSize: 22, color: T.text, fontWeight: 700 }}>Invite Student</div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: T.muted, fontSize: 22 }}>✕</button>
            </div>
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 15 }}>
              <Inp label="Full Name" value={ns.name} onChange={e => setNs(x => ({ ...x, name: e.target.value }))} placeholder="Jane Doe" />
              <Inp label="Email" type="email" value={ns.email} onChange={e => setNs(x => ({ ...x, email: e.target.value }))} placeholder="jane@example.com" />
              <Inp label="Temporary Password" type="password" value={ns.password} onChange={e => setNs(x => ({ ...x, password: e.target.value }))} placeholder="Min 4 characters" />
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label style={{ color: T.soft, fontSize: 11, fontFamily: F.mono, letterSpacing: 1 }}>ENROLL IN COURSES</label>
                {data.courses.map(c => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: ns.courses.includes(c.id) ? T.goldDim : T.surface, border: `1px solid ${ns.courses.includes(c.id) ? T.goldBdr : T.border}`, borderRadius: 9, cursor: "pointer" }}>
                    <input type="checkbox" checked={ns.courses.includes(c.id)} onChange={e => setNs(x => ({ ...x, courses: e.target.checked ? [...x.courses, c.id] : x.courses.filter(i => i !== c.id) }))} style={{ accentColor: T.gold }} />
                    <span style={{ color: T.text, fontSize: 14 }}>{c.title}</span>
                  </label>
                ))}
              </div>
              <Btn onClick={addStud} full>Invite Student →</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div style={{ width: 210, background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
        <div style={{ padding: "22px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: F.display, fontSize: 22, color: T.gold, letterSpacing: 2, fontWeight: 700 }}>AWAD</div>
          <Badge sm style={{ marginTop: 6 }}>Admin Panel</Badge>
        </div>
        <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {navs.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ background: tab === n.id ? T.goldDim : "none", border: tab === n.id ? `1px solid ${T.goldBdr}` : "1px solid transparent", borderRadius: 10, padding: "11px 14px", color: tab === n.id ? T.gold : T.muted, fontSize: 14, textAlign: "left", fontWeight: tab === n.id ? 600 : 400, display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s" }}>
              <span style={{ fontFamily: F.mono, fontSize: 16 }}>{n.icon}</span>{n.label}
              {n.id === "students" && pending.length > 0 && <span style={{ marginLeft: "auto", background: T.warn + "22", border: `1px solid ${T.warn}44`, color: T.warn, borderRadius: 8, padding: "1px 7px", fontSize: 10, fontFamily: F.mono }}>{pending.length}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: "14px 10px", borderTop: `1px solid ${T.border}` }}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: T.muted, fontSize: 13, width: "100%", textAlign: "left", padding: "9px 14px", borderRadius: 9 }}>← Sign Out</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 36px" }}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: F.display, fontSize: 32, fontWeight: 700, color: T.text, letterSpacing: 0.5 }}>Good day, {data.admin.name} 👋</div>
              <div style={{ color: T.muted, fontSize: 14, marginTop: 5 }}>Here's what's happening on your platform.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
              <KPI icon="👥" label="Total Students" value={data.students.length} note="All Time" />
              <KPI icon="✅" label="Active Students" value={active.length} note="Active" color={T.success} />
              <KPI icon="📚" label="Courses" value={data.courses.length} note="Live" color={T.info} />
              <KPI icon="📈" label="Avg Progress" value={`${avgProg}%`} note="Overall" color={T.warn} />
            </div>
            {pending.length > 0 && (
              <div style={{ background: "rgba(245,158,11,0.06)", border: `1px solid ${T.warn}30`, borderRadius: 16, padding: "20px 24px", marginBottom: 22 }}>
                <div style={{ fontFamily: F.body, fontWeight: 700, color: T.warn, marginBottom: 14, fontSize: 14 }}>⏳ Awaiting Approval ({pending.length})</div>
                {pending.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                    <Av name={s.name} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                      <div style={{ color: T.muted, fontSize: 12, fontFamily: F.mono }}>{s.email}</div>
                    </div>
                    <Btn sm variant="success" onClick={() => approve(s.id)}>Approve</Btn>
                    <Btn sm variant="danger" onClick={() => remove(s.id)}>Reject</Btn>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px 24px" }}>
              <div style={{ fontFamily: F.body, fontWeight: 700, color: T.text, marginBottom: 18, fontSize: 15 }}>Student Activity</div>
              {active.slice(0, 5).map(s => {
                const w = Object.values(s.progress).flatMap(p => p.watched || []).length;
                const pct = allLessons.length ? Math.round(w / allLessons.length * 100) : 0;
                return (
                  <div key={s.id} onClick={() => setModal({ type: "detail", s })} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}>
                    <Av name={s.name} size={34} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontSize: 14, fontWeight: 600, marginBottom: 5 }}>{s.name}</div>
                      <Pill value={pct} height={4} />
                    </div>
                    <span style={{ color: T.gold, fontFamily: F.mono, fontSize: 13 }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STUDENTS */}
        {tab === "students" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700, color: T.text }}>Students</div>
                <div style={{ color: T.muted, fontSize: 13, marginTop: 3 }}>{data.students.length} total · {active.length} active</div>
              </div>
              <Btn onClick={() => setModal({ type: "add" })}>+ Invite Student</Btn>
            </div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 2fr 1fr 1fr auto", padding: "12px 20px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                {["Name","Email","Courses","Progress","Status",""].map(h => (
                  <div key={h} style={{ color: T.muted, fontSize: 10, fontFamily: F.mono, letterSpacing: 1 }}>{h.toUpperCase()}</div>
                ))}
              </div>
              {data.students.map((s, i) => {
                const w = Object.values(s.progress).flatMap(p => p.watched || []).length;
                const pct = allLessons.length ? Math.round(w / allLessons.length * 100) : 0;
                return (
                  <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 2fr 1fr 1fr auto", padding: "13px 20px", borderBottom: `1px solid ${T.border}`, alignItems: "center", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Av name={s.name} size={30} /><span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    </div>
                    <div style={{ color: T.muted, fontSize: 12, fontFamily: F.mono }}>{s.email}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {s.enrolledCourses.map(cid => { const c = data.courses.find(x => x.id === cid); return c ? <Badge key={cid} color={c.color} sm>{c.title.split(" ")[0]}</Badge> : null; })}
                      {s.enrolledCourses.length === 0 && <span style={{ color: T.muted, fontSize: 12 }}>—</span>}
                    </div>
                    <div>
                      <div style={{ color: T.gold, fontSize: 11, fontFamily: F.mono, marginBottom: 4 }}>{pct}%</div>
                      <Pill value={pct} height={4} />
                    </div>
                    <Badge color={s.status === "active" ? T.success : T.warn} sm>{s.status}</Badge>
                    <div style={{ display: "flex", gap: 5 }}>
                      <Btn sm variant="ghost" onClick={() => setModal({ type: "detail", s })}>View</Btn>
                      {s.status === "pending" && <Btn sm variant="success" onClick={() => approve(s.id)}>✓</Btn>}
                      <Btn sm variant="danger" onClick={() => remove(s.id)}>✕</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* COURSES */}
        {tab === "courses" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 6 }}>Courses</div>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>{data.courses.length} courses published</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {data.courses.map(c => {
                const lessons = c.chapters.flatMap(ch => ch.lessons);
                const enrolled = data.students.filter(s => s.enrolledCourses.includes(c.id)).length;
                return (
                  <div key={c.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ height: 3, background: c.color }} />
                    <div style={{ padding: "20px 24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                        <div>
                          <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, color: T.text }}>{c.title}</div>
                          <div style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>{c.description}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Badge color={c.color}>{lessons.length} Lessons</Badge>
                          <Badge color={T.info}>{enrolled} Students</Badge>
                        </div>
                      </div>
                      {c.chapters.map(ch => (
                        <div key={ch.id} style={{ background: T.surface, borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ fontFamily: F.body, fontWeight: 600, color: T.text, fontSize: 13 }}>{ch.title}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <Badge sm>{ch.lessons.length} lessons</Badge>
                              {ch.quiz && <Badge color={T.warn} sm>Quiz</Badge>}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {ch.lessons.map(l => (
                              <div key={l.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 11, color: T.soft }}>
                                🎬 {l.title} <span style={{ color: T.muted, fontFamily: F.mono }}>({l.duration})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {tab === "analytics" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 24 }}>Analytics</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "22px 24px" }}>
                <div style={{ fontFamily: F.body, fontWeight: 700, color: T.text, marginBottom: 18, fontSize: 14 }}>Course Completion</div>
                {data.courses.map(c => {
                  const cl = c.chapters.flatMap(ch => ch.lessons);
                  const en = data.students.filter(s => s.enrolledCourses.includes(c.id));
                  const avg = en.length ? Math.round(en.reduce((a, s) => a + ((s.progress[c.id]?.watched?.length || 0) / cl.length) * 100, 0) / en.length) : 0;
                  return (
                    <div key={c.id} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{c.title}</span>
                        <span style={{ color: c.color, fontFamily: F.mono, fontSize: 13 }}>{avg}%</span>
                      </div>
                      <Pill value={avg} color={c.color} height={7} />
                      <div style={{ color: T.muted, fontSize: 11, marginTop: 4 }}>{en.length} enrolled</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "22px 24px" }}>
                <div style={{ fontFamily: F.body, fontWeight: 700, color: T.text, marginBottom: 18, fontSize: 14 }}>Quiz Performance</div>
                {data.courses.flatMap(c => c.chapters.filter(ch => ch.quiz).map(ch => {
                  const scores = data.students.flatMap(s => { const sc = s.progress[c.id]?.quizScores?.[ch.quiz.id]; return sc !== undefined ? [sc] : []; });
                  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
                  return (
                    <div key={ch.quiz.id} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ color: T.text, fontSize: 13 }}>{ch.quiz.title}</span>
                        <span style={{ color: avg !== null ? (avg >= 70 ? T.success : T.error) : T.muted, fontFamily: F.mono, fontSize: 13 }}>{avg !== null ? `${avg}%` : "—"}</span>
                      </div>
                      {avg !== null && <Pill value={avg} color={avg >= 70 ? T.success : T.error} height={5} />}
                      <div style={{ color: T.muted, fontSize: 11, marginTop: 4 }}>{scores.length} submissions</div>
                    </div>
                  );
                }))}
              </div>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "22px 24px", gridColumn: "1/-1" }}>
                <div style={{ fontFamily: F.body, fontWeight: 700, color: T.text, marginBottom: 18, fontSize: 14 }}>🏆 Student Leaderboard</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {active.sort((a, b) => {
                    const wA = Object.values(a.progress).flatMap(p => p.watched || []).length;
                    const wB = Object.values(b.progress).flatMap(p => p.watched || []).length;
                    return wB - wA;
                  }).map((s, i) => {
                    const w = Object.values(s.progress).flatMap(p => p.watched || []).length;
                    const pct = allLessons.length ? Math.round(w / allLessons.length * 100) : 0;
                    return (
                      <div key={s.id} style={{ background: T.surface, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, border: i === 0 ? `1px solid ${T.goldBdr}` : `1px solid ${T.border}` }}>
                        <span style={{ fontSize: 20 }}>{["🥇","🥈","🥉"][i] || "👤"}</span>
                        <Av name={s.name} size={32} />
                        <div>
                          <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                          <div style={{ color: T.gold, fontFamily: F.mono, fontSize: 12 }}>{pct}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STUDENT ──────────────────────────────────────────────────────────────────
function Student({ student, data, setData, onLogout }) {
  const [tab, setTab] = useState("home");
  const [openCourse, setOpenCourse] = useState(null);
  const [player, setPlayer] = useState(null);
  const [quiz, setQuiz]  = useState(null);

  const me = data.students.find(s => s.id === student.id);
  const myCourses = data.courses.filter(c => me.enrolledCourses.includes(c.id));
  const allLessons = data.courses.flatMap(c => c.chapters.flatMap(ch => ch.lessons));
  const totalW = Object.values(me.progress).flatMap(p => p.watched || []).length;
  const overallPct = allLessons.length ? Math.round(totalW / allLessons.length * 100) : 0;

  const markWatched = (cid, lid) => setData(d => ({ ...d, students: d.students.map(s => {
    if (s.id !== me.id) return s;
    const cp = s.progress[cid] || { watched: [], quizScores: {} };
    return { ...s, progress: { ...s.progress, [cid]: { ...cp, watched: cp.watched.includes(lid) ? cp.watched : [...cp.watched, lid] } } };
  })}));

  const saveQuiz = (cid, qid, score) => setData(d => ({ ...d, students: d.students.map(s => {
    if (s.id !== me.id) return s;
    const cp = s.progress[cid] || { watched: [], quizScores: {} };
    return { ...s, progress: { ...s.progress, [cid]: { ...cp, quizScores: { ...cp.quizScores, [qid]: score } } } };
  })}));

  if (player) return <VideoPlayer lesson={player.lesson} userEmail={me.email} onClose={() => setPlayer(null)} onComplete={() => markWatched(player.cid, player.lesson.id)} />;
  if (quiz)   return <QuizModal quiz={quiz.q} courseId={quiz.cid} existing={me.progress[quiz.cid]?.quizScores?.[quiz.q.id]} onSubmit={s => saveQuiz(quiz.cid, quiz.q.id, s)} onClose={() => setQuiz(null)} />;

  const navs = [{ id: "home", icon: "⌂", label: "Home" }, { id: "courses", icon: "◧", label: "Courses" }, { id: "progress", icon: "◉", label: "Progress" }];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 80 }}>
      <GS />
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(8,8,9,0.96)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${T.border}`, padding: "13px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontFamily: F.display, fontSize: 20, color: T.gold, letterSpacing: 2, fontWeight: 700 }}>AWAD</div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 2 }}>
          {navs.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ background: tab === n.id ? T.goldDim : "none", border: tab === n.id ? `1px solid ${T.goldBdr}` : "1px solid transparent", borderRadius: 9, padding: "7px 14px", color: tab === n.id ? T.gold : T.muted, fontSize: 12, fontWeight: tab === n.id ? 600 : 400, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
              <span style={{ fontFamily: F.mono }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Av name={me.name} size={30} />
          <button onClick={onLogout} style={{ background: "none", border: "none", color: T.muted, fontSize: 12 }}>Out</button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 18px" }}>

        {/* HOME */}
        {tab === "home" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ marginBottom: 26 }}>
              <div style={{ fontFamily: F.display, fontSize: 30, fontWeight: 700, color: T.text }}>Hello, {me.name.split(" ")[0]} 👋</div>
              <div style={{ color: T.muted, fontSize: 14, marginTop: 4 }}>Continue your learning journey.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 26 }}>
              <KPI icon="🎬" label="Lessons Watched" value={totalW} note="Total" />
              <KPI icon="📈" label="Overall Progress" value={`${overallPct}%`} note="Complete" color={T.success} />
              <KPI icon="📚" label="My Courses" value={myCourses.length} note="Enrolled" color={T.info} />
            </div>
            <div style={{ fontFamily: F.body, fontWeight: 700, color: T.text, fontSize: 15, marginBottom: 14 }}>Continue Learning</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {myCourses.map(c => {
                const cl = c.chapters.flatMap(ch => ch.lessons);
                const w = me.progress[c.id]?.watched || [];
                const pct = Math.round((w.length / cl.length) * 100);
                const next = cl.find(l => !w.includes(l.id));
                return (
                  <div key={c.id} onClick={() => { setTab("courses"); setOpenCourse(c.id); }}
                    style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", transition: "border 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = c.color + "55"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                    <div style={{ height: 3, background: c.color }} />
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>{c.title}</div>
                      <Pill value={pct} color={c.color} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        <span style={{ color: T.muted, fontSize: 12 }}>{w.length}/{cl.length} lessons</span>
                        <span style={{ color: c.color, fontFamily: F.mono, fontSize: 12 }}>{pct}%</span>
                      </div>
                      {next && <div style={{ color: T.soft, fontSize: 12, marginTop: 8 }}>▶ {next.title}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* COURSES */}
        {tab === "courses" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 22 }}>My Courses</div>
            {myCourses.map(c => {
              const sp = me.progress[c.id] || { watched: [], quizScores: {} };
              const isOpen = openCourse === c.id;
              return (
                <div key={c.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{ height: 3, background: c.color }} />
                  <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setOpenCourse(isOpen ? null : c.id)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>{c.title}</div>
                      <div style={{ width: 180 }}><Pill value={Math.round(((sp.watched?.length || 0) / c.chapters.flatMap(ch => ch.lessons).length) * 100)} color={c.color} /></div>
                    </div>
                    <Badge color={c.color}>{Math.round(((sp.watched?.length || 0) / c.chapters.flatMap(ch => ch.lessons).length) * 100)}%</Badge>
                    <span style={{ color: T.muted, fontSize: 18, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none" }}>⌄</span>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${T.border}`, padding: "4px 22px 20px" }}>
                      {c.chapters.map(ch => (
                        <div key={ch.id} style={{ marginTop: 16 }}>
                          <div style={{ color: T.muted, fontSize: 10, fontFamily: F.mono, letterSpacing: 2, marginBottom: 10 }}>{ch.title.toUpperCase()}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {ch.lessons.map(l => {
                              const watched = sp.watched?.includes(l.id);
                              return (
                                <div key={l.id} onClick={() => setPlayer({ lesson: l, cid: c.id })}
                                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 15px", background: watched ? c.color + "0d" : T.surface, border: `1px solid ${watched ? c.color + "33" : T.border}`, borderRadius: 10, cursor: "pointer", transition: "all 0.15s" }}
                                  onMouseEnter={e => e.currentTarget.style.borderColor = c.color + "55"}
                                  onMouseLeave={e => e.currentTarget.style.borderColor = watched ? c.color + "33" : T.border}>
                                  <span style={{ fontSize: 16 }}>{watched ? "✅" : "🎬"}</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{l.title}</div>
                                    <div style={{ color: T.muted, fontSize: 11, fontFamily: F.mono, marginTop: 2 }}>{l.duration}</div>
                                  </div>
                                  {watched && <Badge color={c.color} sm>Watched</Badge>}
                                  <span style={{ color: T.muted }}>▶</span>
                                </div>
                              );
                            })}
                            {ch.quiz && (
                              <div onClick={() => setQuiz({ q: ch.quiz, cid: c.id })}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 15px", background: sp.quizScores?.[ch.quiz.id] !== undefined ? "rgba(212,175,55,0.06)" : T.surface, border: `1px solid ${sp.quizScores?.[ch.quiz.id] !== undefined ? T.goldBdr : T.border}`, borderRadius: 10, cursor: "pointer", transition: "all 0.15s" }}>
                                <span style={{ fontSize: 16 }}>📝</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{ch.quiz.title}</div>
                                  <div style={{ color: T.muted, fontSize: 11 }}>{ch.quiz.questions.length} questions</div>
                                </div>
                                {sp.quizScores?.[ch.quiz.id] !== undefined
                                  ? <Badge color={sp.quizScores[ch.quiz.id] >= 70 ? T.success : T.error} sm>{sp.quizScores[ch.quiz.id]}%</Badge>
                                  : <Badge color={T.gold} sm>Take Quiz</Badge>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* PROGRESS */}
        {tab === "progress" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 22 }}>My Progress</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {myCourses.map(c => {
                const sp = me.progress[c.id] || { watched: [], quizScores: {} };
                const cl = c.chapters.flatMap(ch => ch.lessons);
                const pct = Math.round(((sp.watched?.length || 0) / cl.length) * 100);
                const quizzes = c.chapters.filter(ch => ch.quiz);
                const done = quizzes.filter(ch => sp.quizScores?.[ch.quiz.id] !== undefined).length;
                return (
                  <div key={c.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px 22px" }}>
                    <div style={{ height: 2, background: c.color, borderRadius: 2, width: `${pct}%`, marginBottom: 16, transition: "width 0.6s ease" }} />
                    <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 14 }}>{c.title}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ color: T.muted, fontSize: 13 }}>Video Lessons</span>
                          <span style={{ color: c.color, fontFamily: F.mono, fontSize: 12 }}>{sp.watched?.length || 0}/{cl.length}</span>
                        </div>
                        <Pill value={pct} color={c.color} />
                      </div>
                      {quizzes.length > 0 && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: T.muted, fontSize: 13 }}>Quizzes</span>
                            <span style={{ color: T.gold, fontFamily: F.mono, fontSize: 12 }}>{done}/{quizzes.length}</span>
                          </div>
                          <Pill value={quizzes.length ? (done / quizzes.length) * 100 : 0} color={T.gold} />
                        </div>
                      )}
                      {quizzes.map(ch => sp.quizScores?.[ch.quiz.id] !== undefined && (
                        <div key={ch.quiz.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: T.surface, borderRadius: 8 }}>
                          <span style={{ color: T.soft, fontSize: 12 }}>{ch.quiz.title}</span>
                          <Badge color={sp.quizScores[ch.quiz.id] >= 70 ? T.success : T.error} sm>{sp.quizScores[ch.quiz.id]}%</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(INIT);
  const [session, setSession] = useState(null);
  const [splashing, setSplashing] = useState(true);

  useEffect(() => { setTimeout(() => setSplashing(false), 2400); }, []);

  if (splashing) return <><GS /><Splash /></>;
  if (!session)  return <Login data={data} onLogin={(role, user) => setSession({ role, user })} />;
  if (session.role === "admin")   return <Admin   data={data} setData={setData} onLogout={() => setSession(null)} />;
  if (session.role === "student") return <Student student={session.user} data={data} setData={setData} onLogout={() => setSession(null)} />;
}
