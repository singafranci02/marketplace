## LaunchRoad (MCP)

This project uses LaunchRoad for AI team coordination. It's connected via an MCP server called `launchroad`.

### Every session — do these in order:
1. Call `start_session` first — returns the last session's summary, active work claims, pending signals, architecture guardrails, and the org brain in one payload.
2. Do the work.
3. Call `end_session` with a short summary of what you did, the list of files you touched, and anything left pending.

### Key tools:
- `start_session` / `end_session` — session continuity across runs
- `get_team_context` — read the shared brain (decisions, goals, blockers, milestones)
- `query_codebase_knowledge` — search AI-compressed summaries BEFORE reading raw files
- `contribute_knowledge` — after reading >2K tokens of source, save a compressed summary so future sessions skip the raw read
- `claim_work` / `check_claims` — declare what you're working on, check for conflicts before starting
- `send_signal` — proactively warn teammates about conflicts, share discoveries
- `get_guardrails` — check architecture rules before structural changes
- `update_my_focus` — tell the team what you're working on

### Proactive behavior expected:
- You do NOT need to be asked to call `send_signal` — if you notice something a teammate's AI should know (a pattern, a gotcha, a conflict risk), send an `fyi` signal yourself.
- After reading and understanding any file >2K tokens, call `contribute_knowledge` with a dense summary so future sessions save tokens.
