# verification の偽 green を防ぐ skip 可視化: best-effort regex + passed-with-skips 注記

**Date**: 2026-07-05
**Status**: accepted
**Related**: `specrunner/adr/2026-05-19-verification-tc-coverage.md`（verification カバレッジ戦略）, `specrunner/adr/2026-05-26-verification-commands-abstraction.md`（commands path 設計）

## Context

verification の phase fallback path は test script を `spawnScript` で実行し、`exitCode === 0` なら
`passed` とする。test suite が service 依存（DB・外部サービス等）の欠如で integration test を
条件付き skip する設計（例: `describe.skipIf(!hasDb)`）の場合、サービスが存在しない環境では
exitCode 0 のまま `passed` と判定される。core 機能が未検証のまま偽 green を発する問題が生じる。

`PhaseResult` は `stdout`/`stderr` を保持するが skip 数は参照も記録もしない。
`runner.ts` の `allSkipped`（全 phase skipped → `VERIFICATION_NO_RUNNABLE_PHASES`）は phase 丸ごとの
skip を検出するが、test phase **内部**での partial skip は不可視。

downstream の code-review が見落としを補うこともあるが、verification が skip 数を記録しないため
「passed」という verdict の質（何件検証されたか）が検証不能になる。attestation の観点で
「passed」の意味が曖昧である。

本 ADR は「passed の質を検証可能にする」ための設計判断を記録する。pass/fail の verdict は
exitCode ベースのまま変えない。

## Decision

### D1: framework 非依存 regex による best-effort skip 検出、`PhaseResult.skippedCount` に記録

test phase の出力を `/(\d+)\s+(skipped|pending|todo)\b/gi` で走査し、全マッチの数値合計を
`PhaseResult.skippedCount`（`number | undefined`）として記録する。
検出ロジックは `src/core/verification/skip-detect.ts` に純粋関数 `detectSkippedTests` として
切り出し、test-coverage.ts と同様に独立単体テスト可能にする。

**Rationale**: regex による人読み可能サマリ行の走査は vitest (`2 skipped`)、jest (`2 skipped`)、
mocha (`1 pending`)、pytest (`2 skipped`) 等で共通に機能し、runner 固有フォーマットへの
依存を持たない。optional フィールドは既存 `PhaseResult` 利用側と後方互換。

**却下した代替案**:
- JSON reporter 強制: test runner に特定 reporter を要求するのは侵襲的で言語非依存性を破る（要件上も明示スコープ外）。
- runner 固有パーサ: 対象 runner が増えるたびにメンテナンスが必要で、framework 独立性を損なう。

### D2: stdout ではなく stdout+stderr の合算を走査する

detector には `stdout` 単体でなく `stdout + stderr` の結合テキストを渡す。

**Rationale**: jest をはじめ広く使われる runner は result サマリを **stderr** に出力する。
stdout のみの走査では jest 系 runner の skip を silent miss し、「framework 非依存」の目的に
矛盾する。合算は verification-result.md のコードブロックに既に surfaced される内容と同一であり
一貫性がある。detection は best-effort・non-blocking のためどちらの選択でも verdict は不変だが、
実際の検出率を上げるために合算を選択する。

**却下した代替案**: stdout 単体（要件の文言に近い）→ jest 系で silent miss。

### D3: 全マッチの数値合計

`detectSkippedTests` はスキャンテキスト内のすべてのパターンマッチの数値を合算して返す。

**Rationale**: 1 行に複数カテゴリが並ぶサマリ（例: `5 passed | 2 skipped | 1 todo`）を正確に
合算するには全マッチ合算が必要。max / last-match では multi-category サマリを過小計上する。

**許容リスク**: runner がサマリを複数回出力するケースでは重複計上が起き得る。advisory signal で
verdict に影響しないため許容範囲とする。

### D4: 検出スコープを phase fallback path の `test` phase に限定する

`runVerificationPhases` の `test` phase のみを対象とする。他の phase（build / typecheck / lint /
security / test-coverage）と commands path（`runVerificationCommands`）には適用しない。

**Rationale**: 要件スコープと完全一致。lint 等が `N skipped` 的な文言を出力した場合の
false positive を防ぐ。commands path は phase 概念を持たず将来の別 request で検討する。

