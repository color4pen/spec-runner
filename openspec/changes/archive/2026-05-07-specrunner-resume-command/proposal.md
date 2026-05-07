## Why

`awaiting-resume` status は PR #107 で導入されたが、実際に pipeline を再開する手段がない。ユーザーは `specrunner run` で最初からやり直すしかなく、propose・spec-review・implementer で完了した作業が無駄になる。resume コマンドは停止した pipeline を途中から再開し、作業の無駄を排除する。

## What Changes

- `src/cli/resume.ts` を新規作成 — resume コマンドのコア実装
- `src/core/resume/` を新規作成 — resume-point 解決・安全チェックのドメインロジック
- `bin/specrunner.ts` を修正 — `resume` case を switch に追加
- `Pipeline.run()` を既存 signature のまま使用（変更なし）— 任意 step からの開始は既にサポート済み

## Capabilities

### New Capabilities

- `resume-command`: `specrunner resume <slug>` で `awaiting-resume` の job を再開する
- `resume-point-override`: `--from critic|fixer|creator` で再開起点を変更する
- `resume-safety-gate`: 連続 escalation 検出・stale state 警告

### Modified Capabilities

- `cli-dispatch`: `bin/specrunner.ts` に `resume` case を追加

## Impact

- **Data/Schema**: 変更なし（`ResumePoint` と `awaiting-resume` status は既存）
- **Code**: `src/cli/resume.ts` + `src/core/resume/` を新規追加。既存コードへの変更は `bin/specrunner.ts` のみ
- **API/Behavior**: 新規 CLI コマンド追加。既存コマンドの動作に影響なし
- **Dependencies**: なし（既存の internal module のみ使用）
- **Tests**: resume コマンドの unit tests + integration tests を追加
- **Documentation**: USAGE 文字列に resume を追加
- **Backward compatibility**: 完全互換。新規コマンドの追加のみ
