# Conformance Result — operator-guide — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Req: guide コマンドは topic 一覧と topic 本文を静的に出力する

| Check | File | Result |
|-------|------|--------|
| `GUIDE_TOPICS` 9件宣言順(jobs/merge/audit/setup/escalation/request/review/inject/inbox) | `src/core/command/guide.ts:24` | ✅ |
| `renderTopicList()` が全9 topic のname+summaryを返す | `guide.ts:524` | ✅ |
| `runGuide(undefined)` exit 0 + stdout | `guide.ts:562` | ✅ |
| `runGuide("jobs")` exit 0 + body | `guide.ts:566` | ✅ |
| `requiresRepo` 不在(repo外動作) | `command-registry.ts:1489` | ✅ |
| 全9 topic body非空 (TC-002) | `guide.test.ts:93` | ✅ |

### Req: 未知 topic はエラーと一覧を返す

| Check | File | Result |
|-------|------|--------|
| `runGuide("nonexistent")` exit 2 | `guide.ts:572` | ✅ |
| `renderUnknownTopicError` がエラー行+一覧を含む | `guide.ts:535` | ✅ |

### Req: 一覧・未知候補・init snippet の topic 列挙は単一 registry から導出される

| Check | File | Result |
|-------|------|--------|
| `renderTopicList()` が `GUIDE_TOPICS` map で生成 | `guide.ts:524` | ✅ |
| `renderUnknownTopicError` が `renderTopicList()` を内包 | `guide.ts:536` | ✅ |
| `buildClaudeMdSnippet()` が `GUIDE_TOPICS.map(t => t.name).join(" / ")` で導出 | `guide.ts:544` | ✅ |
| USAGE の guide summary が `GUIDE_TOPICS.map(t => t.name).join(" ")` で導出 | `command-registry.ts:1493` | ✅ |
| drift-guard テスト (TC-005, TC-017) green | `guide.test.ts:298, 242` | ✅ |

### Req: operator 向け escalation 出力に guide escalation 導線を含める

| Check | File | Result |
|-------|------|--------|
| `formatEscalation` 出力に `specrunner guide escalation` の一行 | `escalation.ts:29` | ✅ |
| `buildCanonEscalationReason` reason文面に同一一行 | `canon-escalation.ts:151` | ✅ |
| `canon-escalation.ts` が `guide.ts` を import しない(leaf制約) | `canon-escalation.ts:11` | ✅ |
| TC-006, TC-007, TC-019 green | `guide.test.ts:344, 360, 407` | ✅ |

### Req: --help に guide の案内を含める

| Check | File | Result |
|-------|------|--------|
| `guide` が `COMMANDS` に top-level 登録 | `command-registry.ts:1485` | ✅ |
| `help.group: "Guide"` が `groupOrder` 末尾 | `command-registry.ts:601` | ✅ |
| `USAGE` が `guide` を含む | `command-registry.ts:1521` | ✅ |
| `USAGE` が全9 topic名を含む(registry導出) | `command-registry.ts:1493` | ✅ |
| TC-008 green | `guide.test.ts:380` | ✅ |

### Req: init 完了時に CLAUDE.md 用 snippet を出力する

| Check | File | Result |
|-------|------|--------|
| `runInit` 末尾で `buildClaudeMdSnippet()` を `stdoutWrite` | `init.ts:163` | ✅ |
| CLAUDE.md への自動書込なし(stdoutWrite のみ) | `init.ts:163–165` | ✅ |
| `init-snippet.test.ts` が runInit stdout に snippet 含有を確認 | `init-snippet.test.ts:57` | ✅ |
| TC-009 green | verification-result | ✅ |

### Req: escalation topic 本文は復帰 flag 分岐と reopen 制約を含める

| Check | File | Result |
|-------|------|--------|
| body に `--apply-canon` | `guide.ts:288` | ✅ |
| body に `--adopt-commits` | `guide.ts:289` | ✅ |
| body に `--from` | `guide.ts:290–295` | ✅ |
| body に `reopen` + 制約(`--apply-canon / --adopt-commits / --detach` を持たない旨) | `guide.ts:307` | ✅ |
| TC-010, TC-016 green | `guide.test.ts:218, 182` | ✅ |

### Req: skill を薄いトリガーへ縮退し廃止コマンド文字列を排除する

| Check | File | Result |
|-------|------|--------|
| `job-run-monitor/SKILL.md` 本文5行 ≤ 10 + `guide jobs` 誘導 | `.claude/skills/job-run-monitor/SKILL.md` | ✅ |
| `rebase-finish/SKILL.md` 本文5行 ≤ 10 + `guide merge` 誘導 | `.claude/skills/rebase-finish/SKILL.md` | ✅ |
| `acceptance-and-issue-audit/SKILL.md` 本文5行 ≤ 10 + `guide audit` 誘導 | `.claude/skills/acceptance-and-issue-audit/SKILL.md` | ✅ |
| `parallel-request-workflow/` ディレクトリ不在 | `git diff stat` | ✅ |
| スキル配下に `request review` / `job finish` / `specrunner ps` 不在 | TC-012 | ✅ |
| TC-011, TC-012 green | `guide.test.ts:423, 460` | ✅ |

### Req: guide 本文の specrunner コマンドは現行 CLI に実在する

| Check | File | Result |
|-------|------|--------|
| backtick内 `specrunner <tokens>` を抽出→`resolveCommand` で解決(TC-013) | `guide.test.ts:536` | ✅ |
| merge/audit/setup/request/inject topic の主要コマンドを直接 resolveCommand 検証(TC-013 direct) | `guide.test.ts:608` | ✅ |
| `job start/wait/show/ls/resume/reopen/archive/cancel/prune/attach` 全存在確認 | `command-registry.ts` | ✅ |
| `init/login/doctor/credentials set/request template/request validate` 全存在確認 | `command-registry.ts` | ✅ |
| `rules new/reviewers new/config effective/inbox run` 全存在確認 | `command-registry.ts` | ✅ |

### typecheck && test (verification-result.md)

| Phase | Result |
|-------|--------|
| build | passed |
| typecheck | passed |
| test (11667 passed / 1 skipped / 2 todo) | passed |
| lint | passed |
| changed-line-coverage | passed |

## 検証できなかった項目

None

## Findings 詳細

None — 全 spec Requirements および request.md 受け入れ基準を満たす。
