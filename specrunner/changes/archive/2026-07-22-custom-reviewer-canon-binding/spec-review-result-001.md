# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル
- `specrunner/changes/custom-reviewer-canon-binding/request.md`
- `specrunner/changes/custom-reviewer-canon-binding/spec.md`
- `specrunner/changes/custom-reviewer-canon-binding/design.md`
- `specrunner/changes/custom-reviewer-canon-binding/tasks.md`

### 参照したソースコード
- `src/core/pipeline/round-git-scope.ts` — `excludeChangeFolderPaths` の現行実装
- `src/core/pipeline/reviewer-status.ts` — `selectPendingMembers` / `applyRoundResults` / `aggregateVerdict` の現行実装
- `src/core/pipeline/parallel-review-round.ts` — `ParallelReviewRound.run` の full フロー
- `src/kernel/reviewer-snapshot.ts` — `ReviewerStatus` 型定義
- `src/util/paths.ts` — 既存パスユーティリティ群
- `src/state/artifact-types.ts` — `ArtifactRef` 型定義
- `src/core/port/runtime-strategy.ts` — `RuntimeStrategy.digestArtifacts` / `PipelineDeps.slug` の存在確認
- `src/state/schema/operations.ts` — `validateJobState` の reviewerStatuses 検証（name/status のみ）
- `src/core/pipeline/__tests__/reviewer-status.test.ts` — 現行 `aggregateVerdict` テスト含む
- `src/core/pipeline/__tests__/round-git-scope.test.ts` — `excludeChangeFolderPaths` テスト
- `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` — invalidation テスト
- `tests/reviewer-activation-e2e.test.ts` — TC-ACT-01/02/03/04/05

### 確認した要件・シナリオ

1. **要件 1 (canonHash 束縛)**
   - `selectPendingMembers` の D4 判定順序（managed short-circuit → revision check → canon check）を仕様と照合
   - `applyRoundResults` の canonHash 記録ロジックを確認
   - legacy record（canonHash 欠落）が fail-closed（pending）になることを確認

2. **要件 2（除外絞り込み）**
   - `excludeChangeFolderPaths` の現行動作（change folder 全体除外）と変更後 allowlist 方式を比較
   - `isCanonicalDocPath` の depth チェック（archive/canceled 配下は深さ 3 以上で false）の設計論理を確認
   - findings commit only の変更が引き続き除外される点を確認

3. **要件 3（全 skip 非 green 化）**
   - `aggregateVerdict` の変更箇所（`["skipped","skipped"]` → "escalation"、`[]` → "approved" 不変）を確認
   - `allMembersSkipped` チェックが else ブランチ（fan-out 実行時）のみに閉じており fast-path（all approved）に影響しないことを確認
   - `applyRoundResults` 抑止により member が pending のまま残ること（resume 再現）の論理を確認

4. **要件 4（legacy 互換）**
   - `currentCanonHash` と `record.canonHash` いずれかが null/欠落の場合に pending（fail-closed）になる判定を確認
   - `operations.ts` の reviewerStatuses 検証が name/status のみを見ているため `canonHash` 追加が後方互換であることを確認

5. **要件 5（E2E）**
   - T-08 の設計実現可能性：`RuntimeStrategy.digestArtifacts` が `{ path: string }[]` を受け取り `ArtifactRef[]`（hash 付き）を返すことを確認
   - `deps.slug` が `StepContext.slug` 経由で `PipelineDeps` に存在することを確認
   - fabricated state + 実 git + fake StepExecutor 構成の実現可能性を確認

6. **テスト影響リストの整合性**
   - `reviewer-status.test.ts` の `aggregateVerdict(["skipped","skipped"])` 期待変更を確認
   - `reviewer-activation-e2e.test.ts` の TC-ACT-01/02 不一致ケース/TC-ACT-04 第1テストの期待変更を確認
   - `parallel-review-round-invalidation.test.ts` が fake runtimeStrategy（digestArtifacts なし）を使用するため `currentCanonHash === undefined` → skip 挙動で期待更新不要であることを確認
   - `round-git-scope.test.ts` の rename 対応（改称 + 正典保持ケース追加）を確認

