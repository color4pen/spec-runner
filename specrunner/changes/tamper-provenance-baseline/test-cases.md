# Test Cases: bite-evidence tamper 判定の provenance 化

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 28
- **Manual**: 0
- **Priority**: must: 24, should: 3, could: 1

---

## Spec Scenario 由来テストケース（認可経路 — 非 tamper）

### TC-001: spec-fixer の正規編集は tamper 扱いにならない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence は認可された変更経路による test-cases.md の変更を tamper としない > Scenario: spec-fixer の正規編集は tamper 扱いにならない

---

### TC-002: operator 適用による変更は tamper 扱いにならない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence は認可された変更経路による test-cases.md の変更を tamper としない > Scenario: operator 適用による変更は tamper 扱いにならない

---

## Spec Scenario 由来テストケース（非認可経路 — fail-closed）

### TC-003: 非所有 step に帰属する変更は failed

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence は認可経路で説明できない test-cases.md の変更を fail-closed にする > Scenario: 非所有 step に帰属する変更は failed

---

### TC-004: 証跡外の未 commit 書き換えは failed

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence は認可経路で説明できない test-cases.md の変更を fail-closed にする > Scenario: 証跡外の未 commit 書き換えは failed

---

## Spec Scenario 由来テストケース（durable 証跡）

### TC-005: lineage 記録が欠落しても durable な commit 帰属で認可済みと判定する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence の tamper 判定は durable な commit 帰属を証跡とする > Scenario: lineage 記録が欠落しても durable な commit 帰属で認可済みと判定する

---

## Spec Scenario 由来テストケース（証跡導出不能 → proceed）

### TC-006: provenance を導出できない runtime では tamper で halt しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence は provenance 証跡を導出できないとき proceed する > Scenario: provenance を導出できない runtime では tamper で halt しない

---

## Port method: lastCommitTouchingPath（T-01）

### TC-007: local runtime が対象 path の最終変更 commit subject を found で返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 実 git repo があり、`test-cases.md` を最後に変更した commit の subject が `spec-fixer: my-slug` である
**WHEN** `LocalRuntime.lastCommitTouchingPath("specrunner/changes/my-slug/test-cases.md", cwd)` を呼び出す
**THEN** `{ kind: "found", oid: <sha>, subject: "spec-fixer: my-slug" }` が返る（throw しない）

---

### TC-008: local runtime が履歴を持たない path に none を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 実 git repo があり、指定 path が一度も commit に含まれていない（`git log` の出力が空）
**WHEN** `LocalRuntime.lastCommitTouchingPath("<未変更 path>", cwd)` を呼び出す
**THEN** `{ kind: "none" }` が返る（throw しない）

---

### TC-009: local runtime が非 0 exit / spawn error で unavailable を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** git コマンドが非 0 exit またはスポーンエラーを起こす（不正な cwd 等）
**WHEN** `LocalRuntime.lastCommitTouchingPath(path, cwd)` を呼び出す
**THEN** `{ kind: "unavailable", reason: <message> }` が返る（throw しない）

---

### TC-010: managed runtime が常に unavailable を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** ManagedRuntime のインスタンスがある（local worktree 不在の構造的制約）
**WHEN** `ManagedRuntime.lastCommitTouchingPath(path, cwd)` を呼び出す
**THEN** 常に `{ kind: "unavailable", reason: <local worktree 不在の旨> }` が返る

---

### TC-011: RealRuntimeStrategy 交差型に新 method が必須追加されて typecheck が通る

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01

**GIVEN** `RuntimeStrategy` port に `lastCommitTouchingPath` が optional で追加され、`RealRuntimeStrategy` 交差型に required で追加されている
**WHEN** `bun run typecheck` を実行する
**THEN** compile error なく green になる（LocalRuntime / ManagedRuntime 双方が method を実装していることが静的に強制される）

---

## checkTamperStatus 純粋関数の分岐（T-02）

### TC-012: evidenceAvailable === false のとき inconclusive を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `checkTamperStatus` の入力に `{ evidenceAvailable: false, worktreeDirty: false, lastCanonCommitToken: "spec-fixer", authorizedWriters: new Set(["spec-fixer"]) }` を与える
**WHEN** `checkTamperStatus(input)` を呼び出す
**THEN** `{ status: "inconclusive" }` が返る（provenance 導出不能 → proceed、fail-closed 発火しない）

