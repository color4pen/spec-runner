# Test Cases: implement-delta-merge

## Overview

delta spec → baseline spec マージ機能のテストケース。
`parseDeltaSpec` / `parseBaselineSpec` / `validateDeltaSpec` / `applyMerge` / `renderBaselineSpec` /
`createNewBaselineSpec` / `mergeSpecsForChange` / `paths.ts` 拡張 / orchestrator 統合 を網羅する。

---

## TC-SM-001: FinishFs に readFile が追加されている

- **Category**: types
- **Priority**: must
- **Source**: Task 1, 受け入れ基準

```
GIVEN  src/core/finish/types.ts を import する
WHEN   FinishFs インターフェースの readFile プロパティを参照する
THEN   readFile(path: string): Promise<string> が型として定義されている
AND    既存の exists / readdir / stat / mkdir / writeFile / unlink は変更されていない
```

---

## TC-SM-002: specsDirRel() が正しいパスを返す

- **Category**: paths
- **Priority**: must
- **Source**: Task 2, 受け入れ基準

```
GIVEN  src/util/paths.ts から specsDirRel をインポートする
WHEN   specsDirRel() を呼ぶ
THEN   "specrunner/specs" を返す（先頭スラッシュなし、末尾スラッシュなし）
```

---

## TC-SM-003: baselineSpecPath() が capability 別パスを返す

- **Category**: paths
- **Priority**: must
- **Source**: Task 2, 受け入れ基準

```
GIVEN  src/util/paths.ts から baselineSpecPath をインポートする
WHEN   baselineSpecPath("cli-commands") を呼ぶ
THEN   "specrunner/specs/cli-commands/spec.md" を返す
```

---

## TC-SM-004: baselineSpecPath() がスラッシュを含む capability を正しく扱う

- **Category**: paths
- **Priority**: should
- **Source**: Task 2

```
GIVEN  baselineSpecPath に任意の文字列 capability を渡す
WHEN   baselineSpecPath("some-long-capability-name") を呼ぶ
THEN   "specrunner/specs/some-long-capability-name/spec.md" を返す
AND    TC-034 制約（他 src/ モジュールの import 禁止）を paths.ts が遵守している
```

---

## TC-SM-010: parseDeltaSpec — ADDED のみのデルタをパースする

- **Category**: parser
- **Priority**: must
- **Source**: Task 3a, 要件 1, テスト要件（ADDED ケース）

```
GIVEN  ## ADDED Requirements セクションのみを含む delta spec テキスト
         （例: "## ADDED Requirements\n\n### Requirement: Foo\n\ncontent\n"）
WHEN   parseDeltaSpec(content) を呼ぶ
THEN   added に name="Foo", content がヘッダ行を含むブロック全体の RequirementBlock が入る
AND    modified は空配列
AND    removed は空配列
```

---

## TC-SM-011: parseDeltaSpec — 3 セクション全部あるデルタをパースする

- **Category**: parser
- **Priority**: must
- **Source**: Task 3a, 要件 1, テスト要件（複合ケース）

```
GIVEN  ## ADDED Requirements / ## MODIFIED Requirements / ## REMOVED Requirements の
       3 セクションを含む delta spec テキスト（各セクションに 1 件以上の Requirement）
WHEN   parseDeltaSpec(content) を呼ぶ
THEN   added / modified / removed それぞれに対応する RequirementBlock が入る
AND    各ブロックの name は "### Requirement:" 以降のテキスト（trim 済み）
AND    各ブロックの content はヘッダ行を含むブロック全体のテキスト
```

---

## TC-SM-012: parseDeltaSpec — 空文字列を渡す

- **Category**: parser
- **Priority**: must
- **Source**: Task 3a

```
GIVEN  空文字列 ""
WHEN   parseDeltaSpec("") を呼ぶ
THEN   { added: [], modified: [], removed: [] } を返す
```

---

## TC-SM-013: parseDeltaSpec — セクション内に複数の Requirement ブロックがある

- **Category**: parser
- **Priority**: must
- **Source**: Task 3a, 要件 1

```
GIVEN  ## ADDED Requirements セクション内に ### Requirement: A と ### Requirement: B の
       2 つのブロックを含む delta spec テキスト
WHEN   parseDeltaSpec(content) を呼ぶ
THEN   added の length が 2
AND    added[0].name === "A", added[1].name === "B"
AND    各 content は次の Requirement ヘッダの直前まで（前後の空行を含む）
```

