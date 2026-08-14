# Code Review Feedback — evidence-base — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` で変更スコープを確認（37ファイル、4097行追加/233行削除）
- `src/core/step/bite-evidence/oids.ts`: `resolveEvidenceBaseRev` の純関数実装を確認。`detectBaseImplementationContamination` が削除済みを確認。
- `src/core/step/bite-evidence/gate.ts`: D6 deferral 順序（type→tamper→baseOid→EB ref→runtime→empty selection→HEAD→red→green）の完全な実装を確認。
- `src/core/archive/achieved-assurance.ts`: P2.5 がEB ref解決に置換、base-redが `runTestsOnSynthesizedTree` 経由になったことを確認。
- `src/core/port/runtime-strategy.ts`: `runTestsOnSynthesizedTree` の型定義・JSDoc・`RealRuntimeStrategy` 必須要件を確認。
- `src/core/runtime/local.ts`: `runTestsOnSynthesizedTree` 実装（worktree作成→overlay→symlink→テスト実行→finally cleanup）を確認。
- `src/core/runtime/managed.ts`: `runTestsOnSynthesizedTree` が `unavailable` を返すことを確認。
- `src/state/schema/types.ts`: `BiteEvidenceRecord.baseOid` の型定義と JSDoc を確認。
- TC-001〜017 の全カバレッジを各テストファイルで確認。
- `specrunner/changes/evidence-base/verification-result.md`: build/typecheck/test/lint 全フェーズ passed を確認。

## 検証できなかった項目

None（全受け入れ基準・全TC・コア実装ファイルを確認済み）

## Findings 詳細

### F-001: `BiteEvidenceRecord.baseOid` JSDoc が旧語義のまま

`src/state/schema/types.ts:382` のコメントは「commit OID of the test-materialize step (base boundary)」と記載しているが、`gate.ts:289` は Evidence Base revision expression（`"${commits[0]}^"` の文字列）をこのフィールドに書き込む。実際の40文字OIDではない。

archive floor は `BiteEvidenceRecord.baseOid` を git 操作に使っておらず（`resolveEvidenceBaseRev(state)` で再導出する）、スキーマ検証も `typeof === "string"` のみのため動作上の問題はない。ただし state.json を読む将来の開発者がこのフィールドをOIDとして扱うリスクがある。

**修正案**: コメントを Evidence Base rev expression の意味に更新する。

### F-002: `achieved-assurance.ts:497` catch ブロックのメッセージが stale

`try` ブロックが `runTestsOnSynthesizedTree`（e）と `runTestsAtCommit`（f）の両方をカバーしているが、catch メッセージは `"biteEvidence: runTestsAtCommit threw: ..."` のまま。両メソッドとも never-throw 契約なので実質到達不能だが、万一到達した場合に誤帰属となる。

**修正案**: `"biteEvidence: base-red/HEAD-green I/O threw: ..."` 等の汎用メッセージに変更する。

### F-003: `runTestsOnSynthesizedTree` の empty-overlay パスが `scopedTestCommand` チェックをスキップ

`local.ts:1196-1198` の early return（`overlayFiles.length === 0 → { kind: "ran", results: [] }`）は `scopedTestCommand` チェック（:1200）より前にある。port 契約「MUST NOT run without a resolved scopedTestCommand → unavailable」への技術的違反。

gate（step 6 empty-selection defer）と archive floor（materializedTestFiles 空チェック）が呼び出し前にショートサーキットするため、運用上は無害。

**修正案**: `scopedTestCommand` チェックを `overlayFiles.length === 0` チェックより前に移すか、JSDoc に空オーバーレイ時は scopedTestCommand 不問で ran を返す旨を明記する。