---

### TC-013: worktreeDirty === true のとき mismatch を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `checkTamperStatus` の入力に `{ evidenceAvailable: true, worktreeDirty: true, lastCanonCommitToken: "spec-fixer", authorizedWriters: new Set(["spec-fixer"]) }` を与える
**WHEN** `checkTamperStatus(input)` を呼び出す
**THEN** `{ status: "mismatch" }` が返る（証跡外の書き換え → fail-closed）

---

### TC-014: lastCanonCommitToken === null のとき inconclusive を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `checkTamperStatus` の入力に `{ evidenceAvailable: true, worktreeDirty: false, lastCanonCommitToken: null, authorizedWriters: new Set(["spec-fixer", "test-case-gen", "operator-apply"]) }` を与える
**WHEN** `checkTamperStatus(input)` を呼び出す
**THEN** `{ status: "inconclusive" }` が返る（commit 履歴なし → proceed）

---

### TC-015: lastCanonCommitToken が authorizedWriters に含まれるとき match を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `checkTamperStatus` の入力に `{ evidenceAvailable: true, worktreeDirty: false, lastCanonCommitToken: "spec-fixer", authorizedWriters: new Set(["spec-fixer", "test-case-gen", "operator-apply"]) }` を与える
**WHEN** `checkTamperStatus(input)` を呼び出す
**THEN** `{ status: "match" }` が返る（認可された出自 → proceed）

---

### TC-016: lastCanonCommitToken が authorizedWriters に含まれないとき mismatch を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `checkTamperStatus` の入力に `{ evidenceAvailable: true, worktreeDirty: false, lastCanonCommitToken: "implementer", authorizedWriters: new Set(["spec-fixer", "test-case-gen", "operator-apply"]) }` を与える
**WHEN** `checkTamperStatus(input)` を呼び出す
**THEN** `{ status: "mismatch" }` が返る（認可外の出自 → fail-closed）

---

## authorizedCanonWriterSteps 導出 helper（T-02）

### TC-017: authorizedCanonWriterSteps が標準 pipeline で test-case-gen / spec-fixer / operator-apply を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** 標準 pipeline descriptor が存在し、`test-cases.md` を `writes()` で宣言する step として `test-case-gen` と `spec-fixer` がある
**WHEN** `authorizedCanonWriterSteps("<slug>/test-cases.md", state, deps)` を呼び出す
**THEN** 返り値の集合が少なくとも `{ "test-case-gen", "spec-fixer", "operator-apply" }` を含む

---

## parseCommitToken helper（T-02）

### TC-018: parseCommitToken が `spec-fixer: <slug>` から "spec-fixer" を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `subject = "spec-fixer: my-slug"`, `slug = "my-slug"`
**WHEN** `parseCommitToken(subject, slug)` を呼び出す
**THEN** `"spec-fixer"` が返る

---

### TC-019: parseCommitToken が `operator-apply: <slug>` から "operator-apply" を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `subject = "operator-apply: my-slug"`, `slug = "my-slug"`
**WHEN** `parseCommitToken(subject, slug)` を呼び出す
**THEN** `"operator-apply"` が返る

---

### TC-020: parseCommitToken が cross-slug subject に null を返す（slug 不一致 → 認可外）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `subject = "spec-fixer: other-slug"`, `slug = "my-slug"`（slug が異なる）
**WHEN** `parseCommitToken(subject, slug)` を呼び出す
**THEN** `null` が返る（cross-slug 誤認防止 — 呼び出し側が mismatch として扱う）

---

### TC-021: parseCommitToken が `: ` を含まない非準拠 subject に null を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `subject = "initial commit"` のように `<token>: <slug>` 形式でない subject、`slug = "my-slug"`
**WHEN** `parseCommitToken(subject, slug)` を呼び出す
**THEN** `null` が返る（非準拠 subject は認可外扱いに倒す）

---

## gate reason と既存テスト互換（T-03 / T-04）