---

## TC-SM-014: parseDeltaSpec — セクション名は大文字小文字を区別する

- **Category**: parser
- **Priority**: should
- **Source**: Task 3a, 要件 1（"## ADDED Requirements" と固定表記）

```
GIVEN  "## added requirements" と小文字で書かれたセクション
WHEN   parseDeltaSpec(content) を呼ぶ
THEN   added は空配列（マッチしない）
```

---

## TC-SM-020: parseBaselineSpec — 標準的な baseline をパースする

- **Category**: parser
- **Priority**: must
- **Source**: Task 3b, 要件 2

```
GIVEN  "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: A\n\ncontent A\n\n### Requirement: B\n\ncontent B\n"
       の baseline spec テキスト
WHEN   parseBaselineSpec(content) を呼ぶ
THEN   preamble は "## Purpose\n\nTBD\n\n" を含む
AND    requirements の length が 2
AND    requirements[0].name === "A", requirements[1].name === "B"
AND    postamble は空文字列
```

---

## TC-SM-021: parseBaselineSpec — Requirements セクションがない場合

- **Category**: parser
- **Priority**: must
- **Source**: Task 3b

```
GIVEN  "## Purpose\n\nTBD\n" のみで ## Requirements のない baseline テキスト
WHEN   parseBaselineSpec(content) を呼ぶ
THEN   requirements は空配列
AND    preamble にテキスト全体が入る
AND    postamble は空文字列
```

---

## TC-SM-022: parseBaselineSpec — postamble がある場合

- **Category**: parser
- **Priority**: should
- **Source**: Task 3b（"同レベル以上のセクションがあれば postamble に保持"）

```
GIVEN  ## Requirements セクションの後に ## See Also セクションが続く baseline テキスト
WHEN   parseBaselineSpec(content) を呼ぶ
THEN   requirements に Requirements 内のブロックが入る
AND    postamble に ## See Also 以降のテキストが入る
```

---

## TC-SM-023: parseBaselineSpec — 空文字列を渡す

- **Category**: parser
- **Priority**: should
- **Source**: Task 3b

```
GIVEN  空文字列 ""
WHEN   parseBaselineSpec("") を呼ぶ
THEN   { preamble: "", requirements: [], postamble: "" } を返す
```

---

## TC-SM-030: validateDeltaSpec — 正常な delta はエラーなし

- **Category**: validation
- **Priority**: must
- **Source**: Task 3c, 要件 4

```
GIVEN  各セクション内で Requirement 名が一意、かつクロスセクション競合なしの DeltaSpec
WHEN   validateDeltaSpec(delta) を呼ぶ
THEN   空配列 [] を返す（エラーなし）
```

---

## TC-SM-031: validateDeltaSpec — ADDED 内に同名 Requirement が重複する

- **Category**: validation
- **Priority**: must
- **Source**: Task 3c, 要件 4（セクション内の Requirement 名重複）, Task 6c

```
GIVEN  added に name="Foo" の RequirementBlock が 2 件ある DeltaSpec
WHEN   validateDeltaSpec(delta) を呼ぶ
THEN   エラー配列の length >= 1
AND    エラーメッセージに "Foo" が含まれる
```

---

## TC-SM-032: validateDeltaSpec — MODIFIED 内に同名 Requirement が重複する

- **Category**: validation
- **Priority**: must
- **Source**: Task 3c, 要件 4

```
GIVEN  modified に name="Bar" の RequirementBlock が 2 件ある DeltaSpec
WHEN   validateDeltaSpec(delta) を呼ぶ
THEN   エラー配列の length >= 1
AND    エラーメッセージに "Bar" が含まれる
```

---

## TC-SM-033: validateDeltaSpec — ADDED と MODIFIED に同名（クロスセクション競合）

- **Category**: validation
- **Priority**: must
- **Source**: Task 3c, 要件 4（クロスセクション競合）, Task 6c, design.md Error Cases

```
GIVEN  added に name="Foo" が 1 件、modified にも name="Foo" が 1 件ある DeltaSpec
WHEN   validateDeltaSpec(delta) を呼ぶ
THEN   エラー配列の length >= 1
AND    エラーメッセージに "Foo" とクロスセクション競合を示す文言が含まれる
```

---

## TC-SM-034: validateDeltaSpec — ADDED と REMOVED に同名（クロスセクション競合）

