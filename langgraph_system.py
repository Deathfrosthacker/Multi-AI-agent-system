"""LangGraph backend with a research, summary, and review workflow."""
import os
from typing import TypedDict

from dotenv import load_dotenv

from langgraph.graph import END, START, StateGraph
from langchain_openai import ChatOpenAI

load_dotenv()

llm = ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o"))


class GraphState(TypedDict, total=False):
    topic: str
    research: str
    summary: str
    critique: str
    revisions: int


def research_node(state: GraphState) -> GraphState:
    response = llm.invoke(
        f"Research '{state['topic']}'. Return 5-8 numbered findings with sources."
    )
    return {"research": response.content}


def summarize_node(state: GraphState) -> GraphState:
    response = llm.invoke(
        "Synthesize these findings into a concise executive summary:\n\n"
        + state["research"]
    )
    return {"summary": response.content}


def critique_node(state: GraphState) -> GraphState:
    response = llm.invoke(
        "Review this summary for factual errors, gaps, and bias. Return a verdict "
        "and specific corrections:\n\n" + state["summary"]
    )
    return {"critique": response.content}


def build_graph():
    workflow = StateGraph(GraphState)
    workflow.add_node("research", research_node)
    workflow.add_node("summarize", summarize_node)
    workflow.add_node("critique", critique_node)
    workflow.add_edge(START, "research")
    workflow.add_edge("research", "summarize")
    workflow.add_edge("summarize", "critique")
    workflow.add_edge("critique", END)
    return workflow.compile()