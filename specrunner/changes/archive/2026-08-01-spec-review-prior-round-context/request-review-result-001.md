# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コード前提の確認（Code Assertion Fact-Check）

以下の全アサーションを実コードで読んで確認した。

| アサーション | 場所 | 結果 |
|---|---|---|
| `reads()` は request.md / spec.md / design.md / tasks.md の 4 ファイルのみ | `src/core/step/spec-review.ts:82-90` | ✅ 一致 |
| `buildSpecReviewInitialMessage` が前周 findings を一切渡さない | `src/core/step/spec-review.ts:102-114` + `src/prompts/spec-review-system.ts:174-196` | ✅ 一致。`SpecReviewPromptInput` に前周 findings フィールドなし |
| session 継続は `FIXER_STEP_NAMES` のみ（spec-review は毎回フレッシュ） | `src/core/step/step-context-builder.ts:96-98` | ✅ 一致 |
| `getLatestJudgeFindings(state, SPEC_REVIEW)` が fixer 側に存在する seam | `src/core/step/spec-fixer.ts:150` | ✅ 一致 |
| `listCommitChangedFiles(oid, cwd)` が port に存在する | `src/core/port/runtime-strategy.ts:651`（optional）`/ 810`（required） | ✅ 一致。managed は `unavailable` を返す設計も確認 |
| `priorOid` を `stepRuns[stepRuns.length - 2]?.commitOid` で解決する前例 | `src/core/step/commit-orchestrator.ts:277-278` | ✅ 一致 |
| finding-recency は観測専用（verdict 変更なし） | `src/core/step/finding-recency.ts` + `commit-orchestrator.ts:271-299` | ✅ 一致。`recordFindingRecency` は verdict/state への書き戻し経路なし |
| spec-review ⇄ spec-fixer ループ遷移 | `src/core/pipeline/types.ts:235-237, 244-247` | ✅ 一致 |
| maxIterations 既定 2 | `src/config/getAgentId.ts:33`（`cfg.pipeline?.maxRetries ?? 2`） | ✅ 値は正しい。ただし場所は types.ts でなく getAgentId.ts（後述） |
| ADR 2026-07-24 D2 gate 化を将来送り | `specrunner/adr/2026-07-24-spec-review-full-enumeration.md` D2 節 | ✅ 存在・内容一致 |

### 背景・スコープの確認

- 問題の構造的原因（reviewer が解消を知る経路を持たない）は正確
- 「stale 再指摘の機械 auto-reject を採らない」理由（「fixer が触ったが修正不十分」の正当な再指摘を殺す）は妥当
- one-shot 注入の方針（resume-context 注入と同じ寿命規律）は既存パターンと整合
- 全量列挙規律（ADR 2026-07-24 D1）を弱めないという明示は適切

### 受け入れ基準の確認

5 項目の AC すべてがテスタブルで具体的。特に「`listCommitChangedFiles` の mock 経由で機械導出であることを検証」の明示は要件 3（自己申告を真実源にしない）の意図を test に落とせる良い書き方。

## 検証できなかった項目

- issue #936 の実際の再現手順（GitHub issue への直接アクセス不要。背景記述の整合性は問題なし）

## Findings 詳細

### Finding 1（LOW / fixable）: maxIterations 既定値 2 の参照場所が不正確

request.md 内の「`src/core/pipeline/types.ts:235-246` — ... maxIterations 既定 2」という記述は、アサーションとしては 2 点の主張を含む：

1. **ループ遷移が types.ts:235-246 に存在する** → ✅ 正確（line 235-237 が spec-review ループ遷移）
2. **maxIterations 既定 2 が types.ts 内にある** → ❌ 不正確。実際の既定値は `src/config/getAgentId.ts:33`（`cfg.pipeline?.maxRetries ?? 2`）で定義されており、types.ts には含まれない

実装への影響なし（既定値 2 という事実は正しく、実装者は正しい場所を見つける）。記録のみ。

### Finding 2（LOW / fixable）: `enrichContext` シグネチャが `state` / `runtimeStrategy` を受け取らない

要件（b）では「fixer 変更 file 集合を `listCommitChangedFiles` で機械導出して注入」とある。しかし現在の `enrichContext?(dynamicContext, cwd, slug)` シグネチャは `state`（= spec-fixer の commitOid 取得に必要）と `runtimeStrategy`（= `listCommitChangedFiles` 呼び出しに必要）を受け取らない。

- 前周 findings（要件 a）は `buildMessage(state, deps)` から `getLatestJudgeFindings(state, SPEC_REVIEW)` で同期的に取得可能
- fixer 変更 file 集合（要件 b）は async I/O が必要 → `enrichContext` または新規フックで解決が必要

実装者は次のいずれかを design.md で決定する必要がある：
- `enrichContext` シグネチャに `state: JobState` と `runtimeStrategy?: RuntimeStrategy` を追加（step-types.ts + 3 アダプタ変更）
- 別の async 前処理フック（`buildPriorContext?` 等）を新設

アーキテクチャ上の実装決定として design.md に委ねる事項。要件の概念的な正当性は変わらず、実装路は明確。

---

**注**: Finding 2 は「request が不完全で却下すべき」ではなく「design 段階で解決すべき実装設計の選択肢」。request は概念レベルで正確かつ完全。
