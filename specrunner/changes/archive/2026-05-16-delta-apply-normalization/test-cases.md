# Test Cases: delta-apply-normalization

Generated from: request.md / design.md / tasks.md

---

## Category A: request.md 読み込みと type 解析

### TC-SM-090 — request.md 不在で fail
- **Priority**: must
- **Source**: 要件 1, tasks.md TC-SM-090, 受け入れ基準
- **GIVEN** `mergeSpecsForChange` が slug を受け取り、`fs.readFile` が `request.md` path で ENOENT を throw する
- **WHEN** `mergeSpecsForChange(slug, ...)` を呼ぶ
- **THEN** `{ ok: false }` が返り、escalation message に `request.md` の不在を示す文言が含まれる

### TC-SM-091 — request.md parse error で fail
- **Priority**: must
- **Source**: 要件 1, tasks.md TC-SM-091
- **GIVEN** `fs.readFile` が壊れた内容 (title 行欠落など `parseRequestMdContent` が throw するコンテンツ) を返す
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返り、escalation message に parse 失敗の旨が含まれる

### TC-SM-092 — type field 不在で fail
- **Priority**: must
- **Source**: 要件 1, tasks.md TC-SM-092
- **GIVEN** `request.md` が有効な Markdown だが `**type**:` 行が存在しない
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返り、type field 不在を示す escalation message が含まれる

### TC-SM-093 — 未知 type で fail（完全不一致）
- **Priority**: must
- **Source**: 要件 1, 2, tasks.md TC-SM-093
- **GIVEN** `request.md` の type が `TYPE_CONFIG` に含まれない値 (`"unknown-type"`) である
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返り、escalation に当該 type 名を含む文言が出る

### TC-SM-093b — 未知 type で fail（表記揺れ）
- **Priority**: must
- **Source**: 要件 1 "表記揺れは未知 type 扱いで fail"
- **GIVEN** `request.md` の type が `"spec_change"` や `"Spec-Change"` など大文字・アンダースコア揺れの値
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返る（厳密一致のみ受け付ける）

---

## Category B: type 別 skip/fail 判定（specs/ 実質的不在）

### TC-SM-094 — spec-change + specs/ 不在 → fail
- **Priority**: must
- **Source**: 要件 2, tasks.md TC-SM-094, 受け入れ基準
- **GIVEN** type = `"spec-change"` かつ `<change>/specs/` ディレクトリが存在しない
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返り、escalation に「spec を変えると宣言したのに delta が無い」旨が含まれる

### TC-SM-095 — new-feature + specs/ 不在 → fail
- **Priority**: must
- **Source**: 要件 2, tasks.md TC-SM-095, 受け入れ基準
- **GIVEN** type = `"new-feature"` かつ `<change>/specs/` ディレクトリが存在しない
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返る

### TC-SM-096 — bug-fix + specs/ 不在 → 正常 skip
- **Priority**: must
- **Source**: 要件 2, tasks.md TC-SM-096, 受け入れ基準
- **GIVEN** type = `"bug-fix"` かつ `<change>/specs/` ディレクトリが存在しない
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: true, skipped: true }` が返る（エラーなし）

### TC-SM-097 — refactoring + specs/ 不在 → 正常 skip
- **Priority**: must
- **Source**: 要件 2, tasks.md TC-SM-097, 受け入れ基準
- **GIVEN** type = `"refactoring"` かつ `<change>/specs/` ディレクトリが存在しない
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: true, skipped: true }` が返る

### TC-SM-098 — chore + specs/ 不在 → 正常 skip
- **Priority**: must
- **Source**: 要件 2, tasks.md TC-SM-098, 受け入れ基準
- **GIVEN** type = `"chore"` かつ `<change>/specs/` ディレクトリが存在しない
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: true, skipped: true }` が返る

### TC-SM-099 — spec-change + specs/ あり + capability dir 0 件 → fail
- **Priority**: must
- **Source**: 要件 2 "実質的不在の定義 (b)", tasks.md TC-SM-099, 受け入れ基準
- **GIVEN** type = `"spec-change"` かつ `<change>/specs/` ディレクトリは存在するが capability サブディレクトリが 0 件
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返る（空ディレクトリも実質不在として fail）

### TC-SM-102 — bug-fix + specs/ あり + 有効 delta → 正常 apply
- **Priority**: should
- **Source**: 設計判断 4 補足 "bug-fix 等でも spec を変えること自体は許される", tasks.md TC-SM-102
- **GIVEN** type = `"bug-fix"` かつ `<change>/specs/<cap>/spec.md` に有効な delta（MODIFIED 1 件）が存在する
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: true, skipped: false }` が返り、baseline spec への write が実行される

