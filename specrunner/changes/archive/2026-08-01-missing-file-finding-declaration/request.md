# 欠落指摘 finding の構造化宣言 — finding-ref 実在検証との衝突を解消し fixer routing を保つ

## Meta

- **type**: spec-change
- **slug**: missing-file-finding-declaration
- **base-branch**: main
- **adr**: true

## 背景

judge 系 step の finding-ref 実在検証（hallucination 対策）は、verdict に影響する finding の `file` が worktree に実在しない場合、導出済み verdict（`needs-fix:code-fixer` 等の routing 付きを含む）を `escalation` に上書きする。さらにこの上書き経路では `escalationReason` の付与も抑止されるため、下流には routing メタデータ無しの素の escalation が渡る。

このため「**あるべきファイルが未作成**」という正当な指摘（file フィールドが定義上、存在しないファイルを指す）は、fixable であっても fixer に routing されず、必ず operator escalation になる。実例（issue #916）: regression-gate が implementation-notes.md 未作成を指摘 → verdict 導出単体なら needs-fix → しかし ref 検証が nonExistent と判定し escalation 上書き → operator が `resume --from code-fixer --prompt` で手動 routing。「欠落の指摘」がシステム上表現不能になっている。

修正方針は **finding に「対象 file の欠落自体を指摘している」ことを構造化宣言するフィールドを追加し、ref 検証を宣言別に反転する**: 欠落宣言 finding は「file が存在**しない**こと」を検証し、実在していれば虚偽宣言として従来同様 escalation に上書きする。これにより両方向とも宣言が現実と機械照合され、fail-closed の方向は維持される。prompt 規約のみの対処（「file には実在する親ディレクトリを書け」等）は agent の遵守頼みで根本対策にならないため採らない。

## 現状コードの前提

- `src/core/step/step-completion.ts:238-256` — verdict 導出**後**に ref 検証が走る。`collectVerdictAffectingFindings` の結果が非空なら `verifyFindingRefs` を呼び、nonExistent が 1 件でもあれば `verdict = "escalation"` / `verdictOverriddenByFindingRef = true` に上書き
- `src/core/step/judge-verdict.ts:25-30` — `collectVerdictAffectingFindings` = severity critical/high **または** resolution decision-needed の finding。ref 検証の対象はこの集合に限られる（low/medium の fixable は現行では検証対象外）
- `src/core/step/step-completion.ts:300-321` — `verdictOverriddenByFindingRef` が true のとき `escalationReason` は計算されない（canon escalation の routing メタデータが付かない）
- `src/kernel/report-result.ts:40-75` — `Finding` 型。`file` は「問題が見つかった場所」を指す必須 worktree 相対パス。欠落を表す専用フィールドは無い（discriminator は `origin?: "scope"` のみ）
- `src/core/step/report-tool.ts:108` ほか — report tool schema の `file: string()`。JUDGE / CODE_REVIEW / CONFORMANCE / REQUEST_REVIEW の各 tool description に欠落表現の規約は無い
- `src/core/runtime/local.ts:752-781` / `src/core/runtime/managed.ts:381-422` — `verifyFindingRefs` の実装（存在しない ref の部分集合を返す seam、`src/core/port/runtime-strategy.ts:428-443` が契約）。local 実装の単体テストは存在しない
- `src/core/step/step-completion.ts:238` のゲートにより検証が効く step: regression-gate / spec-review / custom-reviewer / code-review / conformance / request-review
- `src/core/runtime/__tests__/managed-verify-finding-refs.test.ts:136-145` — 「file 未検出 → nonExistent 1」を固定（seam の意味論。本 request では変えない）
- step-completion の「nonExistent → escalation 上書き + escalationReason 抑止」フローを直接固定するテストは存在しない

## 要件

1. **欠落宣言フィールドの追加**。`Finding` 型と全 judge 系 report tool schema（JUDGE / CODE_REVIEW / CONFORMANCE / REQUEST_REVIEW）に「この finding は `file` の欠落自体を指摘している」を表す boolean フィールドを追加する（名称は実装裁量、例 `fileMissing`）。tool schema の description に用途を明記する: 「あるべきファイルが存在しないことを指摘する場合に true。`file` には欠落している path を書く」。reviewer への契約は schema 経由で注入し、prompt 本文の増築を主手段にしない
2. **ref 検証の宣言別分岐**。ref 検証で finding を宣言別に分割する: 欠落宣言 finding は「file が存在**しない**こと」を検証し、実在していれば虚偽宣言として従来同様 verdict を escalation に上書きする。非宣言 finding は従来通り実在を検証する。runtime seam（`verifyFindingRefs`）の意味論（存在しない ref の部分集合を返す）は変えず、呼び出し側で期待を反転する
3. **routing の保存**。欠落宣言 finding が正しい（file が実在しない）場合、上書きは起きず、verdict 導出（`deriveRegressionGateVerdict` / `deriveConformanceVerdict` 等）の結果——fixable なら needs-fix 系 routing——がそのまま生きる
4. **line の扱い**。欠落宣言 finding では `line` を検証に使わない（存在しないファイルに行は無い）
5. **runtime 対称**。分岐は local / managed 両実装経由で同挙動とする

## スコープ外

- `verifyFindingRefs` seam 自体の意味論変更・シグネチャ変更（呼び出し側の分割で足りる場合）
- ref 検証の対象集合（`collectVerdictAffectingFindings` = critical/high/decision-needed）の変更
- escalationReason 抑止ロジック（`step-completion.ts:300-321`）の変更 — 虚偽宣言・非宣言 nonExistent の上書き時挙動は従来通り
- reviewer prompt 本文への欠落表現ガイドの大規模追記（schema description で足りる範囲を超えるもの）

## 受け入れ基準

- [ ] **シナリオ歯（#916 実例の再現）**: 「judge step の verdict 導出が needs-fix 系 routing を返し、その finding（critical/high または decision-needed）が欠落宣言付きで実在しない file を指す → escalation 上書きが起きず routing 付き verdict が保たれる」をテストで固定する
- [ ] 虚偽宣言: 欠落宣言付きだが file が実在する → 従来同様 escalation に上書き、をテストで固定する
- [ ] 回帰保護: 非宣言 finding の file が実在しない → 従来通り escalation に上書き + escalationReason が付かない、をテストで固定する（この上書きフローを直接固定するテストは現状存在しないため、本 request で歯を新設する）
- [ ] local / managed 両実装の分岐挙動をテストで固定する（local `verifyFindingRefs` は現状単体テスト無し）
- [ ] 既存テスト（`managed-verify-finding-refs.test.ts` 等）は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 構造化宣言 + 反転検証。宣言は両方向とも現実と機械照合される（欠落宣言なのに実在 → 上書き、非宣言なのに不在 → 上書き）ため、自己申告が fail-open にならない
- **採用**: seam（`verifyFindingRefs`）の意味論は不変、呼び出し側で分割・反転。既存テストと managed/local 実装の変更を最小化する
- **却下**: prompt 規約のみ（file に実在する親ディレクトリや関連ファイルを書かせ、欠落対象は title/rationale で示す）— agent の遵守頼みで、破られた時の failure mode が現状と同じ（escalation + routing 消失）。判断点を消す方向でない
- **却下**: ref 検証から欠落系 finding を単純に免除（検証しない）— 「存在しないファイルを指す finding は全部素通り」となり hallucination 検証が空洞化する。反転検証が正しい形
- **却下**: escalationReason 抑止の解除で routing を復活させる — 上書きの正当なケース（本物の hallucination）で誤った routing を発生させる
