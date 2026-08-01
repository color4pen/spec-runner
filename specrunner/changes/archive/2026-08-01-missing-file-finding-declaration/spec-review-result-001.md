# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 仕様ファイル精読

- `request.md` — 背景・要件・スコープ外・受け入れ基準・architect 評価済み設計判断を全読。
- `design.md` — D1〜D6 の全設計判断、Risks / Trade-offs、Open Questions を全読。
- `tasks.md` — T-01〜T-06 の全 task を全読。
- `spec.md` — 3 Requirement + 全 Scenario を全読。

### コード事実確認

以下の全ファイルを実際に読み、request.md / design.md に記載されている行番号・型・実装を照合した。

| 参照先 | 確認内容 | 結果 |
|--------|----------|------|
| `src/kernel/report-result.ts:40-75` | `Finding` 型に `fileMissing` フィールドなし、discriminator は `origin?: "scope"` のみ | ✓ 事実と一致 |
| `src/core/step/step-completion.ts:238-256` | ref 検証ブロック（verdict 導出後、`collectVerdictAffectingFindings` → `verifyFindingRefs` → nonExistent ≥1 → escalation 上書き） | ✓ 実装確認 |
| `src/core/step/step-completion.ts:300-321` | `verdictOverriddenByFindingRef = true` のとき escalationReason 計算が抑止される | ✓ 実装確認 |
| `src/core/step/judge-verdict.ts:26-30` | `collectVerdictAffectingFindings` = severity critical/high **または** resolution decision-needed | ✓ 実装確認 |
| `src/core/step/report-tool.ts:105-114` | `findingSchema` に `fileMissing` フィールドなし（`file: string()` のみ）。JUDGE/CODE_REVIEW/REQUEST_REVIEW が共有 | ✓ 実装確認 |
| `src/core/step/report-tool.ts:181-191` | `conformanceFindingSchema` に `fileMissing` フィールドなし。CONFORMANCE 専用 | ✓ 実装確認 |
| `src/core/port/runtime-strategy.ts:119-128` | `FindingRef` = `{ file: string; line?: number }` — line はすでに optional | ✓ 型確認（欠落宣言群に `{ file }` のみ渡す実装は型安全） |
| `src/core/port/runtime-strategy.ts:428-443` | `verifyFindingRefs` の seam 契約（非実在 ref の部分集合を返す） | ✓ 契約確認 |
| `src/core/runtime/local.ts:752-781` | local 実装（`fs.stat` ベース、line 超過判定付き） | ✓ 実装確認 |
| `src/core/runtime/managed.ts:381-422` | managed 実装（GitHub API `getRawFile` ベース、branch=null 時は全 ref を非実在扱い） | ✓ 実装確認 |
| `src/core/port/report-result.ts:178-236` | `parseFindings` — `origin === "scope"` の silent-capture パターン。`fileMissing` は未実装 | ✓ 実装確認 |

### 既存テストの確認

| テストファイル | 確認内容 | 結果 |
|----------------|----------|------|
| `tests/unit/core/runtime/verify-finding-refs.test.ts` | TC-VFR-L-001〜007 が **実在**。local seam を直接テスト | ✓ ファイル実在確認。request.md が「local 単体テストは存在しない」と誤記している点を design.md が正しく訂正・解釈している |
| `src/core/runtime/__tests__/managed-verify-finding-refs.test.ts:136-145` | 「getRawFile = null → nonExistent 1」を固定 | ✓ セマンティクス変更しない Non-Goal と整合 |
| `src/core/step/__tests__/step-completion-evidence-diagnostic.test.ts` | 既存 step-completion テストのパターン（makeDeps, makeMinimalJudgeStep 等）を確認 | ✓ T-04/T-05 実装テンプレートとして確立済み |
| `tests/unit/core/step/step-completion-canon.test.ts` | step-completion のテスト方式（PipelineDeps stub, runtimeStrategy 省略 → ref 検証スキップ）を確認 | ✓ T-04 で mock runtimeStrategy を追加するパターンの基盤あり |

直接テストが存在しない「nonExistent → escalation 上書き + escalationReason 抑止」フローは、T-04「回帰保護」テストケースで新設される — request.md の記載と一致。

### 設計判断の整合性確認