### TC-022: gate の tamper mismatch reason が provenance を反映し /tamper/i に一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `runBiteEvidenceGate` に `{ tamperStatus: "mismatch", ... }` を渡す（forward-strategy job）
**WHEN** gate を実行する
**THEN** 結果の `verdict` が `"failed"` で、`reason` が正規表現 `/tamper/i` に一致する文字列を含む（例: "tamper detected: current test-cases.md is not attributable to an authorized change path"）

---

### TC-023: evidence-base-gate / gate-empty-selection の既存テストが無変更で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03, T-04

**GIVEN** `src/core/step/bite-evidence/__tests__/evidence-base-gate.test.ts` および `gate-empty-selection.test.ts` が、生の `tamperStatus: "mismatch"` / `"inconclusive"` を gate に渡す形で記述されている（TamperStatus union と gate routing が不変のため）
**WHEN** `bun run test` を実行する
**THEN** これらのファイルを **無変更のまま** 全テストが green になる（D4 の「内部語彙と routing を安定に保つ」の確認）

---

### TC-024: gate.test.ts の TC-032 が新 checkTamperStatus signature に更新される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `gate.test.ts` の TC-032 群が旧 `checkTamperStatus(lineage, currentHash)` 呼び出しを持つ
**WHEN** 新 signature `checkTamperStatus({ authorizedWriters, lastCanonCommitToken, worktreeDirty, evidenceAvailable })` に更新して `bun run test` を実行する
**THEN** TC-032 のすべてのケースが新入力形式で green になる（match / mismatch / inconclusive の各分岐を新 API で固定）

---

### TC-025: lineage 記録が欠落しても durable commit 帰属が取得できれば match になる（偽陽性なし）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** fake runtime で `lastCommitTouchingPath` が `{ kind: "found", subject: "spec-fixer: my-slug" }` を返し、`listWorktreeChanges` が `test-cases.md` を含まないクリーンな結果を返す。かつ events.jsonl には spec-fixer の lineage record が存在しない（appendLineage のベストエフォート失敗を模倣）
**WHEN** `checkTamperStatus` を呼び出す（または `BiteEvidenceStep.run` を実行する）
**THEN** tamper 判定が `match`（認可済み）となり、gate で tamper による `failed` verdict が発火しない

---

### TC-026: runtimeStrategy が不在のとき inconclusive → gate が tamper で halt しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `BiteEvidenceStep.run` の `deps.runtimeStrategy` が `null` または `undefined` であり、新 port method `lastCommitTouchingPath` も `listWorktreeChanges` も呼び出せない
**WHEN** `BiteEvidenceStep.run` を実行する
**THEN** tamper 判定が `inconclusive` となり、gate は tamper による `failed` を発火せず strategy-deferred または通常評価へ進行する（D3: 導出不能 → proceed）

---

## Design-derived テストケース（D3 / D5 / T-03 リスク対処）

### TC-027: authorizedWriters が空集合または導出不能のとき evidenceAvailable=false で inconclusive になる

**Category**: unit
**Priority**: should
**Source**: design.md > D5, tasks.md > T-03

**GIVEN** `authorizedCanonWriterSteps` が空集合を返す（pipeline descriptor に所有 step がない、または例外発生）
**WHEN** `step.ts` の provenance 入力計算ブロックがこの結果を処理する
**THEN** `evidenceAvailable` が `false` に倒れ、`checkTamperStatus` に `{ evidenceAvailable: false }` が渡されて `inconclusive` となる（fail-closed ではなく fail-open に倒す）

---

### TC-028: step.ts の tamper 計算全体が例外を throw した場合 inconclusive に倒れる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `lastCommitTouchingPath` 呼び出しが予期せず例外を throw する
**WHEN** `BiteEvidenceStep.run` の tamper 計算ブロック（try/catch で包まれた全体）を実行する
**THEN** 例外がキャッチされ `tamperStatus` が `"inconclusive"` となる。gate はこれを受け tamper による `failed` を発火しない（best-effort 継続）

---

## Result

```yaml
result: completed
total: 28
automated: 28
manual: 0
must: 24
should: 3
could: 1
blocked_reasons: []
```
