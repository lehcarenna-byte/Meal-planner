import { useState, useCallback, useEffect } from "react";

// ── Anthropic API call ─────────────────────────────────────────────────────
async function callClaude(messages, system) {
  let res;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8096, system, messages }),
    });
  } catch (e) {
    throw new Error(`Network error: ${e.message}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    let errData;
    try { errData = JSON.parse(errText); } catch {}
    throw new Error(errData?.error || `API error ${res.status}: ${errText.slice(0, 120)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            fullText += evt.delta.text;
          }
          if (evt.type === "error") throw new Error(evt.error?.message || "Stream error");
        } catch (e) {
          if (e.message.includes("Stream error")) throw e;
        }
      }
    }
  } catch (e) {
    throw new Error(`Stream error: ${e.message}`);
  }

  if (!fullText) throw new Error("Empty response — the API returned no content");
  return fullText.replace(/```json|```/g, "").trim();
}

// ── System prompt ──────────────────────────────────────────────────────────
const SYSTEM = `You are a budget meal planning assistant for a family in California.
You return ONLY valid JSON, no preamble, no markdown fences, no explanation.

When asked to generate a full week, return exactly this shape:
{
  "meals": [
    {
      "day": "Monday",
      "name": "Meal Name",
      "tag": "Batch Cook",
      "tagColor": "#e8a838",
      "cost": 3.50,
      "prepTime": "10 min",
      "cookTime": "25 min",
      "description": "One-sentence description.",
      "ingredients": ["item 1", "item 2"],
      "instructions": ["Step 1.", "Step 2.", "Step 3."]
    }
  ],
  "groceryList": [
    {
      "category": "Proteins & Meat",
      "icon": "🥩",
      "color": "#e85c5c",
      "items": [{ "name": "Ground beef (80/20)", "qty": "1 lb", "est": "$4.99" }]
    }
  ],
  "weekTotal": 52.00,
  "tips": [
    { "icon": "🍗", "title": "Short tip title", "body": "2–3 sentence practical tip." }
  ],
  "prepSchedule": [
    { "when": "Sunday or Monday", "task": "What to prep and why it saves time later." }
  ]
}

Rules:
- 7 meals (Mon–Sun), last meal uses leftovers from a prior batch
- Keep ingredients list to 6 items max per meal, instructions to 4 steps max — be concise
- Prioritize affordable staples: rice, beans, lentils, pasta, potatoes, carrots, seasonal CA produce
- Reuse ingredients across multiple meals to reduce waste
- Use anchor ingredients prominently in 2–3 meals minimum
- If an anchor recipe is given, include it exactly as one of the 7 meals
- If avoid ingredients are listed, NEVER use them in any meal or ingredient — not even trace amounts
- If macro targets are given, choose proteins/carbs/fats to match those ratios as closely as possible
- Tags: "Batch Cook", "15 min cook", "One Pan", "Oven Meal", "Budget MVP", "High Protein", "No Waste"
- tagColor: Batch Cook=#e8a838, 15 min cook=#4caf7d, One Pan=#6c88d4, Oven Meal=#b06dd4, Budget MVP=#e85c5c, High Protein=#e85c5c, No Waste=#4caf7d
- Grocery categories: "Proteins & Meat", "Fresh Produce", "Grains & Bread", "Canned & Pantry", "Frozen Veg", "Oils, Sauces & Spices", "Optional"
- cost field = estimated ingredient cost for that meal only
- tips: 4–6 entries — ingredient savings, batch strategy, reuse, substitutions
- prepSchedule: 4–5 day-by-day entries

When asked to regenerate ONE meal, return ONLY the single meal object (same shape, no wrapper).`;

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:       "#07080f",
  bg2:      "#0d0e1a",
  bg3:      "#12131f",
  card:     "rgba(255,255,255,0.04)",
  cardHov:  "rgba(255,255,255,0.07)",
  border:   "rgba(255,255,255,0.08)",
  border2:  "rgba(255,255,255,0.12)",
  text:     "#f1f5f9",
  text2:    "rgba(241,245,249,0.55)",
  text3:    "rgba(241,245,249,0.28)",
  purple:   "#8b5cf6",
  blue:     "#3b82f6",
  cyan:     "#06b6d4",
  grad:     "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 50%, #06b6d4 100%)",
  gradText: "linear-gradient(135deg, #a78bfa, #60a5fa, #22d3ee)",
  glow:     "0 0 40px rgba(139,92,246,0.25), 0 0 80px rgba(59,130,246,0.12)",
  glowSm:   "0 0 20px rgba(139,92,246,0.2)",
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: ${C.bg}; }
  body { font-family: 'Inter', system-ui, sans-serif; background: ${C.bg}; color: ${C.text}; -webkit-font-smoothing: antialiased; }
  input, textarea, select, button { font-family: inherit; }
  input, textarea, select { outline: none; }
  button { cursor: pointer; }

  .grad-text {
    background: ${C.gradText};
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .glass {
    background: ${C.card};
    border: 1px solid ${C.border};
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .glass-hover:hover {
    background: ${C.cardHov};
    border-color: ${C.border2};
  }

  .grad-btn {
    background: ${C.grad};
    border: none;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s;
    position: relative;
    overflow: hidden;
  }
  .grad-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0);
    transition: background 0.2s;
  }
  .grad-btn:hover::after { background: rgba(255,255,255,0.08); }
  .grad-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(139,92,246,0.4); }
  .grad-btn:active { transform: translateY(0); }
  .grad-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

  .field {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255,255,255,0.04);
    border: 1px solid ${C.border};
    border-radius: 10px;
    color: ${C.text};
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .field::placeholder { color: ${C.text3}; }
  .field:focus { border-color: rgba(139,92,246,0.5); box-shadow: 0 0 0 3px rgba(139,92,246,0.12); }

  .chip-btn {
    padding: 7px 14px;
    background: rgba(255,255,255,0.05);
    border: 1px solid ${C.border};
    border-radius: 100px;
    font-size: 12px;
    color: ${C.text2};
    transition: all 0.15s;
  }
  .chip-btn:hover { background: rgba(139,92,246,0.15); border-color: rgba(139,92,246,0.4); color: ${C.text}; }

  .fade-up { animation: fadeUp 0.5s ease both; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

  .fade-in { animation: fadeIn 0.3s ease both; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

  .label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${C.text3};
    margin-bottom: 8px;
  }

  @media print {
    .no-print { display: none !important; }
    .print-section { display: block !important; }
    body { background: white !important; color: black !important; }
    @page { margin: 18mm; }
  }
`;

// ── Skeleton ───────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 72, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.06)", flexShrink: 0,
        backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
        backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: "55%", height: 13, borderRadius: 6, background: "rgba(255,255,255,0.06)", marginBottom: 8,
          backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite 0.1s" }} />
        <div style={{ width: "75%", height: 9, borderRadius: 6, background: "rgba(255,255,255,0.04)",
          backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite 0.2s" }} />
      </div>
      <div style={{ width: 50, height: 22, borderRadius: 100, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

// ── Meal card ──────────────────────────────────────────────────────────────
function MealCard({ meal, index, expanded, onToggle, onRegenerate, regenLoading, forceExpand }) {
  const isOpen = expanded === index || forceExpand;
  const tc = meal.tagColor || "#8b5cf6";

  return (
    <div style={{
      background: isOpen ? "rgba(255,255,255,0.06)" : C.card,
      border: `1px solid ${isOpen ? tc + "55" : C.border}`,
      borderRadius: 14,
      marginBottom: 8,
      overflow: "hidden",
      boxShadow: isOpen ? `0 0 0 1px ${tc}22, 0 8px 32px rgba(0,0,0,0.3), inset 0 0 0 1px ${tc}11` : "none",
      transition: "all 0.2s",
    }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12, cursor: "pointer" }}>
        {/* Day pill */}
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          background: isOpen ? C.grad : "rgba(255,255,255,0.07)",
          borderRadius: 6, padding: "5px 10px", minWidth: 72, textAlign: "center", flexShrink: 0,
          color: isOpen ? "#fff" : C.text3,
          transition: "all 0.2s",
        }}>{meal.day}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meal.name}</div>
          <div style={{ fontSize: 11, color: C.text3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meal.description}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          <div style={{
            background: tc + "18", color: tc, border: `1px solid ${tc}40`,
            borderRadius: 100, padding: "2px 9px", fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap",
          }}>{meal.tag}</div>
          <div style={{ fontSize: 16, fontWeight: 700, background: C.gradText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            ${meal.cost?.toFixed(2)}
          </div>
        </div>

        <div className="no-print" style={{ color: C.text3, fontSize: 14, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.22s", marginLeft: 4, flexShrink: 0 }}>▾</div>
      </div>

      {isOpen && (
        <div style={{ borderTop: `1px solid ${tc}22` }}>
          {/* Timing */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, padding: "10px 18px", fontSize: 12, color: C.text2, borderRight: `1px solid ${C.border}` }}>
              ⏱ Prep <span style={{ color: C.text, fontWeight: 600 }}>{meal.prepTime}</span>
            </div>
            <div style={{ flex: 1, padding: "10px 18px", fontSize: 12, color: C.text2 }}>
              🔥 Cook <span style={{ color: C.text, fontWeight: 600 }}>{meal.cookTime}</span>
            </div>
          </div>

          {/* Ingredients + Instructions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: "16px 18px", borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.text3, marginBottom: 10 }}>Ingredients</div>
              {(meal.ingredients || []).map((ing, j) => (
                <div key={j} style={{ display: "flex", gap: 8, fontSize: 12, color: C.text2, padding: "3px 0", lineHeight: 1.5 }}>
                  <span style={{ color: tc, flexShrink: 0, fontSize: 14, lineHeight: 1.3 }}>·</span>{ing}
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.text3, marginBottom: 10 }}>Instructions</div>
              {(meal.instructions || []).map((step, j) => (
                <div key={j} style={{ display: "flex", gap: 8, fontSize: 12, color: C.text2, padding: "3px 0", lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: tc, flexShrink: 0, minWidth: 14 }}>{j + 1}.</span>{step}
                </div>
              ))}
            </div>
          </div>

          {!forceExpand && (
            <div className="no-print" style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={(e) => { e.stopPropagation(); onRegenerate(index); }} disabled={regenLoading === index}
                style={{ padding: "7px 14px", background: regenLoading === index ? "rgba(255,255,255,0.05)" : "rgba(139,92,246,0.15)", color: regenLoading === index ? C.text3 : C.purple,
                  border: `1px solid ${regenLoading === index ? C.border : "rgba(139,92,246,0.3)"}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: regenLoading === index ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
                {regenLoading === index ? "↻ Swapping…" : "↻ Swap meal"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Grocery list ───────────────────────────────────────────────────────────
function GroceryList({ groceryList, weekTotal }) {
  const [checked, setChecked] = useState({});
  const toggle = (key) => setChecked(p => ({ ...p, [key]: !p[key] }));

  return (
    <div>
      {/* Total banner */}
      <div style={{ background: C.grad, borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: C.glow }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Estimated Total</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#fff" }}>~${weekTotal?.toFixed(2)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Per meal</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>~${weekTotal ? (weekTotal / 7).toFixed(2) : "—"}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>for 3 people</div>
        </div>
      </div>

      {(groceryList || []).map((cat, ci) => (
        <div key={ci} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>{cat.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.text2 }}>{cat.category}</span>
            <div style={{ flex: 1, height: 1, background: (cat.color || C.purple) + "30" }} />
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {(cat.items || []).map((item, ii) => {
              const key = `${ci}-${ii}`;
              const done = checked[key];
              return (
                <div key={ii} onClick={() => toggle(key)} style={{ display: "flex", alignItems: "center", padding: "11px 14px", gap: 10,
                  borderBottom: ii < cat.items.length - 1 ? `1px solid ${C.border}` : "none",
                  cursor: "pointer", opacity: done ? 0.35 : 1, transition: "opacity 0.2s" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${done ? cat.color || C.purple : C.border2}`,
                    background: done ? (cat.color || C.purple) : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                    {done && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: done ? C.text3 : C.text, textDecoration: done ? "line-through" : "none", transition: "all 0.2s" }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: C.text3 }}>{item.qty}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, minWidth: 44, textAlign: "right" }}>{item.est}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tips tab ───────────────────────────────────────────────────────────────
function TipsTab({ tips, prepSchedule }) {
  return (
    <div>
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {tips.map((tip, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", display: "flex", gap: 16, alignItems: "flex-start", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.border2; e.currentTarget.style.background = C.cardHov; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{tip.icon}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 5 }}>{tip.title}</div>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>{tip.body}</div>
            </div>
          </div>
        ))}
      </div>

      {prepSchedule.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.text3, marginBottom: 16 }}>Prep Schedule</div>
          <div style={{ display: "grid", gap: 14 }}>
            {prepSchedule.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.purple, minWidth: 130, flexShrink: 0, paddingTop: 1 }}>{s.when}</div>
                <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{s.task}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Macro sliders ──────────────────────────────────────────────────────────
function MacroSliders({ macros, onChange }) {
  const items = [
    { key: "protein", label: "Protein", color: "#a855f7" },
    { key: "carbs",   label: "Carbs",   color: "#3b82f6" },
    { key: "fat",     label: "Fat",     color: "#06b6d4" },
  ];
  const total = macros.protein + macros.carbs + macros.fat;

  const update = (key, raw) => {
    const val = Math.min(100, Math.max(0, parseInt(raw) || 0));
    const others = ["protein", "carbs", "fat"].filter(k => k !== key);
    const remaining = 100 - val;
    const otherSum = macros[others[0]] + macros[others[1]];
    let a, b;
    if (otherSum === 0) { a = Math.floor(remaining / 2); b = remaining - a; }
    else { a = Math.round(remaining * macros[others[0]] / otherSum); b = remaining - a; }
    onChange({ ...macros, [key]: val, [others[0]]: a, [others[1]]: b });
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label className="label" style={{ margin: 0 }}>Macro targets</label>
        <span style={{ fontSize: 11, fontWeight: 600, color: total === 100 ? "#4ade80" : "#f87171" }}>{total}%</span>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", display: "grid", gap: 12 }}>
        {items.map(({ key, label, color }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, color: C.text2, width: 54, flexShrink: 0 }}>{label}</div>
            <input type="range" min={0} max={100} value={macros[key]} onChange={e => update(key, e.target.value)}
              style={{ flex: 1, accentColor: color, cursor: "pointer", height: 4 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color, width: 36, textAlign: "right", flexShrink: 0 }}>{macros[key]}%</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginTop: 5 }}>Adjusting one slider auto-balances the others</div>
    </div>
  );
}

// ── Saved weeks ────────────────────────────────────────────────────────────
function SavedWeeksList({ savedWeeks, onLoad, onDelete }) {
  if (savedWeeks.length === 0) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <div className="label">Saved weeks</div>
      <div style={{ display: "grid", gap: 8 }}>
        {savedWeeks.map(w => (
          <div key={w.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.anchors || "No anchors"}</div>
              <div style={{ fontSize: 11, color: C.text3 }}>{w.date} · ~${w.weekTotal?.toFixed(0) || "—"}</div>
            </div>
            <button onClick={() => onLoad(w)}
              style={{ padding: "6px 12px", background: "rgba(139,92,246,0.15)", color: C.purple, border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Load</button>
            <button onClick={() => onDelete(w.id)}
              style={{ padding: "6px 10px", background: "transparent", color: C.text3, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function MealPlannerApp() {
  const [screen, setScreen] = useState("home");
  const [anchors, setAnchors] = useState("");
  const [anchorRecipe, setAnchorRecipe] = useState("");
  const [avoidIngredients, setAvoidIngredients] = useState("");
  const [budget, setBudget] = useState("$50–55");
  const [servings, setServings] = useState("3");
  const [macros, setMacros] = useState({ protein: 25, carbs: 50, fat: 25 });
  const [meals, setMeals] = useState([]);
  const [groceryList, setGroceryList] = useState([]);
  const [weekTotal, setWeekTotal] = useState(null);
  const [tips, setTips] = useState([]);
  const [prepSchedule, setPrepSchedule] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState("meals");
  const [regenLoading, setRegenLoading] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [savedWeeks, setSavedWeeks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mp_saved_weeks") || "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    const after = () => setIsPrinting(false);
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  const saveCurrentWeek = useCallback(() => {
    const entry = {
      id: Date.now(),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      anchors: anchors || "No anchor ingredients",
      weekTotal, meals, groceryList, tips, prepSchedule,
    };
    const updated = [entry, ...savedWeeks].slice(0, 8);
    setSavedWeeks(updated);
    localStorage.setItem("mp_saved_weeks", JSON.stringify(updated));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }, [meals, groceryList, weekTotal, tips, prepSchedule, anchors, savedWeeks]);

  const loadSavedWeek = (entry) => {
    setMeals(entry.meals || []);
    setGroceryList(entry.groceryList || []);
    setWeekTotal(entry.weekTotal || null);
    setTips(entry.tips || []);
    setPrepSchedule(entry.prepSchedule || []);
    setScreen("plan");
    setActiveTab("meals");
    setExpanded(null);
  };

  const deleteSavedWeek = (id) => {
    const updated = savedWeeks.filter(w => w.id !== id);
    setSavedWeeks(updated);
    localStorage.setItem("mp_saved_weeks", JSON.stringify(updated));
  };

  const handleDownloadPDF = () => { setIsPrinting(true); setTimeout(() => window.print(), 120); };

  const LOADING_MSGS = [
    "Checking what's in season in California…",
    "Stretching your budget across 7 nights…",
    "Finding the best ingredient overlaps…",
    "Building your grocery list…",
    "Almost done — finalizing the plan…",
  ];

  const generate = useCallback(async () => {
    setError("");
    setScreen("loading");
    let msgIdx = 0;
    setLoadingMsg(LOADING_MSGS[0]);
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, LOADING_MSGS.length - 1);
      setLoadingMsg(LOADING_MSGS[msgIdx]);
    }, 1800);

    const prompt = [
      anchors && `Key ingredients to incorporate: ${anchors}.`,
      anchorRecipe && `Must include this specific recipe as one of the 7 meals: ${anchorRecipe}.`,
      avoidIngredients && `NEVER use these ingredients: ${avoidIngredients}.`,
      `Macro targets: ${macros.protein}% protein, ${macros.carbs}% carbohydrates, ${macros.fat}% fat.`,
      `Budget: ${budget} for ${servings} people.`,
      "California. Prefer in-season produce.",
      "Generate a full 7-day dinner meal plan.",
    ].filter(Boolean).join(" ");

    try {
      const raw = await callClaude([{ role: "user", content: prompt }], SYSTEM);
      const parsed = JSON.parse(raw);
      clearInterval(interval);
      setMeals(parsed.meals || []);
      setGroceryList(parsed.groceryList || []);
      setWeekTotal(parsed.weekTotal || null);
      setTips(parsed.tips || []);
      setPrepSchedule(parsed.prepSchedule || []);
      setScreen("plan");
      setExpanded(null);
      setActiveTab("meals");
    } catch (e) {
      clearInterval(interval);
      setError(e.message || "Something went wrong. Please try again.");
      setScreen("home");
    }
  }, [anchors, anchorRecipe, avoidIngredients, budget, servings, macros]);

  const regenMeal = useCallback(async (index) => {
    setRegenLoading(index);
    const meal = meals[index];
    const otherMeals = meals.filter((_, i) => i !== index).map(m => m.name).join(", ");
    const prompt = [
      `Replace the ${meal.day} meal (currently "${meal.name}") with a completely different dinner.`,
      `Other meals this week: ${otherMeals}. Reuse their ingredients where possible.`,
      anchors && `Preferred ingredients: ${anchors}.`,
      avoidIngredients && `NEVER use: ${avoidIngredients}.`,
      `Budget: under $${(weekTotal / 7 * 1.2).toFixed(0)}.`,
      `Return ONLY the single meal JSON object for ${meal.day}, no wrapper array.`,
    ].filter(Boolean).join(" ");
    try {
      const raw = await callClaude([{ role: "user", content: prompt }], SYSTEM);
      const parsed = JSON.parse(raw);
      setMeals(prev => prev.map((m, i) => i === index ? { ...parsed, day: meal.day } : m));
    } catch { /* keep existing */ }
    setRegenLoading(null);
  }, [meals, anchors, avoidIngredients, weekTotal]);

  // ── Home ──────────────────────────────────────────────────────────────
  if (screen === "home") return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{GLOBAL_CSS}</style>

      {/* Background glow orbs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-20%", left: "10%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", top: "10%", right: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", padding: "0 20px 80px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", padding: "72px 0 48px" }}>
          <div className="fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 100, padding: "5px 14px", marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.purple, display: "inline-block", boxShadow: `0 0 6px ${C.purple}` }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.purple }}>AI Meal Planner · California</span>
          </div>

          <h1 className="fade-up" style={{ fontSize: "clamp(38px, 9vw, 58px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.03em", marginBottom: 18, animationDelay: "0.08s" }}>
            Seven nights,<br />
            <span className="grad-text">zero stress.</span>
          </h1>

          <p className="fade-up" style={{ fontSize: 15, color: C.text2, lineHeight: 1.7, maxWidth: 360, margin: "0 auto", animationDelay: "0.16s" }}>
            Tell us what's in your fridge or what you're craving. We'll plan the whole week, minimize waste, and build your grocery list.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#fca5a5" }}>{error}</div>
        )}

        {/* Form card */}
        <div className="fade-up glass" style={{ borderRadius: 18, padding: "28px 24px", marginBottom: 16, animationDelay: "0.22s" }}>

          {/* Ingredients */}
          <div style={{ marginBottom: 18 }}>
            <label className="label">Key ingredients to use</label>
            <input className="field" value={anchors} onChange={e => setAnchors(e.target.value)} placeholder="chicken thighs, carrots, garlic…" />
            <div style={{ fontSize: 11, color: C.text3, marginTop: 5 }}>Appear in 2–3 meals across the week</div>
          </div>

          {/* Avoid */}
          <div style={{ marginBottom: 18 }}>
            <label className="label">Avoid <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.text3 }}>(allergens / preferences)</span></label>
            <input className="field" value={avoidIngredients} onChange={e => setAvoidIngredients(e.target.value)} placeholder="nuts, dairy, shellfish, pork…" />
          </div>

          {/* Anchor recipe */}
          <div style={{ marginBottom: 18 }}>
            <label className="label">Must-have recipe <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.text3 }}>(optional)</span></label>
            <textarea className="field" value={anchorRecipe} onChange={e => setAnchorRecipe(e.target.value)} placeholder="e.g. chicken stir-fry with broccoli…" rows={2} style={{ resize: "none" }} />
          </div>

          {/* Budget + Servings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div>
              <label className="label">Weekly budget</label>
              <select className="field" value={budget} onChange={e => setBudget(e.target.value)} style={{ appearance: "none" }}>
                <option>$40–45</option>
                <option>$50–55</option>
                <option>$60–65</option>
                <option>$70–80</option>
              </select>
            </div>
            <div>
              <label className="label">People</label>
              <select className="field" value={servings} onChange={e => setServings(e.target.value)} style={{ appearance: "none" }}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>)}
              </select>
            </div>
          </div>

          {/* Macros */}
          <MacroSliders macros={macros} onChange={setMacros} />

          {/* CTA */}
          <button className="grad-btn" onClick={generate} style={{ width: "100%", padding: "15px", borderRadius: 12, fontSize: 15, letterSpacing: "0.01em" }}>
            Generate my week →
          </button>
        </div>

        {/* Examples */}
        <div className="fade-up" style={{ animationDelay: "0.3s" }}>
          <div style={{ fontSize: 11, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center" }}>Try an example</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {[
              { label: "🥩 Beef & potatoes", anchors: "ground beef, potatoes, onions", avoid: "", recipe: "" },
              { label: "🍗 Chicken & rice", anchors: "chicken thighs, rice, garlic", avoid: "", recipe: "" },
              { label: "🌱 Mostly meatless", anchors: "lentils, chickpeas, seasonal veg", avoid: "meat, chicken, beef, pork", recipe: "" },
              { label: "🍝 Pasta anchor", anchors: "pasta, ground beef, carrots", avoid: "", recipe: "spaghetti bolognese" },
            ].map(ex => (
              <button key={ex.label} className="chip-btn" onClick={() => { setAnchors(ex.anchors); setAnchorRecipe(ex.recipe); setAvoidIngredients(ex.avoid); }}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <SavedWeeksList savedWeeks={savedWeeks} onLoad={loadSavedWeek} onDelete={deleteSavedWeek} />
      </div>
    </div>
  );

  // ── Loading ──────────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{GLOBAL_CSS}</style>

      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "20%", left: "20%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "20%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440, textAlign: "center" }}>
        {/* Spinner */}
        <div style={{ width: 56, height: 56, margin: "0 auto 28px", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${C.border}` }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: C.purple, borderRightColor: C.blue, animation: "spin 0.9s linear infinite" }} />
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Planning your <span className="grad-text">week…</span>
        </div>
        <div style={{ fontSize: 13, color: C.text2, animation: "pulse 1.8s ease infinite", maxWidth: 260, margin: "0 auto 36px", lineHeight: 1.6 }}>{loadingMsg}</div>

        <div>{DAYS.map(d => <SkeletonCard key={d} />)}</div>
      </div>
    </div>
  );

  // ── Plan ─────────────────────────────────────────────────────────────
  const totalCost = meals.reduce((a, m) => a + (m.cost || 0), 0);
  const displayTotal = weekTotal?.toFixed(0) || totalCost.toFixed(0);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{GLOBAL_CSS}</style>

      {/* Sticky header */}
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,8,15,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px" }}>
          {/* Top row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 10px" }}>
            <div>
              <div style={{ fontSize: 10, color: C.text3, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>This week's plan</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
                7 dinners · <span className="grad-text">~${displayTotal}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveCurrentWeek} style={{ padding: "7px 13px", background: justSaved ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.05)", color: justSaved ? "#4ade80" : C.text2, border: `1px solid ${justSaved ? "rgba(74,222,128,0.3)" : C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                {justSaved ? "✓ Saved" : "💾 Save"}
              </button>
              <button onClick={handleDownloadPDF} style={{ padding: "7px 13px", background: "rgba(255,255,255,0.05)", color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                📄 PDF
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0 }}>
            {[["meals","🍽 Meals"], ["groceries","🛒 Groceries"], ["tips","💡 Tips"]].map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, background: "transparent", border: "none",
                color: activeTab === id ? C.text : C.text3,
                borderBottom: activeTab === id ? `2px solid ${C.purple}` : "2px solid transparent",
                transition: "all 0.18s", cursor: "pointer", marginBottom: -1,
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 20px 100px" }}>

        {/* Meals */}
        <div className={isPrinting ? "print-section" : ""} style={{ display: activeTab === "meals" || isPrinting ? "block" : "none" }}>
          {isPrinting && <div style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 16 }}>Meals</div>}
          <div className={!isPrinting ? "fade-in" : ""}>
            {meals.map((meal, i) => (
              <MealCard key={`${meal.day}-${meal.name}`} meal={meal} index={i} expanded={expanded}
                onToggle={() => setExpanded(expanded === i ? null : i)}
                onRegenerate={regenMeal} regenLoading={regenLoading} forceExpand={isPrinting} />
            ))}
          </div>
        </div>

        {/* Groceries */}
        <div className={isPrinting ? "print-section" : ""} style={{ display: activeTab === "groceries" || isPrinting ? "block" : "none" }}>
          {isPrinting && <div style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 16 }}>Grocery List</div>}
          <div className={!isPrinting ? "fade-in" : ""}>
            <GroceryList groceryList={groceryList} weekTotal={weekTotal} />
          </div>
        </div>

        {/* Tips */}
        <div className={isPrinting ? "print-section" : ""} style={{ display: activeTab === "tips" || isPrinting ? "block" : "none" }}>
          {isPrinting && <div style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 16 }}>Meal Prep Tips</div>}
          <div className={!isPrinting ? "fade-in" : ""}>
            <TipsTab tips={tips} prepSchedule={prepSchedule} />
          </div>
        </div>
      </div>

      {/* FAB */}
      <div className="no-print" style={{ position: "fixed", bottom: 24, right: 20 }}>
        <button className="grad-btn" onClick={() => setScreen("home")} style={{ borderRadius: 100, padding: "13px 22px", fontSize: 13, boxShadow: C.glow }}>
          + New plan
        </button>
      </div>
    </div>
  );
}