- **Category**: validation
- **Priority**: must
- **Source**: Task 3c, 要件 4

```
GIVEN  added に name="Foo" が 1 件、removed にも name="Foo" が 1 件ある DeltaSpec
WHEN   validateDeltaSpec(delta) を呼ぶ
THEN   エラー配列の length >= 1
AND    エラーメッセージに "Foo" が含まれる
```

---

## TC-SM-035: validateDeltaSpec — MODIFIED と REMOVED に同名（クロスセクション競合）

- **Category**: validation
- **Priority**: should
- **Source**: Task 3c, 要件 4

```
GIVEN  modified に name="Foo" が 1 件、removed にも name="Foo" が 1 件ある DeltaSpec
WHEN   validateDeltaSpec(delta) を呼ぶ
THEN   エラー配列の length >= 1
AND    エラーメッセージに "Foo" が含まれる
```

---

## TC-SM-040: applyMerge — ADDED で新規 Requirement を末尾追加

- **Category**: merge
- **Priority**: must
- **Source**: Task 3d, 要件 3（ADDED → 末尾追加）, Task 6d

```
GIVEN  baseline に Requirement "Existing" が 1 件ある BaselineSpec
AND    delta の added に name="NewReq", content="### Requirement: NewReq\n\nbody\n" の 1 件
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: true, merged: string } を返す
AND    merged の Requirements セクション末尾に "NewReq" のブロックが追加されている
AND    "Existing" のブロックは変更されていない
```

---

## TC-SM-041: applyMerge — MODIFIED で既存 Requirement を差し替え

- **Category**: merge
- **Priority**: must
- **Source**: Task 3d, 要件 3（MODIFIED → 同名ブロック差し替え）, Task 6d

```
GIVEN  baseline に Requirement "Target" (content="old body") が 1 件ある BaselineSpec
AND    delta の modified に name="Target", content="### Requirement: Target\n\nnew body\n" の 1 件
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: true, merged: string } を返す
AND    merged に "new body" が含まれる
AND    merged に "old body" が含まれない
```

---

## TC-SM-042: applyMerge — REMOVED で既存 Requirement を削除

- **Category**: merge
- **Priority**: must
- **Source**: Task 3d, 要件 3（REMOVED → 削除）, Task 6d

```
GIVEN  baseline に Requirement "ToRemove" と "KeepMe" の 2 件がある BaselineSpec
AND    delta の removed に name="ToRemove" の 1 件
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: true, merged: string } を返す
AND    merged に "ToRemove" が含まれない
AND    merged に "KeepMe" が含まれる
```

---

## TC-SM-043: applyMerge — ADDED + MODIFIED + REMOVED の複合デルタ

- **Category**: merge
- **Priority**: must
- **Source**: Task 3d, テスト要件（複合ケース）, Task 6d

```
GIVEN  baseline に Requirement "Keep" / "Modify" / "Delete" の 3 件がある BaselineSpec
AND    delta.removed = [{ name: "Delete" }]
AND    delta.modified = [{ name: "Modify", content: "updated" }]
AND    delta.added = [{ name: "NewOne" }]
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: true, merged: string } を返す
AND    merged に "Keep" が含まれる
AND    merged に "Delete" が含まれない
AND    merged に "updated" が含まれる
AND    merged に "NewOne" が含まれる
AND    Requirements セクションの最後のブロックが "NewOne"（ADDED は末尾追加）
```

---

## TC-SM-044: applyMerge — MODIFIED 対象が baseline に存在しない → エラー

- **Category**: merge
- **Priority**: must
- **Source**: Task 3d, 要件 3（MODIFIED 存在しない場合はエラー）, Task 6d

```
GIVEN  baseline に Requirement "Existing" のみある BaselineSpec
AND    delta の modified に name="NonExistent" の 1 件
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: false, errors: string[] } を返す
AND    errors[0] に "NonExistent" が含まれる
```

---

## TC-SM-045: applyMerge — REMOVED 対象が baseline に存在しない → エラー

- **Category**: merge
- **Priority**: must
- **Source**: Task 3d, 要件 3（REMOVED 存在しない場合はエラー）, Task 6d

```
GIVEN  baseline に Requirement "Existing" のみある BaselineSpec
AND    delta の removed に name="Ghost" の 1 件
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: false, errors: string[] } を返す
AND    errors[0] に "Ghost" が含まれる
```

---

## TC-SM-046: applyMerge — ADDED 対象が baseline に既存在 → エラー

