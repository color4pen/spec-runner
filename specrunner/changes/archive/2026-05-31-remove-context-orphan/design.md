# Design: remove-context-orphan

## Context

`src/context/` は `request-patterns.ts` 1 ファイルのみを含む directory。
production code からの import は 0 件（唯一の参照は `tests/unit/context/request-patterns.test.ts`）。

このモジュールは #124 で few-shot context 注入のために追加され、archive design.md が retain を決定した。
しかし本来の consumer（create REPL）は #137 で廃止済みであり、後継の `request-generate` は `collectRequestPatterns` / few-shot を採用しない設計で確定している。

architecture model.md §2 層 mapping 表・§3 closure 行列の双方から漏れた唯一の `src/*` dir であり、dead orphan として検出された。

## Goals / Non-Goals

**Goals**:

- `src/context/` を dir ごと削除し dead orphan を除去する
- 対応するテスト `tests/unit/context/` を削除する
- 層台帳の「表にあるものは実在し使われている」契約を維持する

**Non-Goals**:

- `architecture/model.md` への変更（除去するため不要）
- `request-generate` の挙動変更・few-shot 機能の再実装
- arch test の core 全体拡張（E1）

## Decisions

### D1: ディレクトリごと削除する（ファイル単体ではなく）

**Rationale**: `src/context/` には `request-patterns.ts` 以外のファイルが存在しない。ディレクトリ自体を残すと空ディレクトリが git 上に残り（.gitkeep がない限り残らないが）、将来の混乱原因になる。dir ごと `rm -rf` で除去する。

**Alternatives considered**:
- ファイルのみ削除して dir を残す → 空 dir は git に残らないが意図が不明瞭

### D2: grep による参照不在の事後検証を受け入れ基準に含める

**Rationale**: 現時点で production import は 0 件だが、削除時に見落としがないことを検証する必要がある。`collectRequestPatterns` / `RequestPattern` / `request-patterns` の 3 パターンで grep し、削除対象以外のヒットがないことを確認する。

**Alternatives considered**:
- TypeScript compiler error のみに頼る → re-export やバレルが無いため tsc では検出できない import 漏れがあり得る

## Risks / Trade-offs

[Risk] 将来 few-shot context 注入が必要になった場合に再実装が必要 → **Mitigation**: archive に design.md と実装履歴が残っている。後継 `request-generate` が別経路で確定しており、復活の前提自体が消えている。

## Open Questions

なし。
