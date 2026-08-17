# Spec Review Result — guide 正本の正確性硬化 (Round 2)

## 検証した項目

### 前周 finding の解消確認

| 前周 finding | 解消状況 |
|---|---|
| [high] D3: validateInvocation が space-joined compound args.name を処理できず inject topic で false positive violation | **解消済み** — design.md D3 の rationale に `/[| ]/` split の根拠が明記され、tasks.md T-04 の `validateInvocation` コードが `arg.name.split(/[| ]/)` を使用するよう更新された。`rules new` の `args.name = "step-name rule-slug"` を split すると `["step-name", "rule-slug"]` となり、placeholder `"step-name"` が allowed に含まれるため false positive は発生しない |
| [low] tasks.md と test-cases.md の TC 番号体系が乖離 | **部分的に解消** — tasks.md 冒頭に clarification note が追加された。ただし note 内の TC 範囲上限が誤っている（後述 F-01） |

### spec.md 要件カバレッジ

| Requirement | シナリオ数 | TC 対応 | 判定 |
|---|---|---|---|
| review topic SHALL describe request.md as canonical | 2 | TC-022, TC-023 | ✓ |
| audit topic SHALL position issue comparison as transcription-audit concern | 2 | TC-024, TC-025 | ✓ |
| escalation topic cancel SHALL use jobId | 2 spec + 1 tasks | TC-026, TC-027, TC-037 | ✓ |
| merge topic SHALL specify 8-char jobId prefix | 1 spec + 1 tasks | TC-028, TC-038 | ✓ |
| jobs topic SHALL NOT contain stale pre-check | 1 | TC-029 | ✓ |
| setup topic init SHALL reflect global config + repository scaffold | 1 | TC-030 | ✓ |
| runner.ts halt output SHALL include guide link | 1 | TC-031 | ✓ |
| invocation contract SHALL cover triple-backtick code blocks | 2 | TC-032, TC-033 | ✓ |
| invocation contract SHALL fail on placeholder name mismatch | 1 spec + 1 tasks | TC-034, TC-039 | ✓ |
| SKILL.md SHALL NOT mention parallel-request-workflow | 1 | TC-035 | ✓ (要件は正しいが後述 F-02) |
| ADR SHALL reflect actual state | 1 | TC-036 | ✓ (要件は正しいが後述 F-02) |

### design.md 設計整合性

- **D1 guide.ts content fixes** — 6 箇所の修正内容・before/after が明確。`job cancel <jobId>` の CLI 契約（`args: [{name: "jobId"}]`、`VALID_JOB_ID_CHARS = /^[a-f0-9-]+$/`）との整合を command-registry.ts L920-934 で確認
- **D2 runner.ts halt output** — runner.ts L450-452 の `logError`/`logInfo` 出力ブロックを確認。追加箇所が halt 専用 `else` ブロック内であり、drift 検出パスには混入しない
- **D3 invocation contract 拡張（前周修正後）** — inject topic の `specrunner rules new <step-name> <rule-slug>` が split `/[| ]/` で正しく通ることを手動トレースで確認。`resolveCommand` が leaf spec のとき restArgs を受け入れる設計（command-registry.ts L144-146）により、concrete value 例（`specrunner rules new implementer no-inline-comment` 等）も pathTokens に余分なトークンを積んでも leaf が "ok" を返すことを確認
- **D4 ネガティブテスト** — `job cancel <slug>` が positional-name-mismatch を返し、`job cancel <jobId>` が violations=[] を返すことをコードトレースで確認
- **D5/D6 SKILL.md・ADR 修正** — 修正対象箇所と変更内容が対応している

### command spec 照合（guide 例 × registry 手動トレース）

現行および修正後の code block 例を全件確認:

| 例 | 判定 |
|---|---|
| `specrunner job resume <slug> --detach` | path ok, flag "detach" ∈ RUN_JOB_FLAGS, positional "slug" ∈ allowed ✓ |
| `specrunner job wait <slug>` | path ok, positional "slug" ∈ args[0].name="slug" ✓ |
| `specrunner job archive <slug> --with-merge` | path ok, flag "with-merge" ∈ spec.flags ✓ |
| `specrunner job reopen <slug> --from <step> --reason "<理由>"` | path ok, flags "from","reason" ∈ spec.flags, `"<理由>"` は先頭 `"` のため placeholder 非抽出 ✓ |
| `specrunner job prune --force` | path ok, flag "force" ∈ spec.flags ✓ |
| `specrunner job attach --branch <branch>` | path ok, flag "branch" ∈ spec.flags, `<branch>` は flag value placeholder として skip ✓ |
| `specrunner job ls --all` | path ok, flag "all" ∈ spec.flags ✓ |
| `specrunner rules new <step-name> <rule-slug>` | path ok, i=0 "step-name" ∈ split("step-name rule-slug"), i=1 argsSpec[1]=undefined → skip ✓ |
| `specrunner reviewers new <name>` | path ok, "name" ∈ args[0].name="name" ✓ |
| `specrunner config effective --type spec-change` | path ok, flag "type" ∈ spec.flags ✓ |
| `specrunner inbox run --dry-run` | path ok, flag "dry-run" ∈ spec.flags ✓ |
| 修正後: `specrunner job show <slug>`（後片付け 2 段目） | path ok, "slug" ∈ split("jobId\|slug") ✓ |
| 修正後: `specrunner job cancel <jobId> --restore-draft` | path ok, "jobId" ∈ ["jobId"], flag "restore-draft" ∈ spec.flags ✓ |

