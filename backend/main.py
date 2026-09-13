"""
AgriStack — AI Farmer Query & Advisory System
Backend service (FastAPI) implementing the RAG pipeline used by the demo UI.

Architecture
------------
1. /query          -> retrieve top-k knowledge base chunks (TF-IDF here;
                       swap for a vector store like FAISS/Pinecone in prod)
                       -> call Claude with retrieved context -> return answer
                       + a triage decision (auto-resolved vs escalated)
2. /kb             -> CRUD over the knowledge base (topics/crops/schemes)
3. /triage/queue   -> queries flagged for a human extension officer
4. /stats          -> dashboard metrics (volume, category mix, escalation rate)

Run:
    pip install fastapi uvicorn anthropic scikit-learn --break-system-packages
    export ANTHROPIC_API_KEY=sk-...
    uvicorn backend_main:app --reload
"""

import json
import os
import time
import uuid
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import anthropic

DATA_PATH = os.path.join(os.path.dirname(__file__), "knowledge_base.json")
CONFIDENCE_THRESHOLD = 0.18  # below this cosine similarity, escalate to a human officer

app = FastAPI(title="AgriStack Advisory API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

QUERY_LOG: List[dict] = []


def load_kb() -> List[dict]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


KB = load_kb()
_CORPUS = [f"{d['title']} {' '.join(d['keywords'])} {d['body']}" for d in KB]
_VECTORIZER = TfidfVectorizer(stop_words="english")
_MATRIX = _VECTORIZER.fit_transform(_CORPUS)

SYSTEM_PROMPT = """You are an AgriStack extension-officer assistant for Indian farmers.
Answer only using the CONTEXT provided. Keep it under 120 words, in plain, simple
language for a farmer with no technical background. Give concrete, actionable steps
(dose, timing, where to apply). If the context does not clearly cover the question,
say so plainly and note that it needs a visit to the local Krishibhavan / extension
officer."""


class QueryRequest(BaseModel):
    query: str
    farmer_id: Optional[str] = None
    lang: Optional[str] = "en"


class QueryResponse(BaseModel):
    answer: str
    category: str
    confidence: float
    status: str
    sources: List[str]


def retrieve(query: str, top_k: int = 3):
    q_vec = _VECTORIZER.transform([query])
    sims = cosine_similarity(q_vec, _MATRIX)[0]
    ranked = sorted(range(len(sims)), key=lambda i: sims[i], reverse=True)[:top_k]
    return [(KB[i], float(sims[i])) for i in ranked if sims[i] > 0]


@app.post("/query", response_model=QueryResponse)
def handle_query(req: QueryRequest):
    hits = retrieve(req.query)
    top_score = hits[0][1] if hits else 0.0
    category = hits[0][0]["category"] if hits else "Uncategorised"
    escalated = top_score < CONFIDENCE_THRESHOLD

    context = "\n\n".join(f"[{doc['title']}]\n{doc['body']}" for doc, _ in hits) or "No matching entry."

    try:
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"CONTEXT:\n{context}\n\nFARMER QUESTION: {req.query}"}],
        )
        answer = "".join(block.text for block in msg.content if hasattr(block, "text")).strip()
    except Exception as exc:  # pragma: no cover - network/API errors
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}")

    if escalated:
        answer += "\n\nFlagged for review by your local Krishibhavan extension officer."

    entry = {
        "id": str(uuid.uuid4()),
        "farmer_id": req.farmer_id,
        "query": req.query,
        "category": category,
        "confidence": round(top_score * 100, 1),
        "status": "Escalated" if escalated else "Auto-resolved",
        "timestamp": time.time(),
    }
    QUERY_LOG.append(entry)

    return QueryResponse(
        answer=answer,
        category=category,
        confidence=entry["confidence"],
        status=entry["status"],
        sources=[doc["title"] for doc, _ in hits],
    )


@app.get("/triage/queue")
def triage_queue():
    return [e for e in QUERY_LOG if e["status"] == "Escalated"]


@app.get("/stats")
def stats():
    total = len(QUERY_LOG)
    escalated = sum(1 for e in QUERY_LOG if e["status"] == "Escalated")
    by_category: dict = {}
    for e in QUERY_LOG:
        by_category[e["category"]] = by_category.get(e["category"], 0) + 1
    return {
        "total_queries": total,
        "escalated": escalated,
        "auto_resolution_rate": round(((total - escalated) / total) * 100, 1) if total else 0,
        "by_category": by_category,
    }


@app.get("/kb")
def get_kb():
    return KB
