---
name: coding-standards
description: Apply project coding standards when writing, reviewing, or modifying code. Use this skill whenever you are writing new code, editing existing code, creating components, reviewing a PR, refactoring, or setting up a new project. This includes any task that produces code as output — functions, modules, components, scripts, tests, or configuration files. Trigger this skill even for small changes like adding a helper function or renaming a variable.
---

# Coding Standards

Follow these standards for every coding task.

---

## Comments

Write comments that explain *why*, not *what*. Target readability for a developer with basic familiarity in the language, including juniors.

- Explain complex logic, non-obvious decisions, and assumptions
- Keep comments concise — no padding or restating the code
- Do not comment self-explanatory lines

```python
# BAD: increment counter
counter += 1

# GOOD: offset by 1 because the API returns 0-indexed pages
page_number = raw_index + 1
```

---

## Variable Names

Names must be descriptive enough that a reader with no prior context understands the purpose.

- No single letters (except loop indices like `i`, `j` in tight loops)
- No vague abbreviations (`tmp`, `val`, `obj`)
- **JavaScript / TypeScript / Java**: `camelCase`
- **Python**: `snake_case`
- **Constants**: `UPPER_SNAKE_CASE`

```python
# BAD
x = get_data()
tmp2 = x[0]

# GOOD
api_response = fetch_user_data()
first_user = api_response[0]
```

---

## Function and Method Names

Use verb or verb-phrase names that describe the action.

Add a docstring when the function's purpose isn't immediately obvious from its name and signature alone. If the name and parameters tell the full story, skip it. When a docstring is needed, include:
1. One-line summary of purpose
2. Parameters (name, type, description)
3. Return value (type, description)

```python
# No docstring needed — the name and types say everything
def add_vectors(one: Vector, two: Vector) -> Vector:
    return Vector(one.x + two.x, one.y + two.y)

# Docstring needed — the name alone doesn't explain the filter or return shape
def fetch_active_users(since_date: str) -> list[dict]:
    """
    Fetch all users who logged in after a given date.

    Args:
        since_date: ISO 8601 date string (e.g. "2024-01-01")

    Returns:
        List of user dicts with keys: id, name, last_login
    """
    ...
```

---

## Component and Code Structure

Design for reuse. Keep functions and components independent with minimal external dependencies.

- Each function performs exactly one task. A function that coordinates multiple sub-functions is fine — but each sub-function should still do one thing.
- If a piece of logic runs more than once, extract it into a function.
- Avoid tightly coupling components or functions to a specific use case.
- In any UI framework (React, Vue, Svelte, Angular, SwiftUI, UIKit, etc.): extract reusable UI into standalone components.
- Prefer small, composable pieces over large monolithic blocks.
- **No function should exceed ~60 lines of code.** If it doesn't fit on one printed page (one line per statement, one line per declaration), split it up.

```tsx
// BAD: monolithic component tied to one use case
function UserDashboard() {
  // 300 lines mixing layout, data fetching, and business logic
}

// GOOD: composable pieces
function UserCard({ user }: { user: User }) { ... }
function ActivityFeed({ userId }: { userId: string }) { ... }
function UserDashboard() {
  return <><UserCard user={user} /><ActivityFeed userId={user.id} /></>
}
```

---

## Code Size and Simplicity

Write the minimum code that is still readable. Never sacrifice clarity for cleverness.

- Remove redundant logic and dead code
- When choosing between a clever one-liner and explicit readable code, choose readable
- Consistent formatting: use Prettier, ESLint, or Black

---

## Error Handling

Handle errors explicitly. Never swallow exceptions silently.

- Use try/catch (or equivalent) around operations that can fail
- Provide error messages that identify the cause and guide toward a fix
- Don't use generic messages like "Something went wrong"

```python
# BAD
try:
    result = call_api()
except:
    pass

# GOOD
try:
    result = call_api()
except requests.Timeout:
    raise RuntimeError(f"API timed out after {TIMEOUT_SECONDS}s — check network or increase timeout.")
```

---

## Testing

Write tests for all non-trivial logic. Tests live in a dedicated `tests/` folder with a central entry point (e.g., `tests/run_all.py` or `npm test`) that runs the full suite.

- Each test file tests one thing. Group related test files into subfolders as makes sense for readability.
- The folder structure should mirror the logic being tested closely enough that you can find the relevant test file without searching.
- Cover happy paths, edge cases, and error states.
- Test descriptions must clearly state what is being tested.
- Run tests after writing code — do not ship untested changes.
- Use TODO lists when a feature requires more than one test to verify.

```
tests/
  run_all.py                        # single entry point to run everything
  auth/
    test_login_success.py
    test_login_wrong_password.py
    test_token_expiry.py
  billing/
    test_discount_before_tax.py
    test_invoice_totals.py
```

---

## CSS

- **Shared tokens** (colors, spacing, typography): centralized CSS file or design token system
- **Component-specific styles**: colocate with the component (CSS modules, styled-components, etc.)
- This keeps the app consistently re-skinable without hunting through component files

---

## Package Management

Use **pnpm** for Node/npm projects.

---

## Project Index — `project_context.md`

Every project must have a `project_context.md` in the root. The goal: someone reads this file and knows exactly where to make a change without reading anything else.

It must always contain:
- What the project does
- A current codebase structure showing where key features, modules, and entry points live
- Enough detail that you can navigate to the right file without grepping the repo

Update this file at the end of every task that adds, removes, or changes features. If it does not exist, create it and tell the user. This file is non-negotiable — always keep it current.

---

## Security

- Validate all user input before use
- Never hardcode credentials, secrets, or API keys — use environment variables
- Follow auth best practices (hashed passwords, short-lived tokens, least-privilege access)
- Review code for security issues before finishing — look for injection vectors, exposed secrets, and missing auth checks

---

## Quick Reference Checklist

Before finishing any coding task, verify:

- [ ] Comments explain *why*, not *what*
- [ ] Variable and function names are descriptive
- [ ] Docstrings added where the function purpose isn't obvious from its name
- [ ] Repeated logic is extracted into a function
- [ ] Each function does one task and is under ~60 lines
- [ ] UI components are reusable and independent
- [ ] Error handling is explicit with helpful messages
- [ ] Tests exist, are organized by concern, and pass
- [ ] `project_context.md` is updated with current structure
- [ ] No hardcoded secrets
- [ ] Code reviewed for security issues