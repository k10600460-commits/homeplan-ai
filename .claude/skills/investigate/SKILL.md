---
name: investigate
description: Investigate a question about the SplanAI codebase, verify findings against the actual repository code, and write a dated Markdown report to docs/launch/. Use whenever a verified factual answer about how the code works is needed.
argument-hint: <question about the codebase>
---

# Investigate

Investigate the following question about the SplanAI codebase: $ARGUMENTS

## Process
1. Identify the files, modules, and data flows relevant to the question.
2. Read the actual code. Do not infer behavior from file names, task lists,
   product descriptions, or handover notes — confirm it in the source.
3. Build the answer only from what the code actually shows. Anything you cannot
   confirm in code must be labelled explicitly as an assumption, not a fact.
4. Note any constraints, caps, or edge cases found (API rate limits, auth
   requirements, plan gating, etc.).

## Output
Write the findings to `docs/launch/<topic>-<YYYYMMDD>.md`, where <topic> is a
short kebab-case slug of the question and <YYYYMMDD> is today's date.

Structure the file as:
- **Question** — the question investigated, verbatim.
- **Answer** — the verified answer in plain language.
- **Evidence** — the specific files / functions / line references behind each claim.
- **Assumptions & gaps** — anything not confirmable in code, flagged clearly.
- **Implications** — what this means for the product, if relevant.

Keep every claim tied to evidence. If the code contradicts an earlier
assumption, say so explicitly.
