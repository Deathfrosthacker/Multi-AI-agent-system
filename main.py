"""FastAPI wrapper exposing the CrewAI crew and LangGraph as HTTP endpoints.

Run:  uvicorn main:app --reload
Docs: http://localhost:8000/docs
"""
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from crewai_system import build_crew
from langgraph_system import build_graph

load_dotenv()

app = FastAPI(title="AgentFlow API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["POST"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    framework: str = Field(pattern="^(crewai|langgraph)$", default="crewai")


class RunResponse(BaseModel):
    framework: str
    output: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/run", response_model=RunResponse)
def run(req: RunRequest) -> RunResponse:
    if req.framework == "crewai":
        result = build_crew(req.topic).kickoff()
        return RunResponse(framework="crewai", output=str(result))

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(503, "OPENAI_API_KEY not configured")

    graph = build_graph()
    final = graph.invoke({"topic": req.topic, "revisions": 0}, config={"recursion_limit": 10})
    return RunResponse(framework="langgraph", output=final.get("summary", ""))