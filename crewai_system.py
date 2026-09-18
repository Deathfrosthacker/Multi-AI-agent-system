"""CrewAI backend — role-based crew with sequential task handoff.

Researcher → Summarizer → Critic, coordinated by a CrewAI Crew.
Run:  python crewai_system.py "your research topic"
"""
import os
import sys
from dotenv import load_dotenv

from crewai import Agent, Task, Crew, Process
from crewai.tools import tool
from langchain_openai import ChatOpenAI

load_dotenv()

llm = ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o"))


@tool("web_search")
def web_search(query: str) -> str:
    """Search the web for recent information on a topic."""
    # Plug in Tavily/SerpAPI here; kept stubbed so the file runs offline.
    return f"[simulated results for: {query}]"


def build_crew(topic: str) -> Crew:
    researcher = Agent(
        role="Research Analyst",
        goal=f"Gather comprehensive, well-sourced findings on: {topic}",
        backstory="Meticulous analyst who reads primary sources before concluding.",
        tools=[web_search],
        llm=llm,
        verbose=True,
    )
    summarizer = Agent(
        role="Summarizer",
        goal="Compress research into a tight executive summary",
        backstory="Editor who values clarity and structure over volume.",
        llm=llm,
        verbose=True,
    )
    critic = Agent(
        role="Critic",
        goal="Fact-check and stress-test the summary; flag gaps and bias",
        backstory="Adversarial reviewer who approves nothing on the first pass.",
        llm=llm,
        verbose=True,
    )

    research_task = Task(
        description=f"Research '{topic}'. Return 5-8 numbered findings with sources.",
        expected_output="Numbered list of findings",
        agent=researcher,
    )
    summarize_task = Task(
        description="Synthesize the findings into a 3-paragraph executive summary.",
        expected_output="Executive summary",
        agent=summarizer,
        context=[research_task],
    )
    critique_task = Task(
        description="Review the summary for factual errors, gaps and bias. Return a verdict.",
        expected_output="Critique with approve/revise verdict",
        agent=critic,
        context=[summarize_task],
    )

    return Crew(
        agents=[researcher, summarizer, critic],
        tasks=[research_task, summarize_task, critique_task],
        process=Process.sequential,
        verbose=True,
    )


if __name__ == "__main__":
    topic = " ".join(sys.argv[1:]) or "Impact of quantum computing on cybersecurity"
    result = build_crew(topic).kickoff()
    print("\n=== FINAL OUTPUT ===\n", result)