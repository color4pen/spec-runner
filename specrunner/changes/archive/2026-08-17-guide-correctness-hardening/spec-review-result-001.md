# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### request.md のコード前提の事実照合

各 "現状コードの前提" 項目を実コードと突合:

| 項目 | 確認 |
|------|------|
| `guide.ts:313` — `job cancel <slug> --restore-draft` | ✅ 確認。code block 内に当該行が存在する |
| `guide.ts:112` — `<slug>-<jobId>` worktree path | ✅ 確認。`cd .git/specrunner-worktrees/<slug>-<jobId>` が存在する |
| `guide.ts:377-378` — review topic issue-as-canon | ✅ 確認。"request.md でなく起点 issue の正典を canon とする" が存在する |
| `guide.ts:184` — audit topic issue-as-canon | ✅ 確認。"レビューは request.md ではなく起点 issue の正典と照合する" が存在する |
| `guide.ts:42` — 陳腐化した job ls 事前確認 | ✅ 確認。"起動直後は state 登録に数秒ラグあり。`specrunner job ls` で running を確認してから:" が存在する |
| `guide.ts:199` — "2 層 config scaffold" 見出し | ✅ 確認。"## 1. init — 2 層 config scaffold" が存在する |
| `command-registry.ts:52` — VALID_JOB_ID_CHARS | ✅ 確認。`const VALID_JOB_ID_CHARS = /^[a-f0-9-]+$/` |
| `command-registry.ts:929` — job cancel args | ✅ 確認。`args: [{ name: "jobId", required: false }]` |
| `command-registry.ts:886` — job show args | ✅ 確認。`args: [{ name: "jobId\|slug", required: true }]` |
| `manager.ts:65` — `jobId.slice(0, 8)` | ✅ 確認。`const jobIdShort = jobId.slice(0, 8)` |
| `runner.ts:450-451` — halt 出力に guide 導線なし | ✅ 確認。`Pipeline halted at step ...` および `Run 'specrunner resume' to continue...` のみ |
| `SKILL.md:6` — parallel-request-workflow 言及 | ✅ 確認。"parallel-request-workflow / rebase-finish の前後..." が description frontmatter に存在する |
| ADR:49 — tombstone 記述 | ✅ 確認。"tombstone を置いて実質削除する" が存在する |
| `init.ts` — project-local config を scaffold しない | ✅ 確認。`runInit` が作るのは global config + per-repo scaffold のみ。`.specrunner/config.json` の生成コードなし |

### CommandSpec 整合確認（Design D3 の invocation contract 設計に対して）

TC-028 が検証する topic/code block コマンド例を手動で追跡した:

| コマンド例 | path 解決 | flag | positional | 総評 |
|-----------|----------|------|-----------|------|
| `specrunner job start <slug\|file> --detach` | job.start ✅ | detach∈RUN_JOB_FLAGS ✅ | "slug\|file" = args[0].name "slug\|file" ✅ | OK |
| `specrunner job resume <slug> --detach` | job.resume ✅ | detach ✅ | "slug" = args[0].name "slug" ✅ | OK |
| `specrunner job archive <slug> --with-merge` | job.archive ✅ | with-merge ✅ | "slug" = args[0].name "slug" ✅ | OK |
| `specrunner job wait <slug>` | job.wait ✅ | — | "slug" = args[0].name "slug" ✅ | OK |
| `specrunner job show <slug>` | job.show ✅ | — | "slug" ∈ split("jobId\|slug") ✅ | OK |
| `specrunner job cancel <jobId> --restore-draft` (fix 後) | job.cancel ✅ | restore-draft ✅ | "jobId" = args[0].name "jobId" ✅ | OK |
| `specrunner job cancel <slug> --restore-draft` (fix 前) | job.cancel ✅ | restore-draft ✅ | "slug" ≠ "jobId" **MISMATCH** | FAIL ✅(期待動作) |
| `specrunner job reopen <slug> --from <step> --reason "<理由>"` | job.reopen ✅ | from,reason ✅ | "slug"=args[0].name"slug" ✅ | OK |
| `specrunner job prune --force` | job.prune ✅ | force ✅ | — | OK |
| `specrunner job attach --branch <branch>` | job.attach ✅ | branch ✅ | <branch> は flag value placeholder → skip ✅ | OK |
| `specrunner job cancel <slug> --restore-draft` (fix前, TC-030 negative test) | cancel ✅ | restore-draft ✅ | "slug" ≠ "jobId" → mismatch reported ✅ | OK |
| `specrunner reviewers new <name>` | reviewers.new ✅ | — | "name"=args[0].name"name" ✅ | OK |
| `specrunner config effective --type spec-change` | config.effective ✅ | type ✅ | — | OK |
| `specrunner inbox run` | inbox.run ✅ | — | — | OK |
| `specrunner inbox run --dry-run` | inbox.run ✅ | dry-run ✅ | — | OK |
| `specrunner rules new implementer no-inline-comment` | rules.new ✅ | — | positionals=[] (実値。`<>`なし) → skip ✅ | OK |
| **`specrunner rules new <step-name> <rule-slug>`** | rules.new ✅ | — | args[0].name="step-name rule-slug"(space-joined); split("\|")=["step-name rule-slug"]; "step-name"∉["step-name rule-slug"] → **FALSE POSITIVE VIOLATION** | **NG** |

