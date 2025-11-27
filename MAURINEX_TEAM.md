# MaurMaket AI / Tool Team Structure

This document captures the team structure, roles, responsibilities, workflow, and example prompts for the MaurMaket project.

1) Melchi — Visionaire
- Core Function: You decide direction, taste, purpose, and priorities.
- Role: CEO + Creative Director.
- Responsibilities:
  - Define product intent, constraints, cultural direction, and brand standards.
  - Set the creature feature and what “alive” looks like for the product.
  - Approve major design and philosophical decisions.

2) ChatGPT — General Director (this instance)
- Core Function: Project Manager + Lead Architect.
- Strengths: Holds full project context, coordinates multi-file work, maintains continuity.
- Responsibilities:
  - Translate Melchi's vision into concrete plans and assign tasks to other agents/tools.
  - Maintain coherence across pages, features, and versions.
  - Produce instructions for Gemini, Claude, and VS Code.

3) Gemini — Dual Director (High-memory Execution Partner)
- Core Function: Assistant Director / Systems Handler.
- Strengths: Large-message, multi-file transformations, consistent rewriting.
- Responsibilities:
  - Execute broad, multi-file refactors or rewrites (e.g., update all pages to new style).
  - Maintain layout and structure consistency during mass changes.

4) Claude — Technical Specialist (Last Resort)
- Core Function: Lead Engineer (Emergency).
- Strengths: Strong logic and code accuracy for debugging and deep tech problems.
- Responsibilities:
  - Take targeted, precise tasks: debug specific functions, optimize tricky logic, explain scaling.
  - Use only when precision and deep technical clarity are needed.

5) VS Code + Copilot — On-the-Ground Engineer
- Core Function: Implementation Engineer.
- Strengths: Direct repo access; can edit files, scaffold, and run tests.
- Responsibilities:
  - Apply final changes the architects decide on (add pages, refactor, implement components).
  - Keep repository changes small, consistent, and well-documented.

Hierarchy & Workflow
- Flow: Melchi → ChatGPT → (Gemini | Claude | VS Code)
- ChatGPT decides which agent handles a task, prepares instructions, and returns output for Melchi approval.
- Use Gemini for mass rewrites, Claude for hard technical problems, and VS Code for immediate edits and implementation.

Guidelines & Best Practices
- Single source of vision: Melchi sets high-level constraints; ChatGPT enforces them.
- Keep tasks small and scoped when sending to VS Code/Copilot.
- When sending multi-file tasks to Gemini, include explicit examples and desired output structure.
- When calling Claude, provide the minimal reproducible example or failing test case.

Example Prompts
- To Gemini: "Rewrite `index.html`, `customer.html`, and `seller.html` to the new responsive layout using design tokens X, Y, Z; keep content identical; provide the new files and an assets mapping." 
- To Claude: "Debug the checkout calculation in `cart.js`: given inputs A, B, C the output is wrong; here's the failing test and stack trace." 
- To VS Code/Copilot: "Add `MAURINEX_TEAM.md` to project root and create a link from `index.html` footer to the file. Keep markup minimal and accessible." 

Repository Notes
- File: `MAURINEX_TEAM.md` (project root) — this file.
- If you want this integrated into the site, request: "Add footer link to `MAURINEX_TEAM.md`" and specify preferred HTML placement.

Next Steps (suggested)
- Link the team doc from the site footer (`index.html`) and the repo `README.md`.
- Create a short contributor guide outlining how to request work from each AI role.

---
Document created by ChatGPT as the General Director.