- **Category**: merge
- **Priority**: must
- **Source**: Task 3d, 要件 3（ADDED 既存名はエラー）, Task 6d

```
GIVEN  baseline に Requirement "AlreadyHere" がある BaselineSpec
AND    delta の added に name="AlreadyHere" の 1 件
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: false, errors: string[] } を返す
AND    errors[0] に "AlreadyHere" が含まれる
```

---

## TC-SM-047: applyMerge — REMOVED 後に ADDED 同名は成功（適用順序保証）

- **Category**: merge
- **Priority**: should
- **Source**: Task 3d, design.md D3（REMOVED → MODIFIED → ADDED の順序）

```
GIVEN  baseline に Requirement "Flip" がある BaselineSpec
AND    delta.removed = [{ name: "Flip" }]
AND    delta.added = [{ name: "Flip", content: "new version" }]
WHEN   applyMerge(baseline, delta) を呼ぶ
THEN   { ok: true, merged: string } を返す（REMOVED 後に ADDED なのでエラーにならない）
AND    merged に "new version" が含まれる
```

---

## TC-SM-050: renderBaselineSpec — preamble + requirements + postamble を再構築する

- **Category**: render
- **Priority**: must
- **Source**: Task 3e

```
GIVEN  preamble="## Purpose\n\nTBD\n\n"
       requirements=[{ name: "A", content: "### Requirement: A\n\nbody\n" }]
       postamble="" の BaselineSpec
WHEN   renderBaselineSpec(spec) を呼ぶ
THEN   "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: A\n\nbody\n" を返す
AND    末尾に trailing newline が保証されている
```

---

## TC-SM-051: renderBaselineSpec — trailing newline が保証される

- **Category**: render
- **Priority**: must
- **Source**: Task 3e（"末尾に trailing newline を保証"）

```
GIVEN  requirements が空の BaselineSpec
WHEN   renderBaselineSpec(spec) を呼ぶ
THEN   返り値の末尾が "\n" で終わる
```

---

## TC-SM-060: createNewBaselineSpec — ADDED ブロックから新規 baseline を生成する

- **Category**: new-capability
- **Priority**: must
- **Source**: Task 3f, 要件 5, Task 6e

```
GIVEN  added = [{ name: "NewReq", content: "### Requirement: NewReq\n\nbody\n" }]
WHEN   createNewBaselineSpec(added) を呼ぶ
THEN   "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: NewReq\n\nbody\n" を含む文字列を返す
AND    末尾に trailing newline がある
```

---

## TC-SM-061: createNewBaselineSpec — 複数の ADDED ブロックを含む新規 baseline

- **Category**: new-capability
- **Priority**: should
- **Source**: Task 3f

```
GIVEN  added に 2 件の RequirementBlock がある
WHEN   createNewBaselineSpec(added) を呼ぶ
THEN   ## Requirements セクションに 2 件のブロックが含まれる
AND    順序が added 配列の順と同じ
```

---

## TC-SM-070: mergeSpecsForChange — specs/ がない change folder はスキップ

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, Task 7（skip ケース）, 要件 6, 受け入れ基準

```
GIVEN  fs.exists が changeFolderPath(slug) + "/specs/" に対して false を返す
WHEN   mergeSpecsForChange({ slug, cwd, spawn, fs }) を呼ぶ
THEN   { ok: true, skipped: true, message: string } を返す
AND    fs.readFile は呼ばれない
AND    spawn は呼ばれない
```

---

## TC-SM-071: mergeSpecsForChange — ADDED 成功: baseline に追記し git add 実行

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, Task 7（ADDED 成功）, 要件 3, 受け入れ基準

```
GIVEN  change folder に specs/my-cap/spec.md（ADDED 1 件の delta spec）が存在する
AND    specrunner/specs/my-cap/spec.md（baseline spec）が存在し Requirements に 1 件ある
AND    spawn は exitCode: 0 を返す
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: true, skipped: false, message: string } を返す
AND    fs.writeFile が baselineSpecPath("my-cap") を引数に呼ばれる
AND    writeFile の content が ADDED のブロックを含む
AND    spawn の最後の呼び出しが "git", ["add", "specrunner/specs/"] の形式
```

---

## TC-SM-072: mergeSpecsForChange — MODIFIED 成功: 既存 Requirement を差し替え

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, Task 7（MODIFIED 成功）

