<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git workflow

**Auto-push after every commit.** When you make a commit in this repo, immediately `git push` to `origin/master` (or the current upstream branch) without asking. Solo-developer workflow — there are no PRs to review. Vercel auto-deploys from `master`.

Exceptions where you must still confirm before pushing:
- `git push --force` or any force variant
- Pushing commits you did not author (e.g. rebases that rewrite shared history)
- Pushing to any branch other than the current branch's upstream