**却下した代替案**: 全 phase 走査 → false positive、要件スコープ外。commands path への適用 → 明示非ゴール。

### D5: Verdict heading 直下に passed-with-skips 注記を付す。テーブルヘッダは不変

verdict が `passed` かつ `test` phase の `skippedCount > 0` のとき、`writeVerificationResult` は
`## Verdict:` heading 直下に annotation 行を挿入する。Phase Results テーブルのヘッダ・カラム構成は
変えない。clean pass（skip なし）では annotation を書かない。

verdict が `failed` の場合は annotation を抑制する。failed verdict は既に失敗を直接 surface しており、
passed-with-skips 注記は自己矛盾になるためである（D6 との区別: `skippedCount` 自体は pass/fail を問わず
記録される。annotation 表示のみを verdict でゲートする）。

**Rationale**: Verdict heading 直下は最も目立つ位置であり、PR body リンク経由で downstream が読む。
テーブルヘッダを変えないことで `extractVerificationFailures` の positional regex が壊れず、
既存テーブル構造アサーションが green を維持する。clean pass のバイト列を従来と同一に保つ。

**却下した代替案**: Phase Results テーブルに Skipped 列を追加 → positional parser が壊れる、既存テーブル構造テストが壊れる。

### D6: verdict は skip count の関数にしない（不変条件）

`skippedCount` は純粋な付加メタデータ。verdict は exitCode と既存の `allSkipped` / `anyFailed`
ロジックから変わらず計算され、`skippedCount` はその経路に関与しない。

**Rationale**: platform 固有の正当な skip（CI 環境での条件付き skip 等）を誤ブロックしないための
明示的非ゴール（hard-fail）。skip の意味づけ（意図的 skip か環境欠如か）を判別する設計が固まるまでは
可視化に留め、gate 化は将来の別 request に委ねる。

## Alternatives Considered

### Alternative 1: JSON reporter 強制で skip 数を機械可読に取得する

**Pros**: 数値が確定的で false positive がない。
**Cons**: test runner に特定 reporter を要求するのは侵襲的。言語非依存性（Node.js 以外の project）を破る。要件の明示スコープ外。
**Why not**: framework 非依存の目標と直接矛盾。却下。

### Alternative 2: skip 検出時に verdict を降格（passed → failed）する

**Pros**: CI を確実に止めて未検証を通過させない。
**Cons**: platform 固有の正当な skip を誤ブロックする。意図的 skip と環境欠如 skip を区別する設計が確立していない。
**Why not**: 要件の明示非ゴール。まず可視化で実態を把握してから gate 化を判断する段階的アプローチを選択。却下。

### Alternative 3: service provision（DB コンテナ等）を spec-runner 本体で担う

**Pros**: skip 自体の発生を防げる。
**Cons**: orchestration 複雑度が大幅に上がり minimal-deps 原則と相反。`verification.commands` に `docker compose up -d db && …` を書く既存手段で代替可能。
**Why not**: minimal-deps 北極星に反する。却下。

## Consequences

### Positive

- `passed` verdict の内訳（何件 skip されたか）が verification-result.md と PhaseResult に記録され、
  downstream（code-review / conformance）と人が確認できる
- verdict 自体は変わらないため、既存 pipeline への破壊的影響がない
- `detectSkippedTests` が I/O なし純粋関数で決定的にテスト可能
- テーブルヘッダ不変により `extractVerificationFailures` の後方互換を維持

### Negative / Known Debt

- regex best-effort のため、skip 文言が非標準な runner では silent miss が起きる（degraded to today's behavior）
- test output にマッチするが skip サマリでない文字列が存在すると false positive になり得る（advisory signal のため verdict への影響なし）
- サマリ複数出力の runner では重複計上する可能性がある（advisory・non-blocking として許容）
- commands path の skip 可視化は未対応のまま残る（将来の別 request）
- 将来の gate 化（skip count しきい値設定）は本 ADR のスコープ外

## References

- Request: `specrunner/changes/verification-surface-skipped-tests/request.md`
- Design: `specrunner/changes/verification-surface-skipped-tests/design.md`
- Spec: `specrunner/changes/verification-surface-skipped-tests/spec.md`
