# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Email the maintainer via the address on the [GitHub profile](https://github.com/Deathfrosthacker),
or use [GitHub private vulnerability reporting](https://github.com/Deathfrosthacker/Multi-AI-agent-system/security/advisories/new)
if enabled on the repository.

Include:
- A description of the vulnerability and its impact.
- Steps to reproduce (PoC, request samples, screenshots).
- Affected versions / commit SHA.

You should receive an acknowledgement within **72 hours**. We aim to ship a fix or
mitigation within **14 days** for high-severity issues and will coordinate disclosure
with you before any public post.

## Scope

In scope:
- The FastAPI backend (`backend/main.py`) — injection, auth bypass, data exposure.
- The agent backends (`backend/crewai_system.py`, `backend/langgraph_system.py`) —
  prompt injection handling, unsafe tool execution.
- The frontend (`index.html`, `app.js`) — DOM XSS, unsafe HTML injection.

Out of scope:
- The simulated dashboard logic (no real data, no network calls).
- Third-party dependencies — report those to their maintainers (with a heads-up here).

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| 1.x     | :x:                |

## Hardening notes for operators

- Never commit `.env`; rotate keys immediately if leaked.
- Set `ALLOWED_ORIGINS` to your real frontend domain in production (not `*`).
- Keep `OPENAI_API_KEY` server-side only — the browser frontend never needs it.
- Pin and regularly update dependencies: `pip-audit` / `npm audit` in CI.
