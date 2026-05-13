# AI-Assisted GitHub Workflow for Beginner Developers

This guide explains how to safely **pull, update, review, merge, and push** code with AI help.

## 1) Core Logic First (What Git Is Tracking)
Think in 4 layers:

1. Working directory: your files on disk (what you edit).
2. Staging area: what you are preparing to commit.
3. Local commits: saved history on your machine.
4. Remote repo (GitHub): shared history everyone uses.

Why this matters:
- You should only commit what you understand and intend.
- You should only push reviewed commits.
- Merge requests (PRs) protect main from accidental breakage.

## 2) Golden Rule
**Never work directly on `main` for feature changes.**

Why:
- Keeps `main` stable.
- Makes rollback easy.
- Lets teammates (and AI) review changes safely.

## 3) Team Branch Strategy (`main`, `dev`, and feature branches)
Use this flow:

1. `main`: production-ready code only.
2. `dev`: integration safety net for new features.
3. `feature/*`: short-lived branches for individual tasks.

Required path:
1. Feature branch -> PR into `dev`.
2. Validate in `dev` (tests, manual QA, site checks).
3. PR from `dev` -> `main` only after confirmation.

Why:
- `dev` catches integration problems before they hit production.
- Multiple feature branches can be tested together safely.
- `main` stays reliable for users.

## 4) Start Every Task Safely
Run these before coding:

```bash
git checkout dev
git pull origin dev
git checkout -b your_branch_name
```

Why:
- `git checkout dev`: branch from the current integration baseline.
- `git pull origin dev`: get latest team updates already staged for release.
- `git checkout -b ...`: isolate your work in a feature branch.

Example branch names:
- `fix/login-validation`
- `feature/pacman-audio`
- `chore/readme-update`

## 5) Make Changes with AI (But Review Intentionally)
Suggested process:

1. Ask AI for one focused change at a time.
2. Run the app/tests after each significant change.
3. Inspect what changed before committing.

Useful review commands:

```bash
git status
git diff
git diff --staged
```

Why:
- AI is fast, but can still make wrong assumptions.
- Small, reviewed changes are much safer than huge blind commits.

## 6) Stage and Commit Cleanly
Stage only files related to one logical change.

```bash
git add path/to/file1 path/to/file2
git commit -m "feat: add ghost speed balancing"
```

Why:
- Clean commits are easier to review and revert.
- One commit should tell one clear story.

Good commit message format:
- `feat: ...` new functionality
- `fix: ...` bug fix
- `docs: ...` documentation
- `chore: ...` maintenance

## 7) Push Branch to GitHub
```bash
git push -u origin your_branch_name
```

Why:
- Publishes your work for backup and collaboration.
- `-u` links local branch to remote tracking branch for simpler future pushes.

After first push, next pushes can usually be:

```bash
git push
```

## 8) Open a Pull Request (Merge Request)
Create PR from your branch into `dev`.

PR checklist:
1. Clear title (what changed).
2. Short description (why and how).
3. Screenshots/video for UI changes.
4. Test notes (what you verified).

Why:
- PR is a controlled checkpoint.
- Discussion and review happen before merge.
- CI checks can catch issues early.

## 9) Keep Branch Updated While PR Is Open
If `dev` moves ahead, update your branch:

```bash
git checkout dev
git pull origin dev
git checkout your_branch_name
git merge dev
```

Then resolve conflicts if needed, and:

```bash
git push
```

Why:
- Reduces merge surprises.
- Ensures your branch works with latest code.

## 10) Promote `dev` to `main`
After feature PRs are merged into `dev` and verified, promote `dev` to `main`:

1. Open PR from `dev` -> `main`.
2. Verify release checks pass.
3. Merge PR on GitHub.
4. Sync local branches:

```bash
git checkout main
git pull origin main
git checkout dev
git pull origin dev
```

5. Delete old feature branch (optional cleanup):

```bash
git branch -d your_branch_name
git push origin --delete your_branch_name
```

Why:
- Keeps local and remote clean.
- Avoids reusing stale branches accidentally.

## 11) What AI Should and Should Not Do
AI is great for:
- Writing/refactoring code.
- Explaining diffs.
- Suggesting commit messages.
- Suggesting test cases.

You should still decide:
- What goes into commit.
- Whether behavior matches requirements.
- Whether security or data-sensitive changes are safe.

## 12) Safe "Pre-Push" Checklist
Before every push:

1. `git status` is clean except intended files.
2. App runs locally.
3. Tests pass (if available).
4. `git diff --staged` matches your intent.
5. Commit message is clear.

## 13) Common Mistakes and Fixes
Mistake: Committed to `main` directly.
- Fix: Create new branch from current state and open PR for future discipline.

Mistake: Added too many files in one commit.
- Fix: Use `git reset` (unstage), then stage only intended files.

Mistake: Merge conflicts look scary.
- Fix: Ask AI to explain both sides of conflict and propose a resolution, then run tests.

Mistake: Pushed broken code.
- Fix: Create a follow-up fix commit quickly, or revert the bad commit via PR.

Mistake: Opened feature PR straight into `main`.
- Fix: Change PR target to `dev`, complete validation there, then promote `dev` to `main`.

## 14) Minimal Day-to-Day Command Flow
```bash
# Start
git checkout dev
git pull origin dev
git checkout -b feature/small-change

# Work + review
git status
git diff

# Commit
git add path/to/changed/files
git commit -m "fix: correct pellet collision"

# Publish branch
git push -u origin feature/small-change

# Open PR: feature/small-change -> dev

# After release validation, open PR: dev -> main

# After PRs merged
git checkout dev
git pull origin dev
git checkout main
git pull origin main
git branch -d feature/small-change
```

---

If you want, this guide can be expanded into a team standard with:
- branch naming rules,
- PR templates,
- required checks,
- release tagging process.
