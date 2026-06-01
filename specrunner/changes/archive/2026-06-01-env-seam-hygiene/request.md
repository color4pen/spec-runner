# raw process.env を stripSecrets seam 経由に統一する（B-6）

## Meta

- **type**: refactoring
- **slug**: env-seam-hygiene
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

B-6（subprocess / SDK へ渡す env は `stripSecrets` seam〔`util/env-filter`〕経由。raw `process.env` を直接渡さない）の現状違反を full ratchet の allowlist が凍結中:

- **B6-preflight**（×3）: `src/core/preflight.ts` が `resolveGitHubToken(process.env...)` / `checkRuntimePrereqs(config, process.env...)` / `resolveSpecRunnerApiKey(process.env...)` に raw `process.env` を渡す。
- **B6-diagnostic**: `src/core/lifecycle/diagnostic.ts` が `process.env["SPECRUNNER_DEBUG"]` を直読み。
- **B6-commands**: `src/core/verification/commands.ts` が `process.env.PATH` を直読み。

## 要件

1. 各 site が raw `process.env` を直接読まず、**`stripSecrets` seam 経由 または 注入された env-provider 経由**にする:
   - `preflight.ts`: `env` を injectable parameter として thread する（テスト注入も容易になる）。
   - `diagnostic.ts` / `commands.ts`: env 値を注入 or seam 関数経由で取得する。
2. `arch-allowlist.ts` の **B-6 エントリ（5件）を全件削除**する。
3. **【R3 の教訓】** 本 change は **B-6 category を空にする**ため、T-04 の B-6 suppression-demo test を **B-3 の `B3-logger` entry（`src/logger/pipeline-logger.ts` → `core/event/event-bus`）へ repoint** して regression guard を維持すること。※**repoint 先に B-8 を選ばないこと** —— 並行 change `runtime-branch-consolidation` が B-8 を空にするため、B-8 を指すと後続 finish で再び崩れる。`B3-logger` は全 follow-on で生存する。

## スコープ外

- B-7（出力 mask）・B-8（runtime 分岐）・他 invariant。
- doctor の実 secret 解決経路（既に専用 resolved* field 経由なら触らない）。
- **振る舞い変更**（env の読み取り経路を seam に寄せるのみ）。

## 受け入れ基準

- [ ] `src/core/` に raw `process.env` 直参照が無い（B-6 arch test が green）
- [ ] `arch-allowlist.ts` の B-6 エントリが削除され、enforcement suite が **green**
- [ ] T-04 の B-6 suppression-demo が生存 entry へ repoint され regression guard が有効
- [ ] preflight / diagnostic / verification の挙動が不変
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **B-2 と対の値封じ込め**: credential が子プロセス / SDK に漏れないよう env を seam 一点に。
- **preflight は env を param 化が筋**: テスト注入が楽になり、raw `process.env` 依存を切れる。
- **ratchet が fix の完全性を機械強制**: B-6 allowlist を消すと core に raw env が残れば B-6 test が red。
