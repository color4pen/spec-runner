# Cross-Boundary Invariants Review — attestation-source-binding — iter 1

## Reviewer

cross-boundary-invariants

## Purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope

対象 diff: `src/core/factcheck-attestation.ts`, `src/core/step/design.ts`, `src/core/step/request-review.ts`, `src/git/source-revision.ts`, `src/prompts/request-review-system.ts`, `tests/unit/step/factcheck-attestation.test.ts`, `src/git/dynamic-context.ts`

---

## Invariant Analysis

### INV-1: `readSourceRevision` が pipeline metadata commit を透過すること（D1/D2 核心）

**前提**: request-review の `enrichContext` は agent 実行前に呼ばれる。request-review の pipeline commit（`commitAndPush` が `git add -A` で commit）は `specrunner/changes/<slug>/` のみを変更する。design の `enrichContext` はその後で同じ `readSourceRevision(cwd)` を呼ぶ。両者が同じ sha を返すことが valid attestation の前提。

**検証結果**: `readSourceRevision` の実装は `:(exclude)specrunner/changes` pathspec を使い、`changesDirRel()` から動的に構築する。`commitAndPush` は request-review agent（read-only、change folder のみ書く）の出力を commit するため、pipeline commit は `specrunner/changes/` のみを変更する。design が読む時点でも同じ sha が返る。TC-SRC および TC-FCA-09 の valid ケース（metadata commit 後に `readSourceRevision` が source commit sha を返すことを実測で確認）が invariant に歯を与えている。**不変条件を破っていない。**

### INV-2: 既存の `evaluateFactCheckAttestation` stale 条件が保存されること

**前提**: `!codeAssertionsVerified` または `requestHash` 不一致で stale になる既存挙動が、source 束縛追加により変わらないこと。

**検証結果**: 判定順序は design D4 の通り: (1) absent, (2) 既存条件 (requestHash/codeAssertionsVerified), (3) sourceRevision 束縛, (4) valid。既存条件がより先に評価されるため保存されている。TC-FCA-04 で requestHash 不一致・codeAssertionsVerified false の各ケースが新シグネチャで green。**不変条件を破っていない。**

### INV-3: `buildFactCheckDirective` の下流インターフェースが不変であること

**前提**: `buildFactCheckDirective(evaluation: AttestationEvaluation): string` の shape は変えない契約。design-system.ts / DynamicContext.factCheckAttestation の投影も変えない。

**検証結果**: `AttestationEvaluation`（`{ status, verifiedAssertions }`）は変更なし。`buildFactCheckDirective` のシグネチャも変更なし。source 束縛は `evaluateFactCheckAttestation` 内部の判定に閉じ、出力 shape に漏れていない。stale 理由文に "source revision" への言及が追加されたが、stale/absent の区別（テストで確認）と "ALL" / "stale" の含有は保たれている。**不変条件を破っていない。**

### INV-4: `DynamicContext.sourceRevision` が他 step に漏れないこと

**前提**: `sourceRevision` は request-review step 専用フィールドとして文書化されており、design step の `enrichContext` は `dynamicContext.sourceRevision` を読まずに `readSourceRevision(cwd)` を直接呼ぶ。他 step への副作用がないこと。

**検証結果**: `design.ts:enrichContext` は `dynamicContext.sourceRevision` を参照せず、ローカル変数 `currentSourceRevision = await readSourceRevision(cwd)` で独立して取得する。各 step の `enrichContext` は `collectDynamicContext` から取得したベースコンテキストを受け取り、累積型ではない。他 step への漏れは構造的に起きない。**不変条件を破っていない。**

### INV-5: fail-safe の一方向性（緩める方向に働かないこと）

**前提**: 信号欠落・不一致はすべて stale（verify-all）に倒れ、決して valid に倒れないこと。

**検証結果**: 以下の全ケースで stale:
- `attestationRaw === null` / parse 失敗 → absent（verify-all と同等）
- `parsed.sourceRevision === undefined`（旧 attestation）
- `currentSourceRevision === null`（git 不可）
- `parsed.sourceRevision !== currentSourceRevision`（不一致）

4 分岐すべてが stale 方向に倒れる。TC-FCA-04 / TC-FCA-09 で網羅テスト済み。**不変条件を破っていない。**

### INV-6: `commitAndPush` (`git add -A`) との相互作用

**前提**: `commitAndPush` は `git add -A` で全変更を stage する。request-review agent が source ファイルを誤って変更した場合、pipeline commit が source ファイルを含み、`readSourceRevision` が request-review 時と異なる sha を返す。

**検証結果**: これは **正当なケース**。request-review agent が source を変更した場合（通常は起きない。agent は read-only 制約下にあり、request-review は `gitWrite: true` だが change folder のみが対象）、その変更は「source 変化」として正しく stale を引き起こす。fail-safe 方向の挙動として適切。**不変条件の違反ではない。**

---

## Findings

### F-01 \[low\] `enrichContext` コメントの不正確さ

- **file**: `src/core/step/request-review.ts:88`
- **description**: コメント「Read source revision in parallel with hash computation」とあるが、実装は sequential (`await readSourceRevision` はハッシュ計算後の順次実行)。ハッシュ計算は同期なので実害なし。
- **impact**: なし（機能的影響ゼロ）。ドキュメント精度の問題のみ。
- **resolution**: コメントを「after hash computation」に修正（任意）。

### F-02 \[low\] TC-FCA-09「旧 attestation」テストが複合条件をテストしている

- **file**: `tests/unit/step/factcheck-attestation.test.ts:846`
- **description**: "returns 'stale' when attestation has no sourceRevision (old attestation, non-git dir)" は `parsed.sourceRevision === undefined`（旧フォーマット）と `currentSourceRevision === null`（非 git dir）の 2 条件が同時に true になる。「git 利用可能・旧 attestation」の孤立ケースがない。
- **impact**: カバレッジのわずかな欠落（どちらの条件が stale を引き起こしたかを単独で確認できない）。TC-FCA-04 に "旧 attestation + git 利用可能" の孤立ケースが存在する（`evaluateFactCheckAttestation` ユニットレベル）ので機能上の問題はない。
- **resolution**: ユニットレベルの TC-FCA-04 が独立カバレッジを担保しており、ブロッカーではない。

---

## Summary

変更が既存機構の暗黙の前提を破っている箇所は見つからなかった。

| 調査した不変条件 | 結果 |
|----------------|------|
| pipeline metadata commit をまたいで `readSourceRevision` が安定する | ✅ 保存 |
| 既存 stale 条件（requestHash / codeAssertionsVerified）が優先評価される | ✅ 保存 |
| `buildFactCheckDirective` と下流の shape が不変 | ✅ 保存 |
| `DynamicContext.sourceRevision` が他 step に漏れない | ✅ 保存 |
| fail-safe の一方向性（緩める方向に働かない） | ✅ 保存 |
| `commitAndPush` の `git add -A` との相互作用 | ✅ 正当挙動 |

Findings は low 2 件のみ。いずれも機能的影響なし。

- **verdict**: approved
