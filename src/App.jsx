import { useState, useCallback, useEffect } from "react";

// ── Anthropic API call ─────────────────────────────────────────────────────
async function callClaude(messages, system) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8096,
      system,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || data.error || `API error ${res.status}`);
  }
  const text = data.content?.find(b => b.type === "text")?.text || "";
  return text.replace(/```json|```/g, "").trim();
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

// ── Skeleton card ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background:"#fff", border:"1px solid #e8e0d8", borderRadius:16, padding:"20px", marginBottom:10, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:72, height:36, borderRadius:8, background:"#e8e4de", flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <div style={{ width:"60%", height:14, borderRadius:6, background:"#ede9e3", marginBottom:8 }} />
        <div style={{ width:"80%", height:10, borderRadius:6, background:"#f2efe9" }} />
      </div>
      <div style={{ width:44, height:22, borderRadius:12, background:"#ede9e3" }} />
    </div>
  );
}

// ── Meal card ──────────────────────────────────────────────────────────────
function MealCard({ meal, index, expanded, onToggle, onRegenerate, regenLoading, forceExpand }) {
  const isOpen = expanded === index || forceExpand;
  const tc = meal.tagColor || "#e8a838";
  return (
    <div style={{ background:"#fff", border:`1.5px solid ${isOpen ? tc : "#e8e0d8"}`, borderRadius:16, marginBottom:10, overflow:"hidden", boxShadow: isOpen ? `0 6px 24px rgba(0,0,0,0.09), inset 3px 0 0 ${tc}` : "0 2px 6px rgba(0,0,0,0.04)", transition:"border-color 0.2s, box-shadow 0.2s" }}>
      <div onClick={onToggle} style={{ display:"flex", alignItems:"center", padding:"16px 18px", gap:12, cursor:"pointer" }}>
        <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:11, fontWeight:700, color:"#fff", background:"#1c1917", borderRadius:7, padding:"5px 10px", minWidth:72, textAlign:"center", letterSpacing:"0.06em", textTransform:"uppercase", flexShrink:0 }}>{meal.day}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:16, fontWeight:600, color:"#1c1917", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{meal.name}</div>
          <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#9a8f85", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{meal.description}</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, flexShrink:0 }}>
          <div style={{ background:tc+"18", color:tc, border:`1px solid ${tc}44`, borderRadius:20, padding:"2px 9px", fontSize:10, fontFamily:"'DM Sans', sans-serif", fontWeight:600, letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{meal.tag}</div>
          <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:17, fontWeight:700, color:"#c97d30" }}>${meal.cost?.toFixed(2)}</div>
        </div>
        <div className="no-print" style={{ color:"#c2b8ae", fontSize:16, transform:isOpen ? "rotate(180deg)" : "none", transition:"transform 0.22s", marginLeft:4, flexShrink:0 }}>▾</div>
      </div>
      {isOpen && (
        <div style={{ borderTop:`1px solid ${tc}28`, background:"#faf8f5" }}>
          <div style={{ display:"flex", borderBottom:"1px solid #ede9e3" }}>
            <div style={{ flex:1, padding:"10px 18px", fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#7a6f67", borderRight:"1px solid #ede9e3" }}>⏱ Prep <strong style={{ color:"#1c1917" }}>{meal.prepTime}</strong></div>
            <div style={{ flex:1, padding:"10px 18px", fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#7a6f67" }}>🔥 Cook <strong style={{ color:"#1c1917" }}>{meal.cookTime}</strong></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
            <div style={{ padding:"16px 18px", borderRight:"1px solid #ede9e3" }}>
              <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:13, fontWeight:600, color:"#1c1917", marginBottom:8 }}>Ingredients</div>
              {(meal.ingredients||[]).map((ing,j) => (
                <div key={j} style={{ display:"flex", gap:6, fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#4a403a", padding:"2px 0", lineHeight:1.5 }}>
                  <span style={{ color:tc, flexShrink:0 }}>·</span>{ing}
                </div>
              ))}
            </div>
            <div style={{ padding:"16px 18px" }}>
              <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:13, fontWeight:600, color:"#1c1917", marginBottom:8 }}>Instructions</div>
              {(meal.instructions||[]).map((step,j) => (
                <div key={j} style={{ display:"flex", gap:8, fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#4a403a", padding:"3px 0", lineHeight:1.5 }}>
                  <span style={{ fontWeight:700, color:tc, flexShrink:0, minWidth:14 }}>{j+1}.</span>{step}
                </div>
              ))}
            </div>
          </div>
          {!forceExpand && (
            <div className="no-print" style={{ padding:"12px 18px", borderTop:"1px solid #ede9e3", display:"flex", justifyContent:"flex-end" }}>
              <button onClick={(e) => { e.stopPropagation(); onRegenerate(index); }} disabled={regenLoading === index}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:regenLoading===index?"#ede9e3":"#1c1917", color:regenLoading===index?"#9a8f85":"#fff", border:"none", borderRadius:8, fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, cursor:regenLoading===index?"not-allowed":"pointer" }}>
                {regenLoading===index ? "↻ Swapping…" : "↻ Swap this meal"}
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
      <div style={{ background:"#1c1917", borderRadius:14, padding:"20px 22px", marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#9a8f85", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:4 }}>Estimated Total</div>
          <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:28, fontWeight:700, color:"#e8a560" }}>~${weekTotal?.toFixed(2)}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#9a8f85", marginBottom:4 }}>Per meal</div>
          <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:20, color:"#e8a560" }}>~${weekTotal ? (weekTotal/7).toFixed(2) : "—"}</div>
          <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#6a5a50" }}>for 3 people</div>
        </div>
      </div>
      {(groceryList||[]).map((cat,ci) => (
        <div key={ci} style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <span style={{ fontSize:16 }}>{cat.icon}</span>
            <span style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:14, fontWeight:600, color:"#1c1917" }}>{cat.category}</span>
            <div style={{ flex:1, height:1, background:(cat.color||"#e8a838")+"33" }} />
          </div>
          <div style={{ background:"#fff", border:"1px solid #e8e0d8", borderRadius:12, overflow:"hidden" }}>
            {(cat.items||[]).map((item,ii) => {
              const key = `${ci}-${ii}`;
              const done = checked[key];
              return (
                <div key={ii} onClick={() => toggle(key)} style={{ display:"flex", alignItems:"center", padding:"10px 14px", gap:10, borderBottom:ii<cat.items.length-1?"1px solid #f2ede8":"none", background:ii%2===0?"#fff":"#fdfaf7", cursor:"pointer", opacity:done?0.45:1, transition:"opacity 0.2s" }}>
                  <div style={{ width:16, height:16, borderRadius:4, flexShrink:0, border:`1.5px solid ${done?cat.color||"#e8a838":"#c8bfb8"}`, background:done?(cat.color||"#e8a838"):"transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
                    {done && <span style={{ color:"#fff", fontSize:10, lineHeight:1 }}>✓</span>}
                  </div>
                  <div style={{ flex:1, fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#1c1917", textDecoration:done?"line-through":"none" }}>{item.name}</div>
                  <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#9a8f85" }}>{item.qty}</div>
                  <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:13, fontWeight:600, color:"#1c1917", minWidth:44, textAlign:"right" }}>{item.est}</div>
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
      <div style={{ display:"grid", gap:12, marginBottom:24 }}>
        {tips.map((tip,i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid #e8e0d8", borderRadius:14, padding:"18px 20px", display:"flex", gap:16, alignItems:"flex-start", boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:26, flexShrink:0, lineHeight:1 }}>{tip.icon}</div>
            <div>
              <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:15, fontWeight:600, color:"#1c1917", marginBottom:5 }}>{tip.title}</div>
              <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#5a4a3a", lineHeight:1.6 }}>{tip.body}</div>
            </div>
          </div>
        ))}
      </div>
      {prepSchedule.length > 0 && (
        <div style={{ background:"#fff", border:"1px solid #e8e0d8", borderRadius:14, padding:"20px 22px" }}>
          <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:16, fontWeight:600, color:"#1c1917", marginBottom:16 }}>Suggested Prep Schedule</div>
          <div style={{ display:"grid", gap:12 }}>
            {prepSchedule.map((s,i) => (
              <div key={i} style={{ display:"flex", gap:14 }}>
                <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#c97d30", minWidth:130, flexShrink:0, paddingTop:1 }}>{s.when}</div>
                <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#4a3a2a", lineHeight:1.5 }}>{s.task}</div>
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
    { key:"protein", label:"Protein", color:"#e85c5c" },
    { key:"carbs",   label:"Carbs",   color:"#e8a838" },
    { key:"fat",     label:"Fat",     color:"#4caf7d" },
  ];
  const total = macros.protein + macros.carbs + macros.fat;

  const update = (key, raw) => {
    const val = Math.min(100, Math.max(0, parseInt(raw) || 0));
    const others = ["protein","carbs","fat"].filter(k => k !== key);
    const remaining = 100 - val;
    const otherSum = macros[others[0]] + macros[others[1]];
    let a, b;
    if (otherSum === 0) {
      a = Math.floor(remaining / 2);
      b = remaining - a;
    } else {
      a = Math.round(remaining * macros[others[0]] / otherSum);
      b = remaining - a;
    }
    onChange({ ...macros, [key]: val, [others[0]]: a, [others[1]]: b });
  };

  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <label style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#4a403a", letterSpacing:"0.04em", textTransform:"uppercase" }}>Macro targets</label>
        <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color: total===100?"#4caf7d":"#e85c5c" }}>Total: {total}%</span>
      </div>
      <div style={{ background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:12, padding:"14px 16px", display:"grid", gap:12 }}>
        {items.map(({ key, label, color }) => (
          <div key={key} style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#4a403a", width:52, flexShrink:0 }}>{label}</div>
            <input type="range" min={0} max={100} value={macros[key]}
              onChange={e => update(key, e.target.value)}
              style={{ flex:1, accentColor:color, cursor:"pointer" }} />
            <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:14, fontWeight:600, color, width:36, textAlign:"right", flexShrink:0 }}>{macros[key]}%</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, color:"#9a8f85", marginTop:5 }}>Adjusting one slider auto-balances the others to 100%</div>
    </div>
  );
}

// ── Saved weeks list ───────────────────────────────────────────────────────
function SavedWeeksList({ savedWeeks, onLoad, onDelete }) {
  if (savedWeeks.length === 0) return null;
  return (
    <div style={{ marginTop:32 }}>
      <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#4a403a", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Saved weeks</div>
      <div style={{ display:"grid", gap:8 }}>
        {savedWeeks.map(w => (
          <div key={w.id} style={{ background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:12, padding:"12px 14px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:14, color:"#1c1917", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{w.anchors || "No anchors"}</div>
              <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#9a8f85" }}>{w.date} · ~${w.weekTotal?.toFixed(0) || "—"}</div>
            </div>
            <button onClick={() => onLoad(w)} style={{ padding:"6px 12px", background:"#1c1917", color:"#f7f4ef", border:"none", borderRadius:8, fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0 }}>Load</button>
            <button onClick={() => onDelete(w.id)} style={{ padding:"6px 10px", background:"transparent", color:"#c2b8ae", border:"1px solid #e8e0d8", borderRadius:8, fontFamily:"'DM Sans', sans-serif", fontSize:12, cursor:"pointer", flexShrink:0 }}>✕</button>
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
  const [macros, setMacros] = useState({ protein:25, carbs:50, fat:25 });
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
      date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
      anchors: anchors || "No anchor ingredients",
      weekTotal,
      meals,
      groceryList,
      tips,
      prepSchedule,
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

  const handleDownloadPDF = () => {
    setIsPrinting(true);
    setTimeout(() => window.print(), 120);
  };

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
      "California, May 2026. Prefer in-season produce.",
      "Generate a full 7-day dinner meal plan.",
    ].filter(Boolean).join(" ");

    try {
      const raw = await callClaude([{ role:"user", content:prompt }], SYSTEM);
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
    const otherMeals = meals.filter((_,i) => i !== index).map(m => m.name).join(", ");
    const prompt = [
      `Replace the ${meal.day} meal (currently "${meal.name}") with a completely different dinner.`,
      `Other meals this week: ${otherMeals}. Reuse their ingredients where possible.`,
      anchors && `Preferred ingredients: ${anchors}.`,
      avoidIngredients && `NEVER use these ingredients: ${avoidIngredients}.`,
      `Budget: keep this meal under $${(weekTotal / 7 * 1.2).toFixed(0)}.`,
      `Return ONLY the single meal JSON object for ${meal.day}, no wrapper array.`,
    ].filter(Boolean).join(" ");
    try {
      const raw = await callClaude([{ role:"user", content:prompt }], SYSTEM);
      const parsed = JSON.parse(raw);
      setMeals(prev => prev.map((m,i) => i === index ? { ...parsed, day: meal.day } : m));
    } catch { /* silently keep existing meal */ }
    setRegenLoading(null);
  }, [meals, anchors, avoidIngredients, weekTotal]);

  // ── Home screen ────────────────────────────────────────────────────────
  if (screen === "home") return (
    <div style={{ minHeight:"100vh", background:"#f7f4ef", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        input, textarea, select { outline:none; }
        button { cursor:pointer; }
        .fade-up { animation: fadeUp 0.5s ease both; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .gen-btn:hover:not(:disabled) { background:#2d2925 !important; transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,0,0,0.2) !important; }
        .gen-btn:disabled { opacity:0.55; cursor:not-allowed; }
        .field-input:focus { border-color:#c97d30 !important; box-shadow:0 0 0 3px rgba(201,125,48,0.12) !important; }
      `}</style>

      <div style={{ background:"#1c1917", padding:"52px 24px 44px", textAlign:"center" }}>
        <div style={{ maxWidth:420, margin:"0 auto" }}>
          <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#c97d30", letterSpacing:"0.22em", textTransform:"uppercase", marginBottom:16 }}>AI Meal Planner · California</div>
          <h1 style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:"clamp(36px, 9vw, 56px)", fontWeight:400, fontStyle:"italic", color:"#f7f4ef", lineHeight:1.1, marginBottom:14 }}>
            Seven nights,<br/>zero stress.
          </h1>
          <p style={{ fontSize:14, color:"#7a6f67", lineHeight:1.7 }}>
            Tell us what's in your fridge or what you're craving.<br />
            We'll plan the whole week, minimize waste, and build your grocery list.
          </p>
        </div>
      </div>

      <div style={{ maxWidth:460, margin:"0 auto", padding:"32px 20px 60px" }}>
        {error && (
          <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", marginBottom:20, fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#b91c1c" }}>{error}</div>
        )}

        {/* Key ingredients */}
        <div style={{ marginBottom:18 }}>
          <label style={{ display:"block", fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#4a403a", marginBottom:7, letterSpacing:"0.04em", textTransform:"uppercase" }}>Key ingredients to use</label>
          <input className="field-input" value={anchors} onChange={e => setAnchors(e.target.value)} placeholder="e.g. chicken thighs, carrots, garlic…"
            style={{ width:"100%", padding:"13px 16px", background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:12, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:"#1c1917", transition:"border-color 0.15s, box-shadow 0.15s" }} />
          <div style={{ fontSize:11, color:"#9a8f85", marginTop:5 }}>These will appear in 2–3 meals across the week</div>
        </div>

        {/* Avoid ingredients */}
        <div style={{ marginBottom:18 }}>
          <label style={{ display:"block", fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#4a403a", marginBottom:7, letterSpacing:"0.04em", textTransform:"uppercase" }}>
            Avoid ingredients <span style={{ fontWeight:400, color:"#9a8f85", textTransform:"none", letterSpacing:0 }}>(allergens / preferences)</span>
          </label>
          <input className="field-input" value={avoidIngredients} onChange={e => setAvoidIngredients(e.target.value)} placeholder="e.g. nuts, dairy, shellfish, pork…"
            style={{ width:"100%", padding:"13px 16px", background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:12, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:"#1c1917", transition:"border-color 0.15s, box-shadow 0.15s" }} />
        </div>

        {/* Anchor recipe */}
        <div style={{ marginBottom:18 }}>
          <label style={{ display:"block", fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#4a403a", marginBottom:7, letterSpacing:"0.04em", textTransform:"uppercase" }}>
            Must-have recipe <span style={{ fontWeight:400, color:"#9a8f85", textTransform:"none", letterSpacing:0 }}>(optional)</span>
          </label>
          <textarea className="field-input" value={anchorRecipe} onChange={e => setAnchorRecipe(e.target.value)} placeholder="e.g. chicken stir-fry with broccoli…" rows={2}
            style={{ width:"100%", padding:"13px 16px", background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:12, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:"#1c1917", resize:"none", transition:"border-color 0.15s, box-shadow 0.15s" }} />
        </div>

        {/* Budget + Servings */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:18 }}>
          <div>
            <label style={{ display:"block", fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#4a403a", marginBottom:7, letterSpacing:"0.04em", textTransform:"uppercase" }}>Weekly budget</label>
            <select value={budget} onChange={e => setBudget(e.target.value)}
              style={{ width:"100%", padding:"13px 14px", background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:12, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:"#1c1917", appearance:"none" }}>
              <option>$40–45</option>
              <option>$50–55</option>
              <option>$60–65</option>
              <option>$70–80</option>
            </select>
          </div>
          <div>
            <label style={{ display:"block", fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, color:"#4a403a", marginBottom:7, letterSpacing:"0.04em", textTransform:"uppercase" }}>People</label>
            <select value={servings} onChange={e => setServings(e.target.value)}
              style={{ width:"100%", padding:"13px 14px", background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:12, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:"#1c1917", appearance:"none" }}>
              <option value="1">1 person</option>
              <option value="2">2 people</option>
              <option value="3">3 people</option>
              <option value="4">4 people</option>
              <option value="5">5 people</option>
            </select>
          </div>
        </div>

        {/* Macro sliders */}
        <MacroSliders macros={macros} onChange={setMacros} />

        {/* Generate button */}
        <button className="gen-btn" onClick={generate}
          style={{ width:"100%", padding:"16px", background:"#1c1917", color:"#f7f4ef", border:"none", borderRadius:14, fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:600, letterSpacing:"0.02em", transition:"all 0.2s", boxShadow:"0 4px 14px rgba(0,0,0,0.15)" }}>
          Generate my week →
        </button>

        {/* Example chips */}
        <div style={{ marginTop:24 }}>
          <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#9a8f85", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Try an example</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {[
              { label:"🥩 Beef & potatoes week", anchors:"ground beef, potatoes, onions", avoid:"", recipe:"" },
              { label:"🍗 Chicken & rice focus", anchors:"chicken thighs, rice, garlic", avoid:"", recipe:"" },
              { label:"🌱 Mostly meatless", anchors:"lentils, chickpeas, seasonal veg", avoid:"meat, chicken, beef, pork", recipe:"" },
              { label:"🍝 Pasta night anchor", anchors:"pasta, ground beef, carrots", avoid:"", recipe:"spaghetti bolognese" },
            ].map(ex => (
              <button key={ex.label} onClick={() => { setAnchors(ex.anchors); setAnchorRecipe(ex.recipe); setAvoidIngredients(ex.avoid); }}
                style={{ padding:"7px 12px", background:"#fff", border:"1.5px solid #e8e0d8", borderRadius:20, fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#4a403a", transition:"border-color 0.15s" }}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <SavedWeeksList savedWeeks={savedWeeks} onLoad={loadSavedWeek} onDelete={deleteSavedWeek} />
      </div>
    </div>
  );

  // ── Loading screen ─────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div style={{ minHeight:"100vh", background:"#f7f4ef", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing:border-box; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
      `}</style>
      <div style={{ width:48, height:48, border:"3px solid #e8e0d8", borderTop:"3px solid #c97d30", borderRadius:"50%", animation:"spin 0.9s linear infinite", marginBottom:28 }} />
      <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:22, fontStyle:"italic", color:"#1c1917", marginBottom:10, textAlign:"center" }}>Planning your week…</div>
      <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#9a8f85", textAlign:"center", animation:"pulse 1.8s ease infinite", maxWidth:280, lineHeight:1.6 }}>{loadingMsg}</div>
      <div style={{ width:"100%", maxWidth:440, marginTop:36 }}>
        {DAYS.map(d => <SkeletonCard key={d} />)}
      </div>
    </div>
  );

  // ── Plan screen ────────────────────────────────────────────────────────
  const totalCost = meals.reduce((a,m) => a + (m.cost||0), 0);

  return (
    <div style={{ minHeight:"100vh", background:"#f7f4ef", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .tab-btn { cursor:pointer; border:none; transition:all 0.18s; }
        .tab-btn:hover { opacity:0.8; }
        .back-btn:hover { background:#2d2925 !important; }
        .fade-in { animation:fadeIn 0.35s ease both; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @media print {
          .no-print { display:none !important; }
          .print-section { display:block !important; page-break-before:always; }
          .print-section:first-of-type { page-break-before:avoid; }
          body { background:white !important; }
          @page { margin:18mm; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{ background:"#1c1917", padding:"20px 20px 0" }}>
        <div style={{ maxWidth:520, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#7a6f67", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:3 }}>This week's plan</div>
              <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:22, fontStyle:"italic", color:"#f7f4ef" }}>7 dinners ready</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {/* Save button */}
              <button onClick={saveCurrentWeek}
                style={{ padding:"8px 14px", background:justSaved?"#4caf7d":"transparent", color:justSaved?"#fff":"#9a8f85", border:"1px solid", borderColor:justSaved?"#4caf7d":"#3a3028", borderRadius:8, fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.2s" }}>
                {justSaved ? "✓ Saved" : "💾 Save"}
              </button>
              {/* Download PDF */}
              <button onClick={handleDownloadPDF}
                style={{ padding:"8px 14px", background:"transparent", color:"#9a8f85", border:"1px solid #3a3028", borderRadius:8, fontFamily:"'DM Sans', sans-serif", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                📄 PDF
              </button>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:24, color:"#e8a560" }}>~${weekTotal?.toFixed(0) || totalCost.toFixed(0)}</div>
                <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#7a6f67" }}>est. total</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:0 }}>
            {[["meals","🍽 Meals"],["groceries","🛒 Grocery List"],["tips","💡 Tips"]].map(([id, label]) => (
              <button key={id} className="tab-btn" onClick={() => setActiveTab(id)}
                style={{ flex:1, padding:"11px 0", fontFamily:"'DM Sans', sans-serif", fontSize:13, fontWeight:600, background:"transparent", color:activeTab===id?"#e8a560":"#7a6f67", borderBottom:activeTab===id?"2px solid #c97d30":"2px solid transparent", marginBottom:-1 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Print header (only visible when printing) */}
      <div style={{ display:"none" }} className="print-section">
        <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:28, fontWeight:700, color:"#1c1917", marginBottom:4 }}>Weekly Meal Plan</div>
        <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#6a5a50", marginBottom:24 }}>
          {anchors && `Anchors: ${anchors} · `}Budget: {budget} · {servings} people · Est. ~${weekTotal?.toFixed(0) || totalCost.toFixed(0)}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:520, margin:"0 auto", padding:"20px 16px 80px" }}>

        {/* Meals tab */}
        <div className={isPrinting ? "print-section" : ""} style={{ display: activeTab === "meals" || isPrinting ? "block" : "none" }}>
          {isPrinting && <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:20, fontWeight:600, color:"#1c1917", marginBottom:16, paddingTop:8 }}>Meals</div>}
          <div className={!isPrinting ? "fade-in" : ""}>
            {meals.map((meal,i) => (
              <MealCard key={`${meal.day}-${meal.name}`} meal={meal} index={i} expanded={expanded}
                onToggle={() => setExpanded(expanded===i ? null : i)}
                onRegenerate={regenMeal} regenLoading={regenLoading}
                forceExpand={isPrinting} />
            ))}
          </div>
        </div>

        {/* Groceries tab */}
        <div className={isPrinting ? "print-section" : ""} style={{ display: activeTab === "groceries" || isPrinting ? "block" : "none" }}>
          {isPrinting && <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:20, fontWeight:600, color:"#1c1917", marginBottom:16, paddingTop:8 }}>Grocery List</div>}
          <div className={!isPrinting ? "fade-in" : ""}>
            <GroceryList groceryList={groceryList} weekTotal={weekTotal} />
          </div>
        </div>

        {/* Tips tab */}
        <div className={isPrinting ? "print-section" : ""} style={{ display: activeTab === "tips" || isPrinting ? "block" : "none" }}>
          {isPrinting && <div style={{ fontFamily:"'Instrument Serif', Georgia, serif", fontSize:20, fontWeight:600, color:"#1c1917", marginBottom:16, paddingTop:8 }}>Meal Prep Tips</div>}
          <div className={!isPrinting ? "fade-in" : ""}>
            <TipsTab tips={tips} prepSchedule={prepSchedule} />
          </div>
        </div>

      </div>

      {/* FAB */}
      <div className="no-print" style={{ position:"fixed", bottom:24, right:20 }}>
        <button className="back-btn" onClick={() => setScreen("home")}
          style={{ background:"#1c1917", color:"#f7f4ef", border:"none", borderRadius:50, padding:"13px 20px", fontFamily:"'DM Sans', sans-serif", fontSize:13, fontWeight:600, boxShadow:"0 4px 18px rgba(0,0,0,0.22)", transition:"background 0.15s" }}>
          + New plan
        </button>
      </div>
    </div>
  );
}