7. **セキュリティ観点**
   - パストラバーサル（slug に `..` が含まれる場合）: `isCanonicalDocPath` の `split('/')` による深度チェックにより `specrunner/changes/../evil/design.md` は深度過多で false → safe
   - canonHash の値は `digestArtifacts` がローカル sha256 で計算するため外部入力ではない
   - `state.json` 改竄: canonHash 欠落 → pending（fail-closed）により攻撃者が canonHash を削除しても bypass できない
   - 新規 LLM プロンプトの追加なし → prompt injection リスクの増加なし
   - 認証・認可の変更なし → OWASP Top 10 該当項目なし

8. **再 anchor ロジックと canonHash の相互作用確認**
   - `src 監視型` reviewer（activationPaths: `["src/**"]`）で正典のみ変更の場合：
     `computeInvalidations` は発火しない（src/** が canonical docs にマッチしない）→ re-anchor で approvedAtCommit = baselineCommit に更新 → `selectPendingMembers` で canonHash 不一致（H1 ≠ H2）→ pending → fan-out 実行。設計が正しく機能することを確認
   - re-anchor が canonHash を触らない（tasks.md T-05 の指示と parallel-review-round.ts の現行 re-anchor ロジックの整合）を確認

9. **`currentCanonHash === undefined` の後方互換ポリシー**
   - D4: `undefined` → skip（canon check 未適用）の設計を確認
   - production では local runtime は常に `digestArtifacts` を実装（→ string | null）、managed は `baselineCommit == null` で前段 short-circuit → undefined に到達しない経路を確認
   - 既存 invalidation unit test（fake runtimeStrategy、digestArtifacts なし）への影響なしを確認

---

## 検証できなかった項目

- `tests/custom-reviewers-e2e.test.ts` の全ケース内容（ファイルを全件読んでいない）。tasks.md T-07 が「無変更で green を確認」とのみ記載しており、single-reviewer all-skip 構成が存在した場合の追加更新を要する可能性がある。ただし `typecheck && test` gate が検出するため、事前の全列挙は必須ではない。
- LocalRuntime の `digestArtifacts` 実装コード（ファイルを読んでいない）。runtime-strategy.ts の interface 仕様（local: reads each file, sha256 → null on file not found）のみを確認。

---

## Findings 詳細

### Observation 1: `computeCanonHash` シリアライズ形式の区切り文字が暗黙的

**ファイル**: `specrunner/changes/custom-reviewer-canon-binding/design.md` (D3)

design.md D3 では「path と hash を決定的に連結した文字列を canonHash とする（例: `path hash` を `` 区切りで join）」と記述されている。バッククォート間の区切り文字が改行かどうかは文脈から読み取れるが明示されていない。

実装者と単体テスト記述者が同一の設計ドキュメントを読む限り認識ずれは発生しにくい。また T-04 の「同一内容（順不同）→ 同一文字列」テストが形式の一貫性を間接的に保証する。非ブロッキング。

---

### Observation 2: `allMembersSkipped` が approved 済み member 混在構成でも escalation ループになる

**ファイル**: `specrunner/changes/custom-reviewer-canon-binding/design.md` (D6 blast radius)

approved 済み member A と pending 状態で activation 不一致の member B が同一 round に存在する場合（例: A が前回 round で承認済み、B が requestTypes 不一致で常時 skipped）、
- `pending = [B]`（A は fast-path 除外）
- B が "skipped" verdict → `allMembersSkipped = true` → escalation
- `applyRoundResults` 不適用 → B は pending のまま → 次回 resume でも同じ escalation

design.md D6 はこれを「escalation が迂回されない」と明示しており intentional。ただし spec.md のエスカレーション シナリオには「user がどう解消するか（reviewer 設定変更 or job cancel）」の記述がない。スコープ外（escalation 文言は Non-Goal）のため blocking ではない。

---

### Observation 3: T-05 で `digestArtifacts(refs, cwd, branch)` の cwd/branch 引数が未明示

**ファイル**: `specrunner/changes/custom-reviewer-canon-binding/tasks.md` (T-05)

T-05 は「`canonicalDocPaths(deps.slug).map(p => ({ path: p }))` を渡して 1 回だけ呼び」と記述するが、`cwd` と `branch` の渡し方が未明示。`ParallelReviewRound.run` では `const cwd = deps.cwd ?? process.cwd()` および `state.branch ?? null` が既に利用可能であり、実装者は文脈から推論できる。非ブロッキング。
