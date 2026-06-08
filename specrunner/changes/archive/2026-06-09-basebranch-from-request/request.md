# adapter の baseBranch fallback を request.md から読む形に修正する

## Meta

- **type**: bug-fix
- **slug**: basebranch-from-request
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

3 つの adapter runner が StepContext 構築時に `baseBranch: "main"` をハードコードしている。

- `src/adapter/claude-code/agent-runner.ts:151`
- `src/adapter/codex/agent-runner.ts:128`
- `src/adapter/managed-agent/agent-runner.ts:542`

request.md には `base-branch` フィールドが必須で存在し、request parser（`parseRequestMd`）が読み取っている。CLI の `run` コマンド（`src/cli/run.ts`）と `archive` コマンド（`src/cli/archive.ts:109`）は request.md から `baseBranch` を取得するが、adapter 層がそれを使わず `"main"` に fallback している。

結果として `master` / `develop` / その他のデフォルトブランチを使うプロジェクトでは、worktree の base、diff 比較、PR target が黙って `main` に向き、間違った結果になる。

## 要件

1. 3 つの adapter runner の `baseBranch: "main"` を、`AgentRunInput.requestBaseBranch` 経由で request.md の `base-branch` 値を参照する形に変更する。
2. `base-branch` が JobState に含まれていない場合（旧 state との後方互換）は `"main"` に fallback する。
3. 修正に対応するテストケースを追加する（baseBranch が `"main"` 以外の場合に正しく渡されることを検証）。

## スコープ外

- request.md の `base-branch` フィールド自体の変更（既に必須として存在）。
- CLI 層の baseBranch 読み取り（既に正しく実装されている）。
- adapter 内の他の "main" ハードコード（PR create 時の base は別経路で渡されている）。

## 受け入れ基準

- [ ] 3 つの adapter runner が request.md の `base-branch` 値を使って StepContext を構築する
- [ ] `base-branch: develop` の request で baseBranch が `"develop"` として伝搬されることをテストで検証する
- [ ] `base-branch` が state に含まれない旧 state で `"main"` に fallback する
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- baseBranch は `AgentRunInput` に `requestBaseBranch?: string` を追加し、`executor.ts` で `deps.request.baseBranch`（ParsedRequest から取得可能）を埋める形で adapter に渡す。`requestAdr` と同じパターン（最小変更）。adapter は `ctx.input.requestBaseBranch ?? "main"` を使用する。
- JobState の `RequestInfo` 型は変更しない（スキーマ変更を避ける）。
- fallback `"main"` は `requestBaseBranch` が undefined の場合（旧 state から resume した場合等）の後方互換として残す。