```
GIVEN  delta spec が MODIFIED 1 件（name="Target"）を含む
AND    baseline に "Target" が存在する
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: true, skipped: false } を返す
AND    writeFile の content に更新後の "Target" ブロックが含まれる
AND    旧 "Target" の content は含まれない
```

---

## TC-SM-073: mergeSpecsForChange — REMOVED 成功: 既存 Requirement を削除

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, Task 7（REMOVED 成功）

```
GIVEN  delta spec が REMOVED 1 件（name="Gone"）を含む
AND    baseline に "Gone" が存在する
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: true, skipped: false } を返す
AND    writeFile の content に "Gone" が含まれない
```

---

## TC-SM-074: mergeSpecsForChange — ADDED + MODIFIED + REMOVED の複合成功

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, Task 7（複合成功）, テスト要件

```
GIVEN  delta spec が ADDED/MODIFIED/REMOVED を 1 件ずつ含む
AND    baseline が MODIFIED 対象と REMOVED 対象を持つ
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: true, skipped: false } を返す
AND    writeFile が 1 回呼ばれ、3 操作全てが content に反映されている
```

---

## TC-SM-075: mergeSpecsForChange — 新規 capability で ADDED のみ → mkdir + writeFile

- **Category**: new-capability
- **Priority**: must
- **Source**: Task 4, Task 7（新規 capability）, 要件 5, 受け入れ基準

```
GIVEN  change folder の specs/new-cap/spec.md が ADDED 1 件の delta spec
AND    specrunner/specs/new-cap/spec.md が存在しない（fs.exists → false）
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: true, skipped: false } を返す
AND    fs.mkdir が "specrunner/specs/new-cap" のディレクトリ作成で呼ばれる
AND    fs.writeFile が "specrunner/specs/new-cap/spec.md" に対して呼ばれる
AND    writeFile の content が createNewBaselineSpec の出力（## Purpose TBD を含む）
```

---

## TC-SM-076: mergeSpecsForChange — 新規 capability で MODIFIED あり → escalation

- **Category**: new-capability
- **Priority**: must
- **Source**: Task 4, Task 7（新規 capability + MODIFIED）, 要件 5, design.md Error Cases

```
GIVEN  baseline spec が存在しない capability に対して
AND    delta spec が MODIFIED 1 件を含む
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: false, escalation: string, exitCode: 1 } を返す
AND    escalation メッセージに capability 名と "MODIFIED" を示す文言が含まれる
AND    fs.writeFile は呼ばれない
```

---

## TC-SM-077: mergeSpecsForChange — 新規 capability で REMOVED あり → escalation

- **Category**: new-capability
- **Priority**: must
- **Source**: Task 4, design.md Error Cases

```
GIVEN  baseline spec が存在しない capability に対して
AND    delta spec が REMOVED 1 件を含む
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: false, escalation: string, exitCode: 1 } を返す
AND    fs.writeFile は呼ばれない
```

---

## TC-SM-078: mergeSpecsForChange — バリデーションエラーで escalation（書き込みなし）

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, Task 7（バリデーションエラー）, 要件 4, design.md D6

```
GIVEN  delta spec の ADDED セクション内に同名 Requirement が 2 件（重複）
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: false, escalation: string, exitCode: 1 } を返す
AND    fs.writeFile は一切呼ばれない（2-pass 保証）
AND    spawn（git add）は呼ばれない
```

---

## TC-SM-079: mergeSpecsForChange — git add 失敗 → escalation

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, Task 7（git add 失敗）, design.md Error Cases

```
GIVEN  delta/baseline のパースとマージは成功する
AND    spawn("git", ["add", ...]) が exitCode: 1 を返す
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: false, escalation: string, exitCode: 1 } を返す
AND    escalation メッセージに git add 失敗を示す文言が含まれる
```

---

## TC-SM-080: mergeSpecsForChange — 2-pass: 複数 capability の 1 つが invalid → 書き込みゼロ

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, design.md D6（"1 capability でもエラーがあれば書き込みは一切行わない"）

```
GIVEN  change folder の specs/ に cap-a / cap-b の 2 つの capability がある
AND    cap-a は valid な delta spec
AND    cap-b の delta spec は MODIFIED 対象が baseline に存在しない（エラーになる）
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: false, escalation: string, exitCode: 1 } を返す
AND    fs.writeFile は cap-a に対しても呼ばれない（部分適用なし）
AND    spawn は呼ばれない
```

