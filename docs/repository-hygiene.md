# Repository hygiene — 2.2.0

The independent `src/hygiene` module supports recurring maintenance across cloned
`github.com/mozolestudio` repositories. Public commands, report rule names and maintenance
commit titles use neutral terminology. Detection dictionaries necessarily contain the
terms they recognize; strict findings in detector code and test fixtures need review.

```sh
mozole hygiene --path /workspace/project --json
mozole hygiene --path /workspace/project --strict --history 100 --json
mozole hygiene --path /workspace/project --fix
mozole hygiene --message /tmp/commit-message.txt
```

Default audit covers attribution sentences, synthetic trailers (including bot identities),
generator badges, prompt/model/session metadata, assistant boilerplate, tool links and
common tool configuration paths. Strict mode additionally reports standalone vendor and
model names, including references embedded in code, prose and dependency manifests.
Human trailers, ordinary words containing a matching substring, and generic compiler
output headers are not synthetic attribution. Findings contain locations and rule IDs,
not source excerpts. JSON schema version is 1; ordering is deterministic.

Only complete standalone signature comments with a recognized author can be replaced
with a neutral maintenance comment. Preserve line count, line endings and permissions.
Ambiguous multiline strings, fenced examples, mixed executable lines, tool configs,
metadata values, prose, badges, legal notices and repository policy require review.
No global word replacement, dependency removal, file deletion or Git history rewriting
occurs. Existing human attribution is never replaced by invented human attribution.

Audit includes Git-tracked files and nonignored untracked files, including dotfiles,
extensionless files and all UTF-8 source languages. Dependency/output directories,
symlinks, submodules, binary/non-UTF8 files and files above 2 MiB are skipped and reported.
Git-ignored untracked files are outside the inventory. Audit reports are not proof that
binary assets, omitted content, remote branches, issues, PRs or hosting metadata are clean.
History examines up to 10,000 recent commits reachable from HEAD; shallow clones only
expose available history. Commit author/committer identities are not rewritten.

Cleanup requires the exact repository root, a clean working tree (including untracked
files), and a recognized HTTPS/SSH origin under mozolestudio. Audit works on other local
repositories without changing them. Files are rechecked before atomic replacement.
If an I/O error interrupts a multi-file run, previously completed edits remain visible
in the diff; there is no multi-file transaction. Review the diff before retrying.

Exit codes: **0** no remaining findings, **1** findings requiring cleanup or review,
**2** operational/configuration error. A successful cleanup can return 1 when review-only
findings remain. Skipped files are always reported, but do not alone change the exit code.
`--message` performs strict read-only validation of a proposed message and does not scan
a repository; do not combine it with repository options.

## Recurring maintenance runbook

Use this task description in the organization's existing scheduled maintenance service:

> Work on the assigned mozolestudio repository. Run `mozole hygiene --strict --json`
> and review findings and skipped files. On a clean checkout, run `mozole hygiene --fix`.
> Resolve remaining findings only after checking their purpose; preserve licenses,
> human attribution, repository policy and required integrations. Run the repository's
> verification command, inspect the diff, then audit again. Report unresolved findings
> explicitly. Use `chore: clean repository metadata` for a maintenance commit or PR title.
> Validate the commit message with `mozole hygiene --message <file>`. Do not add synthetic
> trailers. Do not push directly to the default branch or rewrite published history.

Run independently in each authorized checkout. The CLI does not discover private
repositories, clone, authenticate, schedule tasks, commit or publish. Scheduling and
repository permissions belong to the existing maintenance service. Pin `@mozole/cli`
to 2.2.0 after publication. For local development use `npm run dev -- hygiene ...`.

The repository's scheduled audit workflow runs the source CLI with read-only permissions
and uploads a JSON report. It does not automatically change source or create issues.
