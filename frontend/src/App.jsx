import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// AgriStack — AI Farmer Query & Advisory System (standalone deployable build)
// Talks to your own backend (backend_main.py) instead of calling Claude
// directly from the browser, and uses localStorage for the query log.
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LOG_KEY = "agristack_log";

export default function App() {
  const [tab, setTab] = useState("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Namaste! Ask me about crop disease, pests, fertilizer, irrigation, government schemes, or mandi prices — in your own words." },
  ]);
  const [log, setLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function persistLog(next) {
    setLog(next);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  }

  async function handleSend() {
    const query = input.trim();
    if (!query || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: query }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = await res.json();

      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
      const entry = {
        id: Date.now(),
        query,
        category: data.category,
        confidence: data.confidence,
        status: data.status,
        time: new Date().toLocaleString(),
      };
      persistLog([entry, ...log].slice(0, 200));
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Couldn't reach the advisory backend. Check that the API server is running and VITE_API_URL is set correctly." }]);
    }
    setLoading(false);
  }

  const total = log.length;
  const escalatedCount = log.filter((l) => l.status === "Escalated").length;
  const resolvedPct = total ? Math.round(((total - escalatedCount) / total) * 100) : 0;
  const catCounts = log.reduce((acc, l) => { acc[l.category] = (acc[l.category] || 0) + 1; return acc; }, {});
  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", background: "#F2F1E4", minHeight: "100vh", color: "#20301F" }}>
      <style>{`
        .sans { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .tabbtn { border: none; background: transparent; cursor: pointer; padding: 10px 18px; font-size: 14px; letter-spacing: 0.02em; }
        .tabbtn.active { border-bottom: 2px solid #B5533C; color: #B5533C; font-weight: 600; }
        .card { background: #FBFAF4; border: 1px solid #DEDACB; border-radius: 6px; }
        input:focus { outline: 2px solid #7C9A6E; }
        ::placeholder { color: #8A8570; }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ fontSize: 30, margin: 0 }}>AgriStack</h1>
          <span className="sans" style={{ fontSize: 12, color: "#6B7A5E" }}>AI Farmer Query &amp; Advisory System</span>
        </div>
        <p className="sans" style={{ fontSize: 13.5, color: "#5B6650", marginTop: 2, marginBottom: 20, maxWidth: 560 }}>
          Natural-language farmer support grounded in a curated agricultural knowledge base, with automatic
          triage to extension officers when the system isn't confident.
        </p>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #DEDACB", marginBottom: 18 }} className="sans">
          <button className={`tabbtn ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}>Farmer Chat</button>
          <button className={`tabbtn ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>Officer Dashboard</button>
        </div>

        {tab === "chat" && (
          <div className="card" style={{ display: "flex", flexDirection: "column", height: 480 }}>
            <div ref={scrollRef} className="sans" style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                  <div style={{
                    maxWidth: "78%", padding: "9px 13px", borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
                    background: m.role === "user" ? "#7C9A6E" : "#EFEBDA",
                    color: m.role === "user" ? "#FBFAF4" : "#20301F",
                  }}>{m.text}</div>
                </div>
              ))}
              {loading && <div style={{ fontSize: 13, color: "#8A8570" }}>Checking the knowledge base and drafting an answer…</div>}
            </div>
            <div style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid #DEDACB" }} className="sans">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="e.g. My wheat leaves have yellow stripes, what do I do?"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "1px solid #C9C4AE", fontSize: 14 }}
              />
              <button onClick={handleSend} disabled={loading} style={{
                padding: "10px 18px", borderRadius: 6, border: "none", background: "#B5533C", color: "#FBFAF4",
                fontSize: 14, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
              }}>Ask</button>
            </div>
          </div>
        )}

        {tab === "dashboard" && (
          <div className="sans">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "#6B7A5E" }}>Total queries</div>
                <div style={{ fontSize: 26, fontFamily: "Georgia, serif" }}>{total}</div>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "#6B7A5E" }}>Auto-resolved</div>
                <div style={{ fontSize: 26, fontFamily: "Georgia, serif" }}>{resolvedPct}%</div>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "#6B7A5E" }}>Escalated to officer</div>
                <div style={{ fontSize: 26, fontFamily: "Georgia, serif" }}>{escalatedCount}</div>
              </div>
            </div>

            <div className="card" style={{ padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#6B7A5E", marginBottom: 10 }}>Query volume by category</div>
              {topCats.length === 0 && <div style={{ fontSize: 13, color: "#8A8570" }}>No queries logged yet — try the Farmer Chat tab.</div>}
              {topCats.map(([cat, count]) => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 150, fontSize: 12.5 }}>{cat}</div>
                  <div style={{ flex: 1, background: "#EFEBDA", borderRadius: 4, height: 10 }}>
                    <div style={{ width: `${(count / total) * 100}%`, background: "#7C9A6E", height: 10, borderRadius: 4 }} />
                  </div>
                  <div style={{ width: 20, fontSize: 12.5, textAlign: "right" }}>{count}</div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#EFEBDA", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px" }}>Time</th>
                    <th style={{ padding: "8px 12px" }}>Query</th>
                    <th style={{ padding: "8px 12px" }}>Category</th>
                    <th style={{ padding: "8px 12px" }}>Confidence</th>
                    <th style={{ padding: "8px 12px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {log.slice(0, 15).map((l) => (
                    <tr key={l.id} style={{ borderTop: "1px solid #EAE6D6" }}>
                      <td style={{ padding: "8px 12px", color: "#8A8570", whiteSpace: "nowrap" }}>{l.time}</td>
                      <td style={{ padding: "8px 12px" }}>{l.query}</td>
                      <td style={{ padding: "8px 12px" }}>{l.category}</td>
                      <td style={{ padding: "8px 12px" }}>{l.confidence}%</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 999, fontSize: 11.5,
                          background: l.status === "Escalated" ? "#F1DAD2" : "#DCE8D3",
                          color: l.status === "Escalated" ? "#93402A" : "#3E5C32",
                        }}>{l.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