- **D1**（`fileMissing?: boolean` additive discriminator）: `origin?: "scope"` と同パターン。後方互換。✓
- **D2**（4 tool schema への追加）: `findingSchema` 共有により JUDGE/CODE_REVIEW/REQUEST_REVIEW が 1 箇所更新でカバーされる。`conformanceFindingSchema` は別定義のため個別追加が必要（tasks T-02 が明示）。✓
- **D3**（step-completion 呼び出し側で分割・反転）: 疑似コードのロジックを検証。`absent` Set の構築（`nonExistent.map(r => r.file)`）と falseDecl フィルタ（`!absent.has(f.file)`）は正しい。`FindingRef.line` は optional なので `{ file }` のみの ref は型安全。✓
- **D4**（欠落宣言群に `line` を渡さない）: T-03 / T-04 acceptance criteria で明示的に assert される。✓
- **D5**（escalationReason 抑止は不変）: 虚偽宣言の上書きも `verdictOverriddenByFindingRef = true` を立てるため、既存の escalationReason 抑止フローが効く。✓
- **D6**（runtime 対称性は seam 契約に委ねる）: `verifyFindingRefs` 呼び出し側ロジックは runtime 非依存。T-05 で real LocalRuntime / real ManagedRuntime を注入してテスト。✓

### Scenario 追跡

spec.md の全 Scenario が tasks.md の受け入れ基準に追跡できることを確認した。

| Scenario | 対応 Task |
|----------|-----------|
| 欠落宣言 finding が parse で保持される | T-01 AC |
| 非宣言 finding は従来通り | T-01 AC |
| 正当な欠落指摘の routing が保たれる（#916） | T-04 シナリオ歯 |
| 虚偽の欠落宣言は escalation に上書き | T-04 虚偽宣言 |
| 非宣言 finding の不在は従来通り escalation | T-04 回帰保護 |
| local / managed 両 runtime で同一挙動 | T-05 |
| 欠落宣言 finding の line は無視される | T-04 mock assert |

### セキュリティ確認

- `fileMissing` は boolean 値。`=== true` 厳密等価でのみ宣言を認識（文字列 "true" 等のトラッキング汚染なし）。
- 新たな I/O サーフェスなし。`file` パスは既存の `verifyFindingRefs` seam を通る（パストラバーサルリスクは既存実装と同等、新増分なし）。
- fail-closed 方向は維持（虚偽宣言 → escalation、非宣言 nonExistent → escalation）。
- OWASP A04（Insecure Design）: 自己申告が fail-open にならない構造を D3 の反転検証で担保。✓

## 検証できなかった項目

None — 仕様の全 Requirement / Scenario / Task は静的なコード精読と型照合の範囲で検証できた。実際の typecheck / test 実行は T-06 の実装後にしか確認できない（実装前の spec review のため範囲外）。

## Findings 詳細

### Finding 1: `branch = null` 時の欠落宣言群 fail-open は informal なパイプライン不変条件で担保

- **severity**: low
- **resolution**: fixable
- **file**: specrunner/changes/missing-file-finding-declaration/design.md
- **title**: `branch = null` + 欠落宣言群の fail-open 緩和策が informal（コード保証なし）

managed runtime で `branch === null` のとき seam は全 ref を非実在として返す。欠落宣言群では「全て非実在 = 宣言が正しい」と解釈され override が起きない。これは正当な欠落指摘でも「ブランチが無い状態で verify できていない」にもかかわらず routing が通ってしまうケースに当たる。

design.md Risks 節は「judge 系 step は design step で branch 確定後にのみ実行される、判定時点で `state.branch` が null になる経路は存在しない」と説明しているが、これはパイプライン順序の事実に基づく論証であり、コード内に型/assertion による強制はない。

Non-Goal として seam シグネチャを変更しないこと、および「branch=null + 非宣言群 → 全上書き（fail-closed）は従来通り」を維持することが明記されており、設計判断として整合する。実装者への注記として、ADR にパイプライン順序不変条件を記録することを検討してもよい。

### Finding 2: `fileMissing: true` + `resolution: "decision-needed"` の組み合わせは仕様に記載なし

- **severity**: low
- **resolution**: fixable
- **file**: specrunner/changes/missing-file-finding-declaration/spec.md
- **title**: `fileMissing: true` + `decision-needed` の組み合わせは spec に記載がなく、挙動が非自明

`collectVerdictAffectingFindings` は decision-needed finding を含むため、`fileMissing: true` + `decision-needed` の finding は ref 検証対象に入る。この場合、反転検証によりファイルが実在しなければ override は起きないが、`deriveJudgeVerdict`（priority #3: decision-needed → escalation）が override なしに escalation を返す。結果として `fileMissing: true` の有無で routing に違いはない（どちらも escalation）。

ただし `escalationReason` の有無には影響する可能性がある（verdict は同じ escalation でも、causal attribution が decision-needed 由来か canon 由来かで `escalationReason` の設定ロジックが分岐する）。この組み合わせが想定外の使われ方かどうかは仕様に明記されていない。バグではないが、doc コメントまたは spec の注記に「resolution: decision-needed の finding への fileMissing 適用は escalation verdict を変えない（decision-needed 由来の escalation が先に確定する）」を追記することで理解を助けられる。
