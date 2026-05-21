# Delta: cli-finish-command — archive path format

## New Requirement: `specrunner job finish` の archive path は `<YYYY-MM-DD>-<slug>` 形式である

`specrunner finish` の Phase 1 で `specrunner/changes/<slug>/` を archive する際、archive 先パスは MUST `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` 形式とする。`<YYYY-MM-DD>` は finish 実行時刻のローカル日付（`new Date()` の `getFullYear()` / `getMonth()` / `getDate()`、実行マシンの timezone）。

この命名規約は ADR の `docs/adr/<YYYY-MM-DD>-<slug>.md` と同一の思想（「動作した日を path に刻む」）に基づく。

既存の archive dir（日付付き / 日付なし混在）は rename しない。新規 archive のみ本仕様を適用する。

#### Scenario: archive path に日付 prefix が付与される

- **WHEN** `specrunner finish my-feature` を 2026-05-21 に実行し、Phase 1 で `specrunner/changes/my-feature/` を archive する
- **THEN** archive 先は `specrunner/changes/archive/2026-05-21-my-feature/` である

#### Scenario: slug collision 検出が日付 prefix 付き archive dir に対応する

- **WHEN** `specrunner/changes/archive/2026-05-20-my-feature/` が存在する状態で slug `my-feature` の collision check を実行する
- **THEN** collision が検出される（日付 prefix を strip して slug 比較するため）

#### Scenario: 既存の日付なし archive dir でも collision 検出される

- **WHEN** `specrunner/changes/archive/my-feature/` が存在する状態で slug `my-feature` の collision check を実行する
- **THEN** collision が検出される（後方互換）
