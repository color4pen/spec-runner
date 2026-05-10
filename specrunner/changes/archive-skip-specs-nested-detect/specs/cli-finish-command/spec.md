# cli-finish-command Specification (Delta)

**Spec Name**: cli-finish-command  
**Modification Type**: MODIFIED  
**Delta Date**: 2026-05-03  
**Reason**: Align archive auto-detection with openspec nested delta spec convention

## MODIFIED Requirements

### Requirement: `specrunner finish` は archive 時の `--skip-specs` 自動判定を nested delta spec convention で行う

Phase 1 の `openspec archive <slug>` 実行時、MUST 次の検出ロジックで `--skip-specs` flag の付与を判定する SHALL:

1. **Nested convention 検出（優先）**: `openspec/changes/<slug>/specs/` 配下の immediate children のうち directory 判定（`fs.stat().isDirectory()`）が true のものを列挙し、各 directory 内に `spec.md` が存在する（`fs.exists()`）かを判定する。1 つでも存在すれば `hasSpecFiles=true` とみなし、`--skip-specs` を SHALL NOT 付与する。

2. **Flat layout fallback（後方互換）**: Nested convention で spec file が検出されなかった場合、`specs/` 配下の immediate children のうち `.md` で終わるファイル名が存在するかを判定する。1 つでも存在すれば `hasSpecFiles=true` とみなし、`--skip-specs` を SHALL NOT 付与する。

3. **検出失敗 / 不在**: `specs/` directory が存在しない、空、または上記 2 条件いずれにも該当しない場合、`hasSpecFiles=false` とみなし、`openspec archive <slug> --skip-specs` を実行する。

検出は MUST Phase 1 の archive 実行前に同期的に完了する SHALL。検出中の filesystem error（readdir fail / stat fail / exists fail）は MUST catch して `false` として扱う SHALL（escalation しない）。

#### Scenario: Nested delta spec で `--skip-specs` 無し archive

- **WHEN** `openspec/changes/<slug>/specs/<spec-name>/spec.md` が 1 つ以上存在する（例: `specs/cli-finish-command/spec.md`）
- **THEN** `openspec archive <slug>` が `--skip-specs` なしで実行され、delta spec が base spec に反映される

#### Scenario: Flat layout で `--skip-specs` 無し archive（fallback）

- **WHEN** `openspec/changes/<slug>/specs/*.md` が 1 つ以上存在する（例: `specs/delta.md`）
- **AND** Nested convention に該当する spec file が存在しない
- **THEN** `openspec archive <slug>` が `--skip-specs` なしで実行され、delta spec が base spec に反映される

**Note**: Nested convention は openspec の標準 delta spec layout（`specs/<spec-name>/spec.md`）。Flat layout は後方互換性のための fallback であり、openspec の convention には含まれない。検出順序は nested-first であるため、nested と flat が混在する場合は nested が優先される。

#### Scenario: Delta spec 無しで `--skip-specs` 付与 archive

- **WHEN** `openspec/changes/<slug>/specs/` directory が空、または directory のみで `spec.md` が存在しない
- **THEN** `openspec archive <slug> --skip-specs` が実行され、archive 操作は change folder の削除のみ行う（base spec への反映なし）

#### Scenario: Mixed layout（1 valid nested + 1 empty dir）で `--skip-specs` 無し

- **WHEN** `specs/valid-spec/spec.md` が存在し、`specs/empty-dir/` が存在するが `spec.md` が無い
- **THEN** 少なくとも 1 つの spec file が検出されるため `openspec archive <slug>` が `--skip-specs` なしで実行される
