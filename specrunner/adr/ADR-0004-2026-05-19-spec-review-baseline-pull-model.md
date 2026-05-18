# spec-review Baseline 取得: Read-tool-pull モデルへの切替

**Date**: 2026-05-19
**Status**: accepted

## Context

spec-review の `## Baseline Spec Consistency Check` は **初期メッセージ注入モデル（Push モデル）** で実装されていた:

1. `SpecReviewStep.enrichContext()` が baseline spec を `fs.readFile` で読み取り `DynamicContext.baselineSpecs` に格納
2. `buildSpecReviewInitialMessage()` が `{{BASELINE_SPECS}}` placeholder を `<baseline-specs>` XML セクションに展開
3. system prompt が「When baseline specs are provided in the initial message」で条件分岐
4. **caller が populate しなければ無音 skip** (system prompt: "If no baseline specs are provided, skip this check entirely.")

この構造の問題点: caller が `baselineSpecs` を渡さない限り check が発火しない。

PR #306 / PR #308 の finish で同型の spec-merge escalation が連続発生した（delta spec の `## MODIFIED Requirements` 配下 Requirement header が baseline に存在しない）。root cause は caller（`SpecReviewStep`）が `enrichContext()` を通じて `baselineSpecs` を populate していたが、その経路が断線していたことによる無音 skip だった。

設計元の openspec-workflow (`agents/spec-reviewer.md` §2.1) は **Read-tool-pull モデル** を採用しており、agent 自身が `Read` tool で baseline を取得するため caller の入力組み立てに依存しない。

## Decision

spec-review の baseline 取得を **Read-tool-pull モデル** に切り替える。

### 廃止する経路

- `SpecReviewPromptInput.baselineSpecs?: Record<string, string>` input field
- `{{BASELINE_SPECS}}` placeholder および `<baseline-specs>` XML セクション構築ロジック
- `DynamicContext.baselineSpecs?: Record<string, string>` field
- `SpecReviewStep.enrichContext()` 内の baseline 収集ロジック（specs/ ディレクトリ走査 + `fs.readFile`）
- `buildSpecReviewInitialMessage()` への `baselineSpecs` 受け渡し

### 新しい手順（system prompt に明示）

`## Baseline Spec Consistency Check` セクションを以下の 7 ステップ手順に書き換える:

```
1. Identify the capability name from the delta spec path
   (`specrunner/changes/<slug>/specs/<capability>/spec.md`)
2. Read `specrunner/specs/<capability>/spec.md` using the Read tool
3. Extract existing `### Requirement:` headers from the baseline
4. For MODIFIED / REMOVED / RENAMED-FROM headers: verify each exists in baseline
5. For ADDED headers: verify each does NOT already exist in baseline
6. For each mismatch, report a HIGH severity finding (category: consistency)
7. If the baseline file does not exist and the delta has MODIFIED/REMOVED sections,
   report a HIGH severity finding (category: consistency)
```

"If no baseline specs are provided, skip this check entirely." を削除し、caller 依存ゼロで **必ず check が実行される** 構造にする。

spec-review agent は `agent_toolset_20260401`（標準ツールセット）を使用しており、Read tool は既に権限内にある。追加の権限設定は不要。

## Alternatives Considered

### Alternative A: Push モデルを維持し caller 側を必須化（non-optional に）

`baselineSpecs` を optional から required に変更し、caller が必ず populate することを強制する。

- **Pros**: 既存 system prompt の変更が最小
- **Cons**: caller が複数存在する場合（将来の new entry point を含む）、すべてで populate を実装する義務が伝播する。「型で強制」しても new caller の実装者が気づかない可能性がある
- **Why not**: PR #306 / #308 の再発防止として不十分。caller が増えるたびに同じリスクが再現する構造的欠陥を抱え続ける

### Alternative B: machine check（TS コード）で MODIFIED/REMOVED header の存在を spec-review 前に検証

`SpecReviewStep` の前段で delta spec を parse し、baseline との header 照合を TypeScript コードで実装する。

- **Pros**: LLM の「忘れる」リスクがない。決定的な検証
- **Cons**: delta spec の parse ロジックの実装・保守コストが高い。spec-merge との重複。今回のスコープ（#313 Sub-1）を超える
- **Why not**: `spec-merge` への machine check 移植は #313 Sub-2 として別途対応予定。本変更は agent 側の check 経路を確実に機能させることが目的であり、Pull モデルで十分な信頼性が得られる

### Alternative C: enrichContext を必須実行に修正（populate 漏れを防ぐ guard を追加）

`SpecReviewStep.enrichContext()` が必ず呼ばれることを保証する guard を追加する。

- **Pros**: 既存の Push モデルを維持できる
- **Cons**: 根本原因が「caller の実装漏れ」である以上、guard はまた別の caller による迂回を防げない。またコード上で baseline を全 capability 分まとめて読み込む（不要な I/O）問題も解決しない
- **Why not**: Pull モデルの方が「agent が必要な capability のみ Read する」のでコンテキスト効率も良い

## Consequences

### Positive

- `baselineSpecs` 注入経路に依存していた silent skip が構造的に不可能になる
- caller の数が増えても system prompt に従い agent が必ず baseline を Read するため、新規 entry point での再発リスクがゼロ
- agent が必要な capability のみ Read するため、全 capability を一括取得していた旧実装より context 効率が向上する可能性がある
- `DynamicContext` / `SpecReviewStep.enrichContext()` / `buildSpecReviewInitialMessage()` のインターフェースが簡素化され、保守コストが下がる

### Negative

- agent の LLM がまれに Read ステップを省略する可能性がある。Push モデルは決定的だったが Pull モデルは LLM 依存になる
- 設計元（openspec-workflow）での実績はあるが、spec-runner 本体での長期実績はまだない

### Known Limitations

- baseline spec が大きい場合のコンテキスト圧迫は旧実装と同等（initial message 注入と Read 取得でサイズは同じ）
- `design-system.ts` 側の baseline 確認手順強化は本変更のスコープ外（別 issue で対応）
- `spec-merge` への machine check 移植（#313 Sub-2）は本変更と直交する。Pull モデルと machine check は併存できる

### Risks

- **agent が Read を怠る**: system prompt に MUST + 7-step 手順として明示することで緩和。将来的に機械検証（Sub-2）を追加することで完全な安全網を構築できる
- **既存 test の `baselineSpecs` 依存**: 該当テストを Pull モデル対応に書き換えることで regression を防ぐ（本 PR で対応済み）
