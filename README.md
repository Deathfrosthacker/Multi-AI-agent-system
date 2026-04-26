# AgentFlow — Multi-Agent AI System

A production-ready Multi-Agent AI orchestration platform with an interactive dashboard and real Python backends using CrewAI + LangGraph.

## Deploy Frontend (Free)

The frontend is a fully functional simulation dashboard. No backend needed.

### Vercel (Recommended)
1. Push these 4 files to GitHub repo `agentflow-ai`
2. Go to [vercel.com](https://vercel.com) → Import repo
3. Framework: **Other** → Deploy
4. Auto-deploys on every push

### GitHub Pages
1. Repo → **Settings → Pages** → Source: `main` → `/ (root)`
2. Live at `https://yourname.github.io/agentflow-ai`

## Run Real Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with OPENAI_API_KEY
python crewai_system.py
python langgraph_system.py
python main.py  # API server