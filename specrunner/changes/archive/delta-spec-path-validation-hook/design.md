# Design: delta-spec-path-validation-hook

## Context

designer agent が旧形式 path (`<change>/delta-spec/<capability>.md` 等) に delta spec を書く現象が再発する。prompt に禁止例があっても LLM は学習データの旧形式を引きずる。現状は `spec-merge.ts:474` の fail-fast が唯一の機械的検出ポイントだが、finish Phase 1 まで検出が遅延する。

本変更は delta spec の path / format 違反を **step 完了直後に検出し、独立 loop で修正させる** pipeline 拡張を行う。

## Goals

- delta spec path/format 違反を design / spec-fixer 完了直後に検出する
- 違反時に専用 fixer で修正させる（spec-review loop の試行を消費しない）
- prompt 規律の二重管理を共通定数で解消する

## Non-Goals

- rescue layer（CLI 自動 rename）
- write tool restriction（adapter level block）
- spec-merge 全体の再設計
- delta spec を書かない step への拡大

## Decisions

### D1: 独立 deterministic step + 専用 fixer pair

既存パターン `VerificationStep` (CliStep) + `BuildFixerStep` (AgentStep) と同型の pair を追加する。

- `delta-spec-validation`: CliStep。`validateDeltaSpecPaths()` を呼び verdict を返す
- `delta-spec-fixer`: AgentStep。spec-fixer agent definition を流用し validation 違反 feedback を注入

**Alternatives rejected:**
- `finalizeStep()` hook 埋め込み: state machine 真実性の劣化 / executor SRP 違反
- rescue layer: agent 行動の責務を曖昧にする

### D2: transition table 差し替え

既存:
```
design → spec-review
spec-fixer → spec-review
```

変更後:
```
design → delta-spec-validation → spec-review
spec-fixer → delta-spec-validation → spec-review
delta-spec-validation ↔ delta-spec-fixer (独立 loop)
```

### D3: counter 独立化

`loopNames` に `"delta-spec-validation"` を追加。pipeline の `loopIters` Map で独立カウントされるため、spec-review / verification / code-review の counter を消費しない。

### D4: loopFixerPairs の最小定義

#269 (`code-fixer-final-iter-reviewed`) が未マージの場合、本 request で `loopFixerPairs` の型と初期化を最小定義する:
- 型: `Record<string, string>` (= review step → fixer step)
- Pipeline コンストラクタ引数に optional `loopFixerPairs` を追加
- 本 request では entry 1 行 (`{ [DELTA_SPEC_VALIDATION]: DELTA_SPEC_FIXER }`) のみ
- #269 マージ時に entry 追加で統合

#269 が先行マージ済みなら entry 追加 1 行で済む。実装時に `pipeline.ts` を確認し判断する。

### D5: validator の DI 設計

`validateDeltaSpecPaths()` は `{ readdir, readFile }` を DI parameter として受け取る。`FinishFs` interface のサブセットと整合する設計。テスト時に fs mock を注入可能。

### D6: delta-spec-fixer は spec-fixer agent 流用

新規 system prompt は作らない。`SPEC_FIXER_SYSTEM_PROMPT` をそのまま使い、user prompt に validation 違反詳細を注入する。agent role は `"delta-spec-fixer"` で別名にし、step name 定数・agent definition を分離する。

### D7: prompt 統一の共通定数

`src/prompts/delta-spec-format.ts` を新設し、正規 path / 禁止 path / section header 規約を定数化。`design-system.ts` と `spec-fixer-system.ts` の両方から import。文言の二重管理を排除。

### D8: spec-merge fail-fast は維持

`spec-merge.ts:474` の semantic empty delta check は削除しない。validation step で防げなかった edge case の最後の砦として二重防衛。

### D9: spec authority 反映先

- `step-execution-architecture`: MODIFIED — 新 step 2 種の定義を追加
- `pipeline-orchestrator`: MODIFIED — transition table / loopNames / LOOP_ERROR_CODES の拡張を反映

## Risks / Trade-offs

- [Risk] #269 未マージ時の `loopFixerPairs` 型重複 → Mitigation: 最小定義 + #269 マージ時に統合（衝突は 1 行）
- [Risk] delta-spec-fixer が修正に失敗し続けて exhaust → Mitigation: LOOP_ERROR_CODES に entry 追加し escalation で human に戻す
- [Risk] validator の判定ルールが厳しすぎて正規ファイルを誤検出 → Mitigation: 正規 path `specs/<cap>/spec.md` のみ format check、それ以外は path 違反のみ検出

## Open Questions

- なし（request.md で設計判断が確定済み）
