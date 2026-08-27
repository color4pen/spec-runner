# Spec Review Result — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 参照したファイル

- `specrunner/changes/split-reopen-from-resume/spec.md` — 正式仕様（シナリオ・--reason Note を含む）
- `specrunner/changes/split-reopen-from-resume/tasks.md` — 実装タスク T-01–T-07（spec-fixer 更新後）
- `specrunner/changes/split-reopen-from-resume/test-cases.md` — TC-001–TC-030（30 件）
- `specrunner/changes/split-reopen-from-resume/design.md` — 設計決定 D1–D6
- `specrunner/changes/split-reopen-from-resume/spec-review-result-001.md` — 前周レビュー結果

### 照合したソースファイル（現状把握用）

- `src/state/__tests__/lifecycle-reopen.test.ts` — spec-fixer 後の状態を確認
- `src/core/command/__tests__/reopen-command.test.ts` — spec-fixer 後の状態を確認（全体）
- `src/cli/__tests__/command-registry-reopen.test.ts` — spec-fixer 後の状態を確認（全体）
- `src/store/__tests__/event-journal-operator-event.test.ts` — spec-fixer 後の状態を確認（全体）
- `tests/unit/architecture/core-invariants.test.ts` — B-17 describe コメント（行 1187-1204）
- `src/state/lifecycle.ts` — REOPEN_TRANSITIONS 現状確認

### 前周 6 件の finding 解消状況

| 前周 Finding | 対象 | 解消確認 |
|---|---|---|
| HIGH: TC-002-c が D2 後に失敗する | tasks.md T-01 | ✅ EXCEPTION 節を追加、TC-002-c の変更を明示指示 |
| HIGH: T-06 TC 番号乖離 | tasks.md T-06 | ✅ 包括的な TC 番号マッピングテーブルを追加 |
| MEDIUM: TC-019 Actions test 未定義 | tasks.md T-04 | ✅ Actions YAML 検証テストの実装指示を追加 |
| MEDIUM: TC-017-d 欠如 | tasks.md T-01 | ✅ TC-017-d サブテストの追加指示とサンプルコードを追加 |
| LOW: core-invariants.test.ts prose | tasks.md T-05 | ✅ B-17 describe JSDoc コメント更新指示を追加 |
| LOW: --reason 入力制約なし | spec.md | ✅ "Note: `--reason` input constraints" セクションを追加 |

### 検証項目

1. **spec.md 全文確認**
   - 6 つの Requirement・全シナリオを精査（pipeline 起動しない / 拒否条件 / 証拠保全 / イベント耐久性 / --from 廃止 / resume 単一エントリ / REOPEN_TRANSITIONS 変更 / Actions 2 コマンド化）✓
   - --reason Note セクションが適切に追加されている（前周 Finding 6 の修正）✓

2. **tasks.md T-01 確認**
   - TC-002-c の EXCEPTION 節が正確に記述されている（`has("running")` → `has("awaiting-resume")`、ラベル変更も明示）✓
   - TC-017-d の新規追加指示とサンプルコードが正確である✓
   - `lifecycle-reopen.test.ts` の現状（TC-016 が "running" を対象）と指示内容が一致している✓

3. **tasks.md T-04 確認**
   - Actions YAML テスト（TC-019）の実装指示が追加されている✓
   - テストファイルパス（`tests/unit/workflow/specrunner-dispatch.test.ts`）と確認内容（3 つのアサーション）が明確✓

4. **tasks.md T-05 確認**
   - `core-invariants.test.ts` B-17 describe JSDoc コメント更新指示が追加されている✓
   - 変更前後の prose が明示されており実装者が誤解しにくい✓

5. **tasks.md T-06 確認（重点確認）**
   - reopen-command.test.ts の TC 番号マッピングテーブルが追加されており前周 Finding 2 は解消✓
   - event-journal-operator-event.test.ts の指示（makeOperatorEventLine optional 化、TC-024 fromStep 除去）が追加されている✓
   - command-registry-reopen.test.ts のセクションで TC-004、TC-012、TC-010 の更新指示が追加されている
   - **TC-024（command-registry-reopen.test.ts）の更新指示が欠如している**（後述 Finding 1）

