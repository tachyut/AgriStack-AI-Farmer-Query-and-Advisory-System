<<<<<<< HEAD
# AgriStack

- `frontend/` — Vite + React app (farmer chat + officer dashboard). Deploy to Vercel/Netlify.
- `backend/` — FastAPI RAG service (`/query`, `/triage/queue`, `/stats`, `/kb`). Deploy to Render/Railway/Fly.io.

See the deployment walkthrough for step-by-step instructions.

## Local development

Backend:
```
cd backend
pip install -r requirements.txt --break-system-packages
export ANTHROPIC_API_KEY=sk-...
uvicorn main:app --reload --port 8000
```

Frontend:
```
cd frontend
npm install
npm run dev
```
=======
# AgriStack-AI-Farmer-Query-and-Advisory-System
>>>>>>> 30bbe56651f357f7b77374fa1a1a5449ffdfdd05
