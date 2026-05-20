## Requirements

### Requirement: `specrunner finish` コマンドは `specrunner job finish` に移動する

`specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` の全機能は `specrunner job finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` として提供される。コマンド名以外の振る舞い・引数・フラグ・Phase 構造はすべて既存仕様を維持する。

旧 top-level `specrunner finish` は SHALL NOT 動作する（`Unknown command: finish` を返す）。

#### Scenario: `specrunner job finish <slug>` が旧 `specrunner finish` と同等に動作する

- **WHEN** ユーザーが `specrunner job finish my-feature` を実行する
- **THEN** 既存の `specrunner finish my-feature` と同一の Phase 0〜4 フローで動作し、exit code / stderr / stdout 出力は旧コマンドと同等である

#### Scenario: 旧 top-level `specrunner finish` は廃止される

- **WHEN** ユーザーが `specrunner finish my-feature` を実行する
- **THEN** `Unknown command: finish` を stderr に出し exit code 2 で終了する（`job finish` へ誘導するヒントを含む）

## Renamed

- "`specrunner finish` は `<slug>` を第一形の入力とし、複数 source の fallback で対象 job を解決する" → "`specrunner job finish` は `<slug>` を第一形の入力とし、複数 source の fallback で対象 job を解決する"
- "`specrunner finish` は Phase 0 pre-flight を irreversible op の前に全実行する" → "`specrunner job finish` は Phase 0 pre-flight を irreversible op の前に全実行する"
- "`specrunner finish` は archive 操作を feature branch に commit する 1-PR モデルで動作する" → "`specrunner job finish` は archive 操作を feature branch に commit する 1-PR モデルで動作する"
- "`specrunner finish --dry-run` は Phase 0 のみ実行し destructive op を一切呼ばない" → "`specrunner job finish --dry-run` は Phase 0 のみ実行し destructive op を一切呼ばない"
- "`specrunner finish` は markJobArchived を Phase 4 の最後に実行し状態乖離を防ぐ" → "`specrunner job finish` は markJobArchived を Phase 4 の最後に実行し状態乖離を防ぐ"
- "`specrunner finish` は LLM を呼び出さない pure CLI である" → "`specrunner job finish` は LLM を呼び出さない pure CLI である"
- "`specrunner finish` は escalation 時に統一フォーマットで report する" → "`specrunner job finish` は escalation 時に統一フォーマットで report する"
- "`specrunner finish` は冪等で resume 可能である" → "`specrunner job finish` は冪等で resume 可能である"
- "`specrunner finish` は Phase 3 の merge 実行前に PR の mergeable 状態を確認する" → "`specrunner job finish` は Phase 3 の merge 実行前に PR の mergeable 状態を確認する"