6. **test-cases.md 確認**
   - TC-027（gate test）の内容を確認
   - **TC-027 が旧 TC-003 ラベルを参照している**（後述 Finding 2）

7. **command-registry-reopen.test.ts の現状確認（Finding 1 の根拠検証）**
   - TC-024（行 209-243）が `from: "spec-review"` を flags に含めてハンドラを呼び出し、ARG_ERROR が起きないことを assert していることを確認
   - TC-004-b（行 84-88）が `expect(reopenCmd?.flags?.["from"]).toBeDefined()` をアサートしていることを確認

8. **セキュリティ観点（再確認）**
   - PR ゲートが fail-closed のまま維持されている✓
   - 新規 HTTP エンドポイント・データストア追加なし、新規 OWASP Top 10 リスクなし✓
   - --reason は journal に記録されるが XSS リスクなし（CLI コンテキスト）、spec.md Note に記録済✓

---

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実行（実装はまだ行われていないため型エラー・テスト失敗の実機確認は不能）
- Actions YAML テスト（TC-019）の動的挙動確認（テストが未実装のため）
- `fold()` の `fromStep?: string` graceful handling の実機確認（実装後に検証）

---

## Findings 詳細

### Finding 1 (MEDIUM): tasks.md T-06 の command-registry-reopen.test.ts 節が TC-024 を未言及であり、テスト失敗を招く

**対象**: `tasks.md` T-06 / `src/cli/__tests__/command-registry-reopen.test.ts` TC-024

`command-registry-reopen.test.ts` の TC-024（行 209-243）は以下のようにハンドラを呼び出している:

```typescript
await handler!(
  makeParsedArgs({
    flags: {
      from: "spec-review",  // ← --from を提供
      reason: "post-review fix",
    },
  }),
);
// ...
expect(msg).not.toMatch(/ARG_ERROR/);  // ← ARG_ERROR が起きないことを assert
```

T-03 が `--from` を `reopen` subcommand から除去し、TC-012 が「`--from` を渡すと ARG_ERROR」となることを要求するため、TC-024 の `from: "spec-review"` も ARG_ERROR パスを踏む。

- CLI パーサが未知フラグを拒否する実装 → TC-024 の `from: "spec-review"` が ARG_ERROR
- ハンドラが明示的に `--from` の存在を検査する実装（TC-012 のため必要）→ 同様に TC-024 が ARG_ERROR

どちらの実装でも TC-024 は失敗し、T-07 acceptance criteria「`bun run test` exits 0」を満たせない。

tasks.md T-06 の `command-registry-reopen.test.ts` 節は TC-004、TC-012、TC-010 を記述しているが、TC-024 の更新指示が存在しない。

**必要な修正**: tasks.md T-06 の `command-registry-reopen.test.ts` 節に TC-024 の更新指示を追加すること。`flags` から `from: "spec-review"` を除去し、`reason: "post-review fix"` のみで呼び出すよう変更する指示が必要。

---

### Finding 2 (LOW): test-cases.md TC-027 が tasks.md T-06 でリネームされる TC-003 を参照している

**対象**: `test-cases.md` TC-027（行 383）/ `tasks.md` T-06

tasks.md T-06 の TC 番号マッピングテーブルは `reopen-command.test.ts` の旧 TC-003（ResumeCommand pin）を TC-015 にリネームすることを明示指示している:

```
| TC-003 (ResumeCommand pin) | TC-015 | Resume directly on awaiting-archive is still refused |
```

T-06 の実装指示にも「Rename the describe label from `TC-003` to `TC-015`」と記載されている。

しかし test-cases.md TC-027 のゲートテスト確認項目には以下のように記述されている:

```
- `reopen-command.test.ts` TC-003 (ResumeCommand rejects `awaiting-archive`) still passes
```

リネーム後は `reopen-command.test.ts` に TC-003 は存在しなくなるため、この参照は陳腐化する。gate TC なのでテスト結果自体には影響しないが、spec 文書内の一貫性が損なわれ、実装者が混乱する可能性がある。

**必要な修正**: test-cases.md TC-027 の確認項目を `reopen-command.test.ts TC-003` → `reopen-command.test.ts TC-015` に更新すること。
