# Design: archive 親ディレクトリの実行時保証で初回 finish を完走させる

## Context

`archiveChangeFolder`（`src/core/finish/archive-change-folder.ts`）は change folder を
`specrunner/changes/<slug>/` から `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ `git mv` で移動する。
`git mv <src> <dst>` は dst の親ディレクトリ（`specrunner/changes/archive/`）がファイルシステム上に存在することを前提にする。
存在しないと git は `fatal: renaming '...' failed: No such file or directory`（exit 128）で失敗する。

`specrunner init`（`src/cli/init.ts`）は `specrunner/drafts/` と `specrunner/changes/` のみ作成し、`changes/archive/` は作らない。
`archive/` は最初の archive 成功時に `git mv` が結果的に作る副産物であり、それまでは存在しない。
したがって一度も archive していないリポジトリの初回 `job finish` は `archive-change-folder` step で必ず exit 128 になる。
二度目以降は `archive/` が既に存在するため踏まない。

呼び出し経路は `runArchiveOrchestrator`（`src/core/archive/orchestrator.ts` Phase 1）→
`archiveChangeFolder({ slug, cwd, spawn, fs })`。`fs` は `FinishFs`（`src/core/finish/types.ts`）で、
`mkdir(path, { recursive })` を既に備える。実体（`src/cli/archive.ts`）は `node:fs/promises.mkdir` に束ねられている。
paths utility（`src/util/paths.ts`）は `archivedChangesDirRel()` → `"specrunner/changes/archive"` を既に提供する。

### 触れる主な seam

- `src/core/finish/archive-change-folder.ts` — `git mv` 実行箇所。唯一の変更対象（src 側）。
- `src/util/paths.ts` — `archivedChangesDirRel()`（既存・読み取りのみ）。
- tests: `tests/unit/core/finish/archive-change-folder.test.ts`（既存・このモジュールの canonical テストファイルに追記）。

## Goals / Non-Goals

**Goals**:

- 一度も archive していないリポジトリの初回 `job finish` が `archive-change-folder` で exit 128 にならず完走する。
- archive 親ディレクトリ `specrunner/changes/archive/` の存在を step 実行時に保証する（idempotent）。

**Non-Goals**:

- `specrunner init` での `.gitkeep` 生成や `archive/` 事前作成（実行時保証を選択する）。
- `archive/` が既に存在するリポジトリの archive 挙動の変更。
- `git mv` 以外の archive ロジック（git add / commit / push / state 遷移 / worktree 撤去）の変更。

## Decisions

### D1: `git mv` 直前に移動先の親ディレクトリを `fs.mkdir(recursive)` で保証する

`archiveChangeFolder` で change folder 存在チェック（skip 判定）を通過した後、`git mv` を spawn する前に
`fs.mkdir(path.join(cwd, archivedChangesDirRel()), { recursive: true })` を実行する。
`archivedChangesDirRel()` は `specrunner/changes/archive` を返す。

**Rationale**: `git mv` の失敗原因は dst 親ディレクトリ不在の一点に尽きる。これを mv 直前に保証すれば原因が消える。
`recursive: true` の mkdir は対象が既存でも throw せず副作用もない（idempotent）ため、
`archive/` 既存リポジトリでは実質 no-op になり挙動を変えない。`FinishFs` は既に `mkdir` を持ち実体も
`fs.promises.mkdir` に束ねられているため、新しい依存・新しい port を増やさない（minimal-deps）。

**Alternatives considered**:

- *init 時に `archive/.gitkeep` を作る*: 旧バージョンの init で作られた既存リポジトリには `archive/` が無いままなので、
  初回 finish で同じ失敗が残る。実行時保証なら全経路を同一の seam が通り、保証漏れがない。architect 評価でも実行時保証を選択済み。却下。
- *`fs.exists` で不在を確認してから mkdir する*: `recursive: true` の mkdir が既に idempotent なので二段にする利点がなく、分岐を増やすだけ。却下。
- *`git mv` 失敗時に親ディレクトリを作って retry する*: exit 128 は他原因でも起こり得るため、失敗後 retry は原因を曖昧にし escalation を弱める。事前保証の方が単純で確実。却下。

### D2: mkdir は skip 判定の後・移動の前に置く

change folder が存在しない場合（TC-CF-002）は早期 return で skip するため、その前に mkdir を呼ばない。
`archive/` を作るのは実際に移動する時だけにし、skip 経路で無関係な副作用（空 `archive/` 生成）を起こさない。

**Rationale**: skip 経路は「移動すべきものが無い」状態であり、移動先の準備は不要。
副作用を移動経路に限定する方が読みやすく、「skip 時は git を呼ばない」という既存テストの不変条件とも整合する。

## Risks / Trade-offs

- [Risk] 空の `archive/` がファイルシステム上に作られても git は空ディレクトリを追跡しない → [Mitigation] `git mv` 成功後は
  `archive/<dated-slug>/` に内容が入り、後続の `git add specrunner/changes/` でステージされるため実害はない。

## Open Questions

なし。
