# JobStateStore を内部コンポーネントへ分割する（public API 不変）

## Meta

- **type**: refactoring
- **slug**: jobstatestore-internal-split
- **base-branch**: main
- **pipeline**: fast
- **adr**: false

## 背景

execution-ownership ADR の後段整理。`src/store/job-state-store.ts`（約920行）に job 探索・location 解決・journal・projection・migration が混在している。内部委譲へ分ける。**public API は維持し、挙動を変えない**。

## 現状コードの前提

- `src/store/job-state-store.ts`（約920行）に:
  - job 探索・ID 解決・active/archive/worktree 走査（`list` / `listWithSourceDirs`）
  - location 解決（slug / stateRoot / changeDir）
  - journal append / counter / integrity
  - projection 合成（journal fold）
  - legacy migration（旧形式 dual-read）
  - state load / persist / mutation helper

## 要件

1. 内部委譲へ分割: **`JobCatalog`**（探索・ID 解決）/ **`JobLocationResolver`**（保存場所）/ **`JobJournal`**（append・counter・integrity）/ **`JobStateProjection`**（journal→state 合成）/ **`LegacyStateMigrator`**（旧形式読込）。
2. `JobStateStore` は公開 facade として維持し、内部でこれらへ委譲する。

## スコープ外（越えたら構造抽出でなく別 request。fast のまま押し切らない）

- public API を変更しない
- persist 順序を変更しない
- journal truth の範囲を変更しない
- location 選択規則を変更しない
- migration semantics を変更しない
- optimistic revision を導入しない

## 受け入れ基準

- [ ] catalog / location / journal / projection / migration が内部コンポーネントへ委譲される。
- [ ] 公開 API・呼び出し側が無変更。
- [ ] **既存テストの期待振る舞いを書き換えない**（挙動不変）。機械的更新は許容。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 公開 API を維持し内部だけ分ける（呼び出し面の blast radius を出さない）。
- 上記スコープ外に触れる必要が判明したら、それは構造抽出でなく別 request（fast のまま進めない）。
