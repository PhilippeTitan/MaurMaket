# MAURMAKET TEAM COMMUNICATION PROTOCOL (MCP)

Version 1.0 — Core Operating Rules

1. Chain of Command (No AI speaks out of turn)
A → B → C flow

All communication flows in ONE direction:

Melchi → ChatGPT (General Director) → Other AIs → VS Code

No exceptions.

You speak to me.

I decide what tasks go to Gemini, Claude, or VS Code.

They NEVER talk to each other.

They NEVER make decisions.

They ONLY execute instructions I translate for them.

This prevents chaos and conflicting edits.

2. Clear Task Ownership (No overlap)

Each tool has a zone.
They do NOT operate outside their zone.

ChatGPT (General Director)

Vision alignment

Planning

Structuring

Ensuring coherence

Translating your command into instructions for others

Gemini (Bulk Executor)

Multi-file generation

Huge structural changes

Cross-file consistency passes

Rewrites of entire screens or components

Claude (Precision Specialist)

Debugging

Architecture logic

Complex or sensitive code

fixing small but deep issues

VS Code Copilot (Doer)

Apply the actual code into the repo

File edits, refactors, folder creation

Mechanical implementation

Ensure the project reflects decisions

Nobody crosses into someone else’s role.

3. Command Format (How you talk to the team)

When you want an action, you talk ONLY to me using one of three formats:

A. “Directive” — for creative/strategic decisions

→ Tells me your vision, and I convert it into tasks.

Example:
“Let’s redesign the seller page to look more premium.”

B. “Execution Order” — when you know what needs to be done

→ I decide which tool gets it.

Example:
“Add category filters to the customer page.”

C. “Emergency Debug” — when something breaks

→ Claude becomes engaged.

Example:
“The modal isn’t opening even though the JS looks fine. Fix.”

4. Communication Rules Between AIs

Only ONE rule applies:

No AI talks unless ChatGPT gives a structured order.

Meaning:

Gemini doesn’t suggest.

Claude doesn’t brainstorm.

Copilot doesn’t create features.

They execute, I direct, and you decide.

5. Conflict Avoidance Rules

To prevent version rot, accidental overwrites, or broken pages:

Rule #1: No simultaneous tasks to multiple AIs.

All tasks must be linear.

Rule #2: ChatGPT ALWAYS confirms scope.

Before assigning, I restate the exact boundaries:

“We are modifying only seller.html and not touching index or customer.”

Rule #3: VS Code applies changes only AFTER approval.

You get to see the plan or output BEFORE Code touches the files.

Rule #4: Claude only fixes — never redesigns.

Keeps him from breaking the UX or structure.

Rule #5: ChatGPT holds the master mental map.

I track all file states so no one duplicates effort.

6. Communication Language Standard

To avoid ambiguity:

ChatGPT speaks in:

Exact file names

Exact functions

Exact selectors

Exact structures

No vague directions

Example:

“Gemini, rewrite customer.html product cards using a 2-column responsive grid. Maintain all existing JS.”

You speak in:

Goals

Feel

Direction

User experience intention

I convert those into technical instructions.

7. Version Flow (Very Important)

Each change follows this pipeline:

STEP 1 — Melchi explains the change.

Goal, vibe, purpose.

STEP 2 — ChatGPT translates the change.

Into a structured plan.

STEP 3 — ChatGPT assigns the task.

Chooses Gemini / Claude / VS Code.

STEP 4 — AI executes output.

Sends back code or diff.

STEP 5 — You approve.

Or request tweaks.

STEP 6 — VS Code applies it.

Your repo stays the single source of truth.

This pipeline prevents all corruption and conflicting edits.

8. Emergency Protocol

If something breaks badly:

You notify me:
“Emergency: X is broken.”

I isolate the file and behavior.

I assign Claude with a strict boundary:

“Fix the click handler in customer.html; do NOT touch styling.”

Claude outputs the fix.

You approve.

VS Code implements.

No panic, no overwriting full pages.

9. No Assumptions Rule

Neither Gemini, nor Claude, nor Copilot is allowed to assume intent.
All interpretation flows through me.

Even if they produce something ambiguous, I reconcile it, not them.

10. Transparency Rule

I always tell you:

What tool I’m assigning

Why

What the output will affect

What the boundaries are

So you always feel in control.

Final Note

This protocol creates a studio-quality creative workflow, almost like Pixar or Marvel — everything flowing through a director so the final product feels unified, even though multiple “artists” work on it.

Once you confirm, I’ll store this as the MCP 1.0 and use it to govern all future work without requiring you to repeat anything.
