# Horizons Project Review UI

A three-panel interface for reviewing Hack Club Horizons project submissions. Designed for reviewers to efficiently evaluate projects, view code/demo artifacts, and leave structured feedback.

---

## Layout Overview

The UI is a fixed full-viewport layout with a **top navigation bar** and a **three-column main area** (left panel, center panel, right panel). Nothing on the page scrolls globally — each section manages its own overflow independently.

### Top Bar

- **Logo and title** on the left
- **Project counter** in the center showing current position in the review queue (e.g. "Reviewing 3 of 47 pending")
- **Prev / Next buttons** on the right to navigate between projects in the queue

---

## Left Panel — Applicant Info & Review History

This is the primary context panel for understanding who submitted and what's happened so far. It scrolls independently.

### User Identity

- **Name** displayed prominently at the top
- **DM on Slack** — inline link to open a Slack DM with the applicant (opens externally)

### Action Links (2×2 Grid)

Four link buttons in a grid layout:

- **Code** — opens the source code repository
- **Demo** — opens the live demo link (visually highlighted to stand out)
- **README** — opens the README file directly
- **Airlock** — opens the project in a sandboxed VM environment for safe testing *(functionality TBD — see code comments)*

### Hours

- **Total hours** displayed as a computed sum, not directly editable
- **Per-project breakdown** shown below the total, with each Hackatime project on its own line. The hours for each project are individually editable by the reviewer — changing them automatically recalculates the total
- If only one Hackatime project is linked, the breakdown should be hidden and only the total shown

### Age

- Displayed as a badge (e.g. "13yo") — no birthday or date of birth shown

### Internal Notes — Project

- Collapsed by default, showing just the header with a **+** button
- Click to expand and reveal a textarea for writing notes about this specific project
- **Save** button appears inline on the header row when expanded
- An amber dot indicator appears on the header when a note has content
- These notes are tied to the project, not the user

### Internal Notes — User

- Same behavior as project notes, but persisted at the user level
- Useful for flagging patterns across multiple submissions from the same person

### Review History

A reverse-chronological timeline (newest first) showing all events related to this submission. Events are separated by subtle inner dividers.

**Event types:**

- **Submitted / Re-submitted** — shows the hours claimed and a relative timestamp (e.g. "1mo ago"). Hover over the timestamp to see the exact date and time. First submissions get a blue dot, re-submissions get an amber dot.
- **Approved** — shows the reviewer's comment to the user with a green badge. If the reviewer wrote an hours justification, it appears directly below the approval as a highlighted block with an amber left border and subtle background tint. The justification is internal and not shown to the user.
- **Changes Needed** — shows the reviewer's feedback to the user with a red badge

Hours justification only appears on re-shipped projects where a prior reviewer wrote one. New/first-time submissions won't have this.

---

## Center Panel — Demo Preview & Actions

### Demo iframe

- **URL bar** at the top showing the demo link
- **Open** button loads the demo URL into the iframe
- **Reload** button refreshes the iframe content
- The iframe starts empty with a placeholder prompting the reviewer to click Open

### README Drawer

- A collapsible panel between the iframe and the action bar
- When collapsed, shows a slim bar labeled "README" with a chevron — click to toggle open
- When open, renders the project's README content with basic markdown formatting (headings, code blocks, lists, links)
- **Persistence note:** The open/closed state should be saved across the reviewer's entire session. If they open the README for one project, it should stay open when they navigate to the next project. If they close it, it stays closed.

### Action Bar

Two primary action buttons at the bottom:

#### Approve

Clicking expands a form with:

1. **Ship Justification** — textarea labeled "not shown to user." This is an internal record of why the reviewer approved the project (e.g. hours match, project is complete, shipped publicly). This will appear in the review history for future reviewers.
2. **Comment for User** — textarea labeled "optional — shown to user." Positive feedback or suggestions the applicant will see.
3. **Cancel** and **Submit Approval** buttons

#### Changes Needed

Clicking expands a form with:

1. **What needs to change?** — textarea labeled "shown to user." Describes what the applicant needs to fix or improve before resubmission.
2. **Cancel** and **Submit** buttons

Only one form can be open at a time — clicking one action closes the other.

---

## Right Panel — GitHub Info & Review Checklist

The right panel is split vertically into two sections. The top section (GitHub) takes up remaining space, and the bottom section (checklist) takes only as much space as it needs, aligned to the bottom.

### GitHub Section (Top)

#### Header

- GitHub icon and label on the left
- Repository name as a clickable link on the right (opens in new tab)

#### Stats Row

Four metrics displayed evenly spaced:

- Stars
- Forks
- Issues
- Pull Requests

#### Metadata

- **Language** — shown as a colored badge (e.g. "Java")
- **License** — displayed inline next to language
- **Created** and **Last Push** — relative timestamps

#### Commits

- Header shows "Commits" with a count badge
- Scrollable list (only the commits scroll, the header/stats/metadata stay fixed above)
- Each commit is a clickable block linking to the commit on GitHub, showing:
  - Commit message (truncated with ellipsis if too long)
  - Author avatar initial, author name, relative timestamp
  - Lines added (green) and removed (red) in monospace

### Review Checklist (Bottom)

A list of checklist items with checkboxes. Clicking a row toggles the checkbox, strikes through the label, and updates the progress counter (e.g. "3/7").

**Behavioral notes:**

- Checklist state should **persist across re-reviews** of the same project — if a reviewer checks items, navigates away, and comes back, the checks should still be there
- Checklist should be **discarded/reset after a project is approved**
- Checklist items **may vary depending on the type of review** (e.g. first submission vs re-submission, game vs website vs library)

Example checklist items (these are illustrative and may change):

- README exists and has setup instructions
- Demo link works and is accessible
- Code is original (not a tutorial clone)
- Hours claimed match Hackatime logs
- Commits show meaningful progress over time
- Project is publicly shipped / deployed
- No red flags in code or dependencies