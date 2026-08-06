# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

**コードアサーションの突き合わせ（全件）**

- `src/core/step/commit-push.ts:342-374` — `verifyEgressLedger` 関数: 行番号・実装内容ともに一致。`git rev-list HEAD --not --remotes=origin` で publish range を列挙し、ledger に無い OID で `egressUnknownCommitError` を throw する実装を確認。
- `src/core/step/commit-push.ts:383-389` — 設計コメント: "operator hand-commits are hand-pushed" という記述を含むブロックを 383-389 行で確認。
- `src/errors.ts:474-480` — `egressUnknownCommitError`: 行番号・メッセージ（"A commit not created by the pipeline was found in the push range. Investigate and resolve before retrying."）ともに一致。
- `src/core/command/resume.ts:290-306` — apply-canon gate の前半（`resolvedWorktreePath !== null && resolvedSlug !== null` 条件と `detectCanonDirtyPaths` 呼び出し）を確認。
- `src/core/command/resume.ts:307-315` — `--apply-canon` 指定時の `commitOperatorCanon` → `appendSynthesizedCommit` → `runStore.persist` の流れを確認。
- `src/core/command/resume.ts:316-334` — persist 失敗時の split-brain guard（`git reset --mixed HEAD~1`）を確認。コメント "recoverable only via the manual-push tribal knowledge this feature removes" を含む。
- `src/core/resume/apply-canon.ts:42-89` — `detectCanonDirtyPaths` 関数: `git status --porcelain` ベースの検出。commit 済み変更は検出されない（worktree が clean になる）ことを確認。
- `src/core/resume/apply-canon.ts:11-12` — "commitOperatorCanon commits ONLY the specified paths. Non-canon dirty files in the worktree are intentionally left untouched" を確認。
- `src/core/step/write-scope.ts:64-74` — `protectedCanonPaths` が request.md / spec.md / design.md / tasks.md / test-cases.md / fact-check attestation の 6 つを返す実装を確認。

**実装の現状確認**

- `--adopt-commits` フラグは現在存在しない（`src/cli/command-registry.ts` と `src/cli/resume.ts` を確認）。
- `appendSynthesizedCommit` 関数が `src/state/schema/operations.ts:35` に存在し、冪等実装であることを確認。
- `--apply-canon` フラグは `command-registry.ts:689` に定義済みで、`applyCanon` として resume options に渡されている。

**要件・受け入れ基準の評価**

- 要件 1〜5 は全て既存コードの構造と整合している。
- 検出位置（apply-canon gate 後・pipeline 起動前）は既存の `resume.ts` の flow に自然に差し込める。
- 受け入れ基準はいずれもテスト可能な命題として記述されている。
- architect 評価済みの設計判断が 4 点記載されており、採択・却下の根拠が明示されている。

## 検証できなかった項目

None — コードアサーションは全件突き合わせ済み。要件の実装可能性の検証はコード構造の確認で完了。

## Findings 詳細

None — 全アサーションが一致し、要件・受け入れ基準・設計判断に疑義なし。