`rules new` の args spec: `args: [{ name: "step-name rule-slug", required: true, count: 2 }]`。
space-joined の compound name を `split("|")` だけで処理すると inject topic の正当なコマンド例が違反と判定される。

### spec.md Scenario と要件の整合

spec.md の全 Requirement と Scenario を request.md の要件(1〜8)と対照した:
- 要件1(review/audit 正典モデル) → spec に2本のRequirementで記述 ✅
- 要件2(cancel 2段案内) → escalation topic Requirement で記述 ✅
- 要件3(worktree path 8文字) → merge topic Requirement で記述 ✅
- 要件4(invocation contract 拡張) → 2本のRequirementで記述 ✅
- 要件5(runner.ts 導線) → runner.ts halt Requirement で記述 ✅
- 要件6(jobs topic 陳腐化手順撤去) → jobs topic Requirement で記述 ✅
- 要件7(setup topic init 記述) → setup topic Requirement で記述 ✅
- 要件8(残骸除去) → SKILL.md + ADR の2本のRequirementで記述 ✅

### test-cases.md の TC 番号と tasks.md の乖離確認

tasks.md は TC-022 〜 TC-030 の 9 グループを定義する。
test-cases.md は TC-022 〜 TC-041 の 20 件個別 TC を定義する。
tasks.md の TC 番号は provisional であり、test-cases.md が正式番号の正本である。
実装時に tasks.md の番号をコメントに使うと test-cases.md との対応が取れなくなる。

### TC-021 後退なし確認

T-01 fix 後の escalation topic body は `specrunner job cancel <jobId> --restore-draft` を含む(引数が `<slug>` → `<jobId>` に変わるだけ)。TC-021 が pin する `specrunner job cancel` および `--restore-draft` は依然存在するため TC-021 は無変更で green を維持する。

---

## 検証できなかった項目

- `formatEscalation`(escalation.ts:29)と `buildCanonEscalationReason`(canon-escalation.ts:151)に既存の `specrunner guide escalation` 導線が存在するという request.md の前提を実コードで確認していない(runner.ts 側の欠落は確認済み)。
- TC-011(薄いトリガー化テスト)が T-05 の SKILL.md 修正後も green を維持するかの詳細検証。TC-011 は body の行数と guide 参照の存在を pin しており、description frontmatter の 1 単語削除は影響しないと推定するが、直接確認していない。

---

## Findings 詳細

### Finding 1 (HIGH / fixable)

**Design D3 の `validateInvocation` が space-joined compound args.name を処理できない**

`rules new` の CommandSpec は `args: [{ name: "step-name rule-slug", count: 2 }]` という space-joined compound name を持つ。Design D3 の `validateInvocation` 実装は:

```typescript
const allowed = arg.name.split("|");
if (!allowed.includes(placeholder)) { /* violation */ }
```

`"step-name rule-slug".split("|")` は `["step-name rule-slug"]` を返す。inject topic code block の `specrunner rules new <step-name> <rule-slug>` をパースすると `positionals = ["step-name", "rule-slug"]` が得られ、`args[0]` に対して "step-name" ∉ ["step-name rule-slug"] → `positional-name-mismatch` violation が発生する(false positive)。

TC-028 は inject topic の全 code block コマンドを検証するため、このケースで fail する。

**修正方法(2 択):**
- (A) split を `arg.name.split(/[| ]/)` に変更する。`"step-name rule-slug"` → `["step-name", "rule-slug"]`、`"jobId|slug"` → `["jobId", "slug"]`、いずれも正しく動作する。tasks.md T-04 の `validateInvocation` コードに 1 行修正を加えるだけ。
- (B) `INVOCATION_CONTRACT_SKIP_PATTERNS` に `specrunner rules new <step-name> <rule-slug>` パターンを追加する(理由: count:2 args は space-joined compound name を使うため positional 名照合不能)。

(A) の方が根本対応として推奨。実装者は tasks.md T-04 の `validateInvocation` を書く際に split デリミタを `/[| ]/` に修正すること。

### Finding 2 (LOW / fixable)

**tasks.md と test-cases.md の TC 番号体系が乖離している**

tasks.md: TC-022〜TC-030 の 9 グループ(T-03/T-04 で実装指示)
test-cases.md: TC-022〜TC-041 の 20 件個別 TC(正本)

実装者が tasks.md の TC 番号をテストコードのコメントに使用すると、test-cases.md との対応追跡が困難になる。test-cases.md の TC 番号が正本であることを実装者に明示する必要がある。この乖離は test-cases.md が test-case-gen step で tasks.md より後に生成されたことに起因する設計上の成り行きであり、機能的影響はない。
