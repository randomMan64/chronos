---
trigger: always_on
---

# Ponytail + YAGNI Coding Principles

Apply these principles to every coding task.

## 1. Avoid Unnecessary Code (Ponytail)

- Implement only what is necessary to satisfy the requirement.
- Avoid unnecessary abstractions, wrapper components, utility functions,
  dependencies, duplicate state, API calls, and premature optimization.
- Prefer the simplest correct solution, not the shortest code at any cost.

## 2. Follow YAGNI

- YAGNI means "You Aren't Gonna Need It."
- Do not implement hypothetical future requirements.
- Do not add extensibility, configuration options, or generic frameworks
  without a concrete current requirement.
- Do not build features the user did not request.
- Add flexibility only when an actual requirement justifies it.

## 3. Inspect Before Creating

- Search the existing codebase before implementing.
- Check for reusable components, hooks, utilities, API functions, types,
  and existing dependencies.
- Understand the existing implementation and data flow before changing it.
- Fix root causes instead of applying speculative workarounds.

## 4. Prefer Existing Solutions

Prefer, in order:

1. Existing project functionality
2. Browser and platform APIs
3. Native JavaScript and TypeScript
4. Already-installed dependencies
5. New dependencies only when genuinely necessary

## 5. Make Minimal Changes

- Modify only what is necessary for the requested task.
- Do not rewrite unrelated code or refactor unrelated components.
- Preserve existing naming, architecture, formatting, and conventions.
- Avoid changing files that are not relevant to the task.

## 6. Preserve Existing Behavior

Do not unintentionally change:

- API contracts and response formats
- Business logic and database behavior
- Authentication and authorization
- Routing and navigation
- Existing UI behavior

Preserve compatibility unless a change is explicitly required.

## 7. Maintain Correctness and Security

- Do not sacrifice validation, security, accessibility, error handling,
  type safety, or essential edge-case handling to reduce code.
- Add tests for important business logic and risky changes where appropriate.
- Follow the project's existing testing conventions.

## 8. Verify Changes

- Run relevant tests, type checks, or lint checks when available.
- Inspect the final diff for unrelated changes and unnecessary complexity.
- Never claim checks passed unless they were actually executed successfully.
- Report important checks that could not be completed.

## 9. Final Review

Before finishing, ask:

- Is every change necessary?
- Does existing code already solve this?
- Am I implementing a hypothetical requirement?
- Can I remove complexity without reducing correctness?
- Have I preserved existing behavior?
- Have I verified the result appropriately?

If a change is unnecessary, do not make it.

## 10. Resolve Conflicts

- Follow explicit user requirements and applicable security constraints.
- Respect established project conventions and architecture.
- When rules conflict, choose the simplest solution that satisfies the
  actual requirement without compromising correctness.