skip パターン `/[|$>]/` の機能確認:
- `specrunner job start <slug|file> --detach [--issue <n>]` → `|` で skip ✓
- `specrunner job wait <slug> >/dev/null 2>&1` → `>` で skip ✓
- `specrunner request template > specrunner/drafts/<slug>.md` → `>` で skip ✓

### 既存テスト影響確認

- TC-021（escalation body に `specrunner job cancel` と `--restore-draft` が含まれる）— 修正後も `job cancel <jobId> --restore-draft` が body に残るため green 維持 ✓
- TC-012（廃止 skill・コマンドの不在）— SKILL.md の directory 非存在チェックおよび廃止コマンドチェックには影響なし ✓
- TC-011（skill body 10 行以下 + guide reference 存在）— 1 行削除のみ、body 行数制限・guide reference 維持 ✓

---

## 検証できなかった項目

- `typecheck && test` の実際の実行結果（ローカル CI 未実行）
- runner.ts 実際の halt 出力の統合動作（ユニットテストでカバーされるため許容）

---

## Findings 詳細

### F-01: tasks.md clarification note の TC 範囲上限が誤り

tasks.md 冒頭 note が「`test-cases.md` が定義する個別 TC 番号(TC-022〜TC-041)」と記述しているが、test-cases.md の最後の TC は TC-040（typecheck && test gate）であり TC-041 は存在しない。

また T-07 内の「TC-001〜TC-030 全 green」「新規 TC-022〜TC-030 が全て green」は tasks.md 内部グループ番号であり、test-cases.md の実範囲（TC-022〜TC-040）と不一致。note の説明で一応フォローされているが、上限の誤り（TC-041）と組み合わさると混乱を招く。

**修正案**: note 内の `TC-022〜TC-041` を `TC-022〜TC-040` に修正する。

### F-02: TC-035・TC-036 が test-cases.md で automated と宣言されているが tasks.md にテストコードが存在しない

test-cases.md が TC-035（SKILL.md に `parallel-request-workflow` 文字列が存在しないこと）および TC-036（ADR が "tombstone を置いて実質削除する" を含まないこと）を `Category: unit / Priority: must / Automated` と宣言している。

しかし tasks.md 全体を確認した結果:
- T-05（SKILL.md fix）: ファイル変更指示のみ、テストコードなし
- T-06（ADR fix）: ファイル変更指示のみ、テストコードなし
- T-03（pin tests）: TC-022〜TC-027 グループのコードを提供するが TC-035・TC-036 相当はない

既存テストを確認しても TC-035・TC-036 を補うものはない（TC-012 は `parallel-request-workflow` ディレクトリ非存在を確認するが、SKILL.md description 文字列はチェックしない）。

実装者が tasks.md を主な作業指示として従う場合、これら 2 TC に対するテストを書くよう促す記述がない。修正はファイル変更として正しく実施されても、テストが存在しないため後から誰かが逆戻りさせても CI が検出しない。

**修正案**: T-03 または T-05・T-06 に次のテストコードを追加する:

```typescript
it("TC-035: acceptance-and-issue-audit/SKILL.md does not contain parallel-request-workflow", () => {
  const skillPath = path.join(
    __dirname,
    "../../../../.claude/skills/acceptance-and-issue-audit/SKILL.md",
  );
  const content = fs.readFileSync(skillPath, "utf-8");
  expect(content).not.toContain("parallel-request-workflow");
});

it("TC-036: ADR cli-operational-knowledge-registry does not describe tombstone approach", () => {
  const adrPath = path.join(
    __dirname,
    "../../../../specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md",
  );
  const content = fs.readFileSync(adrPath, "utf-8");
  expect(content).not.toContain("tombstone を置いて実質削除する");
});
```
