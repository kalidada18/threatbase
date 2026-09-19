/**
 * Regression guard for the ignore pattern that ate a route.
 *
 * Why this exists: `.gitignore` had an unanchored `db/` for the root SQL
 * migration folder, which also matched `functions/api/db/`. The Phase 2 proxy
 * route therefore existed on disk, typechecked, worked locally, and was invisible
 * to git — so it could never be committed, and Cloudflare Pages (which builds
 * Functions from the git checkout) would have shipped without it. Every request
 * would 404 while the source tree looked complete.
 *
 * That failure is undetectable by tsc, eslint, vitest and a build. It is only
 * detectable by asking git which real files it is refusing to see, so this file
 * asks exactly that, on every CI run.
 *
 * Scope: source that must ship. `src/` and `functions/` are the two trees Pages
 * compiles, so anything ignored inside either one is a bug by definition.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(__dirname, '../..')

/** Source tarballs and some CI exporters hand over no VCS directory; the check is
 *  meaningless there, so it is skipped rather than failing a build for a reason
 *  unrelated to the change under review. */
const inGitRepo = existsSync(path.join(REPO_ROOT, '.git'))

/** Untracked AND ignored files under a shippable tree. */
function ignoredSourceFiles(): string[] {
  const out = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--',
      'src',
      'functions',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

describe.skipIf(!inGitRepo)('.gitignore must not swallow shippable source', () => {
  it('reports no ignored-and-untracked files under src/ or functions/', () => {
    const hidden = ignoredSourceFiles()
    // The message names the likely culprit, because the fix is almost always an
    // unanchored pattern that matches a directory name deeper in the tree.
    expect(
      hidden,
      `These files exist but git will not commit them, so they will never deploy. ` +
        `Check .gitignore for an unanchored directory pattern (a bare ` +
        `'foo/' matches foo/ at every depth; '/foo/' matches only the root one): ` +
        `\n${hidden.join('\n')}`,
    ).toEqual([])
  })

  it('still ignores the root db/ directory, which the anchoring must not un-hide', () => {
    // The /db/ anchor exists to stop matching functions/api/db. It must not have
    // started tracking the SQL migrations, which are untracked on purpose.
    const probe = path.join('db', 'functions.sql')
    if (!existsSync(path.join(REPO_ROOT, probe))) return // fresh clone without local db/
    const out = execFileSync('git', ['check-ignore', '-q', probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    // exit 0 (no throw) means "still ignored". execFileSync throws on non-zero.
    expect(out).toBe('')
  })
})
