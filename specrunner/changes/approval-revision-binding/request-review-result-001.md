# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合（8件）

1. **`src/core/pipeline/reverification.ts:67-72`** — `conformanceApprovedLatest(state)`
   - 確認: 関数はライン 67–72 に存在。`runs[runs.length - 1]?.outcome?.verdict === "approved"` のみを判定し、revision（commitOid）照合はない。アサーション正確。

2. **`src/core/pipeline/types.ts:250`** — STANDARD_TRANSITIONS で `{ step: VERIFICATION, on: "passed", to: ADR_GEN, when: conformanceApprovedLatest }`
   - 確認: ライン 250 に該当行が存在する。アサーション正確。

3. **`src/core/pipeline/types.ts:307`** — FAST_TRANSITIONS で `{ step: VERIFICATION, on: "passed", to: PR_CREATE, when: conformanceApprovedLatest }`
   - 確認: ライン 307 に該当行が存在する（FAST_TRANSITIONS 内）。アサーション正確。

4. **`src/core/pipeline/reverification.ts:37-53`** — `codeChangedSinceLastVerification` は endedAt 時刻比較のみ
   - 確認: 関数全体が `endedAt` の ISO 8601 辞書順比較のみで構成され、commitOid 照合はない。アサーション正確。

5. **`src/state/schema/types.ts:199`** — StepRun に `commitOid?: string`
   - 確認: ライン 199 に `commitOid?: string` が存在する。アサーション正確。

6. **`src/core/step/executor.ts:464-468`** — commitOid capture は sequential agent step のみ（CLI step は対象外）
   - 確認: ライン 463–468 の条件 `!deps.roundOwnsGitEffects && deps.runtimeStrategy` により agent step のみが対象。`runCliStep`（ライン 524–578）には commitOid capture 処理がない。アサーション正確。

7. **`src/core/pipeline/reviewer-status.ts:57`** — `approvedAtCommit: null` 宣言
   - 確認: ライン 57 に `approvedAtCommit: null` の初期化が存在する。**ただし「値を設定する箇所が存在しない（休眠フィールド）」は不正確**（後述 Finding 1 参照）。

8. **`src/core/pipeline/reviewer-status.ts:70-77`** — `selectPendingMembers` が revision 照合なし
   - 確認: 関数（実際はライン 77–87）は `statusByName.get(name) === "pending"` のみを判定し、`approvedAtCommit` を参照しない。アサーション正確（行番号はおおよそ正しい）。

### 問題の実在確認

- `conformanceApprovedLatest` が revision を照合しないことで、stale 承認が routing を素通しするという問題は、コードレベルで確認できる。
- CLI step（verification）に commitOid が打刻されない構造は executor.ts の `runCliStep` を読んで確認した。
- `selectPendingMembers` が approved member を revision 照合なしに無条件 skip することも確認した。

### 設計判断の確認

architect 評価済み設計判断（採用/却下）に列挙された内容はコードの実態と整合している:
- `conformanceApprovedLatest` は guard 内で git 実行しない（state only）
- endedAt 比較の限界（resume 跨ぎ・手動 commit に盲目）は現行コードで確認

## 検証できなかった項目

- re-verification 経路（conformance approved → codeChangedSinceLastVerification → verification）での commitOid capture タイミングの詳細動作（design step で設計される内容）
- `propagateVerificationResult` が result commit を行うタイミングと、verification の commitOid capture を「commit 前 vs 後」どちらで行うかの実装詳細（design step で決定すべき内容）

## Findings 詳細

### Finding 1: `approvedAtCommit` フィールドの記述に事実誤認がある（minor）

**該当箇所**: 「現状コードの前提」セクション — `src/core/pipeline/reviewer-status.ts:57` の説明

**問題**: 「reviewer status には `approvedAtCommit` フィールドが宣言だけされて常に null で放置されている（休眠フィールド）」という記述は不正確。

**実際**: `applyRoundResults` 関数（ライン 106–136）は `verdict === "approved"` のとき `approvedAtCommit: headSha` を設定している（ライン 119）。この動作はテスト（`reviewer-status.test.ts:208-218`）でも検証済み。さらに `computeInvalidations`（D6 無効化）が `approvedAtCommit` を git diff 起点として実際に使用している。

**影響**: このフィールドは「未使用」ではなく、D6 無効化ロジックの実装済みフィールドである。設計 D6（code-fixer 触れたファイル × activationPaths 無効化）はすでに `approvedAtCommit` に依存している。

**要件 5 への影響**: 「承認時に `approvedAtCommit` へ実値を設定し」は既に実装済み。実際に未実装なのは「`selectPendingMembers` の resume skip 判定に revision 照合を加える」のみである。実装者がこの事実誤認に引きずられると、`applyRoundResults` に不要な変更を加えるか、既存の D6 無効化ロジックを壊す恐れがある。

**ブロック性**: なし（要件自体は有効）。設計書に正確な現状を記載することで対処可能。

### Finding 2: commitOid 比較の等価条件がタイミング依存（design phase で解決すべき）

**該当箇所**: 受け入れ基準 — 「conformance approved と直近 verification の commitOid が一致する場合は adr-gen / pr-create へ進む」

**問題**: verification（CLI step）は `propagateVerificationResult`（`propagate.ts:61`）で result commit を行う。conformance（agent step）は `finalizeStepArtifacts` で result commit を行う。両者の result commit が積み重なると、「revision が動いていない正常経路」でも SHA が異なる状態になりうる。

具体的に:
- verification 終了後 → `verification-result.md` commit → HEAD = V1
- code-review 終了 → `code-review-feedback.md` commit → HEAD = V2
- conformance 終了 → `conformance-result.md` commit → HEAD = V3（conformance.commitOid）

この時点では V1 ≠ V3。「一致」させるには、verification が commitOid を result commit **前**に capture するか、conformance 承認時に最新 verification の commitOid を照合基準として記録するか、いずれかの設計を取る必要がある。

**ブロック性**: なし。受け入れ基準「conformance approved と直近 verification の commitOid が一致」の exact semantics を design step で確定すれば、正常経路保存テスト（acceptance criteria 2）が自然に設計をガイドする。architect 設計判断（基準点は直近 verification run の commitOid）との整合も design.md で確立される。