---

## TC-SM-081: mergeSpecsForChange — 複数 capability が全部 valid → 全部書き込んで git add 1 回

- **Category**: orchestration
- **Priority**: must
- **Source**: Task 4, design.md D4（"git add は spec ツリー全体"）

```
GIVEN  change folder の specs/ に cap-a / cap-b の 2 つの capability があり両方 valid
WHEN   mergeSpecsForChange を呼ぶ
THEN   { ok: true, skipped: false } を返す
AND    fs.writeFile が cap-a と cap-b それぞれに対して呼ばれる（合計 2 回）
AND    spawn("git", ["add", "specrunner/specs/"]) が 1 回だけ呼ばれる
```

---

## TC-SM-082: mergeSpecsForChange — escalation メッセージが formatEscalation 準拠

- **Category**: orchestration
- **Priority**: should
- **Source**: Task 4（"escalation のフォーマットが formatEscalation() 準拠"）

```
GIVEN  任意の escalation ケース（例: バリデーションエラー）が発生する
WHEN   mergeSpecsForChange が { ok: false } を返す
THEN   escalation フィールドが formatEscalation() の出力形式（プロジェクト共通フォーマット）に従う
AND    exitCode が 1
```

---

## TC-SM-090: orchestrator — Phase 1 で mergeSpecsForChange が archiveChangeFolder より前に呼ばれる

- **Category**: integration
- **Priority**: must
- **Source**: Task 5, 要件 6, 受け入れ基準（"finish Phase 1 で archive 前にマージが実行される"）

```
GIVEN  finish orchestrator の Phase 1 を実行する（mergeSpecsForChange と archiveChangeFolder を両方モック）
WHEN   runPhase1Archive() 相当の処理が実行される
THEN   mergeSpecsForChange の呼び出しが archiveChangeFolder の呼び出しより先に起きる
AND    Phase 1 の順序が merge → archive → move → commit
```

---

## TC-SM-091: orchestrator — merge 失敗で Phase 1 が escalation 中断（archive 未呼び出し）

- **Category**: integration
- **Priority**: must
- **Source**: Task 5, 受け入れ基準

```
GIVEN  mergeSpecsForChange が { ok: false, escalation: "...", exitCode: 1 } を返す
WHEN   Phase 1 を実行する
THEN   Phase 1 が { ok: false, escalation: string, exitCode: 1 } を返す
AND    archiveChangeFolder は呼ばれない
```

---

## TC-SM-092: orchestrator — merge skip 時にメッセージが stdout に出ない

- **Category**: integration
- **Priority**: must
- **Source**: Task 5（"merge skip 時にメッセージが出ない"）

```
GIVEN  mergeSpecsForChange が { ok: true, skipped: true, message: "..." } を返す
WHEN   Phase 1 を実行する
THEN   stdoutWrite に mergeSpecsForChange の message が渡されない
AND    archiveChangeFolder は通常通り呼ばれる
```

---

## TC-SM-093: orchestrator — merge 成功後 archive が正常に続く

- **Category**: integration
- **Priority**: must
- **Source**: Task 5

```
GIVEN  mergeSpecsForChange が { ok: true, skipped: false, message: "Merged specs" } を返す
AND    archiveChangeFolder が成功する
WHEN   Phase 1 を実行する
THEN   stdoutWrite に "Merged specs" が渡される
AND    archiveChangeFolder が呼ばれ Phase 1 全体が成功する
```

---

## TC-SM-094: 既存テストが全 pass（FinishFs.readFile モック追加後）

- **Category**: integration
- **Priority**: must
- **Source**: Task 1, Task 8

```
GIVEN  Task 1 で FinishFs に readFile を追加した後
WHEN   tests/finish-archive-change-folder.test.ts / finish-move-requests-dir.test.ts /
       finish-orchestrator.test.ts を実行する
THEN   全テストが pass する
AND    makeFs() が readFile を含む（デフォルト: vi.fn().mockResolvedValue("")）
```

---

## TC-SM-095: bun run typecheck / lint / test が全 pass

- **Category**: integration
- **Priority**: must
- **Source**: Task 8, 受け入れ基準

```
GIVEN  全 Task（1〜7）が実装済み
WHEN   bun run typecheck && bun run lint && bun run test を実行する
THEN   typecheck: 型エラー 0 件
AND    lint: lint エラー 0 件
AND    test: 全テスト（既存 + 新規）が pass
```