---

## Category C: 空 delta 検出

### TC-SM-100 — capability dir に空 delta → fail
- **Priority**: must
- **Source**: 要件 3, tasks.md TC-SM-100, 受け入れ基準
- **GIVEN** `<change>/specs/<cap>/spec.md` が parse 可能だが added/modified/removed の合計が 0 件
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返り、escalation に当該 capability 名と「empty delta」旨が含まれる

### TC-SM-100b — 空 delta は validateDeltaSpec より前に検出される
- **Priority**: should
- **Source**: design.md "検出タイミング: capability loop 内、parseDeltaSpec 呼び出し直後、validateDeltaSpec の前"
- **GIVEN** 空 delta（added/modified/removed 合計 0）の `spec.md` が存在する
- **WHEN** `mergeSpecsForChange` の内部で処理が進む
- **THEN** `validateDeltaSpec` が呼ばれる前に fail が確定し、format validation は実行されない

---

## Category D: cross-capability atomic apply

### TC-SM-101 — cross-capability: 1 capability fail で全 write が起きない
- **Priority**: must
- **Source**: 要件 4, tasks.md TC-SM-101, 受け入れ基準
- **GIVEN** type = `"spec-change"` かつ `cap-a` に有効 delta、`cap-b` に空 delta（fail 条件）が存在する
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: false }` が返り、`fs.writeFile` が 0 回呼ばれる（cap-a の write も行われない）

### TC-SM-101b — cross-capability: escalation に失敗 capability 名が全て列挙される
- **Priority**: should
- **Source**: 要件 4 "escalation message に「どの capability が、なぜ fail したか」を全部列挙する"
- **GIVEN** 2 capability が同時に fail 条件（例: cap-b 空 delta、cap-c parse error）を満たす
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** escalation message に cap-b と cap-c 両方の名前が含まれる（1 件目で打ち切らない）

### TC-SM-103 — cross-capability: 全 capability 成功で全 write が実行される
- **Priority**: should
- **Source**: 要件 4, 設計判断 5 "Pass 2 は Pass 1 全成功時のみ"
- **GIVEN** type = `"spec-change"` かつ cap-a / cap-b 両方に有効 delta が存在する
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** `{ ok: true }` が返り、両 capability 分の `fs.writeFile` が合計 2 回以上呼ばれる

---

## Category E: 既存テストの回帰防止

### TC-REG-001 — 既存テスト TC-SM-070〜082 が mock 修正後も pass
- **Priority**: must
- **Source**: tasks.md 2.1 "既存テスト修正", design.md "テスト戦略"
- **GIVEN** TC-SM-070〜082 の `fs.readFile` mock に `request.md` の valid content（type = `"bug-fix"`）を追加した
- **WHEN** `bun run test` を実行する
- **THEN** TC-SM-070〜082 が全て pass する（既存挙動が壊れていない）

### TC-REG-002 — TC-SM-070 (specs/ 不在で skip) が bug-fix として維持される
- **Priority**: must
- **Source**: tasks.md 2.1 "TC-SM-070 のみ修正が必要"
- **GIVEN** TC-SM-070 の mock が type = `"bug-fix"` の `request.md` を返す
- **WHEN** `mergeSpecsForChange` を呼ぶ
- **THEN** 従来通り `{ ok: true, skipped: true }` が返る

---

## Category F: spec-fixer system prompt

### TC-PROMPT-001 — buildSpecFixerSystemPrompt() が正規 path を含む
- **Priority**: must
- **Source**: 要件 7, 受け入れ基準
- **GIVEN** `src/prompts/spec-fixer-system.ts` が更新されている
- **WHEN** `buildSpecFixerSystemPrompt()` を呼ぶ
- **THEN** 戻り値に `specs/<capability-name>/spec.md` が含まれる

### TC-PROMPT-002 — buildSpecFixerSystemPrompt() が正規外 path 3 例を禁止として明示
- **Priority**: must
- **Source**: 要件 7, tasks.md Task 5 受け入れ基準
- **GIVEN** `src/prompts/spec-fixer-system.ts` が更新されている
- **WHEN** `buildSpecFixerSystemPrompt()` の戻り値を検査する
- **THEN** `delta-spec.md`（単一フラット形式）、`delta-spec/<capability>.md`（ディレクトリ形式）、`specs/<name>.delta.md`（拡張子付き）の 3 例が禁止として列挙されている

---

## Category G: spec authority（ファイル整合性）

### TC-SPEC-001 — specrunner/specs/spec-merge/spec.md が新設されている
- **Priority**: must
- **Source**: 要件 6, tasks.md Task 3, 受け入れ基準
- **GIVEN** 実装が完了している
- **WHEN** `specrunner/specs/spec-merge/spec.md` を読む
- **THEN** ファイルが存在し、以下が ADDED として含まれる:
  - type 別 skip 条件 (`spec-change`/`new-feature` = fail、`bug-fix`/`refactoring`/`chore` = skip、未知 = fail)
  - 空 delta (added/modified/removed 合計 0) は fail
  - cross-capability apply は atomic
  - 権威ソースは `src/config/type-config.ts` の TYPE_CONFIG

### TC-SPEC-002 — spec-merge/spec.md が 4 Scenarios を含む
- **Priority**: must
- **Source**: 要件 6, tasks.md Task 3
- **GIVEN** `specrunner/specs/spec-merge/spec.md` が存在する
- **WHEN** ファイルを読む
- **THEN** `spec-change` + specs/ 無し → fail、`bug-fix` + specs/ 無し → skip、未知 type → fail、空 delta → fail の 4 Scenario が含まれる

### TC-SPEC-003 — cli-finish-command/spec.md から check 5, 6 が削除されている
- **Priority**: must
- **Source**: 要件 8, tasks.md Task 4, 受け入れ基準
- **GIVEN** `specrunner/specs/cli-finish-command/spec.md` が更新されている
- **WHEN** Phase 0 check 表を読む
- **THEN** `openspec/changes/<slug>/` 実存判定（旧 check 5）と `openspec validate` dry-run（旧 check 6）の行が存在しない

### TC-SPEC-004 — cli-finish-command/spec.md の check 7 から openspec バイナリが除去されている
- **Priority**: must
- **Source**: 要件 8, 受け入れ基準
- **GIVEN** `specrunner/specs/cli-finish-command/spec.md` が更新されている
- **WHEN** 必須バイナリリストを読む
- **THEN** `openspec` が含まれず、`gh` と `git` のみが必須バイナリとして残っている

### TC-SPEC-005 — cli-finish-command/spec.md から openspec validate Scenario が削除されている
- **Priority**: must
- **Source**: 要件 8, 受け入れ基準
- **GIVEN** `specrunner/specs/cli-finish-command/spec.md` が更新されている
- **WHEN** Scenario セクションを読む
- **THEN** `openspec validate fail で escalation` Scenario が存在せず、`バイナリ不在で escalation` に `openspec` の言及がない

### TC-SPEC-006 — cli-finish-command/spec.md の check 番号が正しく振り直されている
- **Priority**: should
- **Source**: tasks.md Task 4 "check 番号を振り直す (旧7→新5、旧8→新6、旧9→新7)"
- **GIVEN** `specrunner/specs/cli-finish-command/spec.md` が更新されている
- **WHEN** Phase 0 check 表を読む
- **THEN** check 1〜7 の連番で欠番がなく、旧 7 が新 5 に対応する内容になっている

### TC-SPEC-007 — delta spec が change folder 配下に配置されている
- **Priority**: must
- **Source**: tasks.md Task 6, 受け入れ基準
- **GIVEN** 実装が完了している
- **WHEN** `specrunner/changes/delta-apply-normalization/specs/` 配下を確認する
- **THEN** `spec-merge/spec.md` と `cli-finish-command/spec.md` の 2 ファイルが存在する

---

## Category H: ビルドと型チェック

### TC-BUILD-001 — typecheck が green
- **Priority**: must
- **Source**: 受け入れ基準 "`bun run typecheck && bun run test` が green"
- **GIVEN** 全実装が完了している
- **WHEN** `bun run typecheck` を実行する
- **THEN** exit 0 で完了し、型エラーが 0 件

### TC-BUILD-002 — test が green
- **Priority**: must
- **Source**: 受け入れ基準
- **GIVEN** 全実装が完了し TC-SM-090〜102 の新規テストが追加されている
- **WHEN** `bun run test` を実行する
- **THEN** exit 0 で完了し、fail テストが 0 件

---

## Summary

| Category | Count | must | should | could |
|----------|-------|------|--------|-------|
| A: request.md 読み込み | 5 | 4 | 0 | 0 |
| B: type 別 skip/fail | 7 | 6 | 1 | 0 |
| C: 空 delta 検出 | 2 | 1 | 1 | 0 |
| D: cross-capability atomic | 3 | 1 | 2 | 0 |
| E: 既存テスト回帰 | 2 | 2 | 0 | 0 |
| F: spec-fixer prompt | 2 | 2 | 0 | 0 |
| G: spec authority | 7 | 6 | 1 | 0 |
| H: ビルド | 2 | 2 | 0 | 0 |
| **合計** | **30** | **24** | **5** | **0** |
