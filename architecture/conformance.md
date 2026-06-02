# Conformance — 構造を「書く / レビューする」に効かせる仕様

> 定義（model.md / components.md / domain-model.md）は、**pipeline の write と review に注入されて初めて実用**になる。読まれない定義は shelf-ware。
> 本書は2つの消費点（書く agent / レビューする側）への接続仕様。**注入の配線と歯の実装はコード（別セッション）**だが、その「何を・どこで」をここで確定する。

---

## 消費点1: 書く（design / implementer / 各 fixer）

agent が構造に沿ったコードを書くために、何を読ませるか。

### 注入する内容
| 渡すもの | 何のため | 出典 |
|---|---|---|
| 層 + 許可された依存（DSM） | どこに置くか・何に依存してよいか | `model.md` §2/§3 |
| コンポーネント責務 + 実装すべき interface | 何を実装するか（Step / port 契約）| `components.md` |
| ドメイン型 + 不変条件 | どの型を使うか・store 経由で触る等 | `domain-model.md` |
| B-1〜B-9（why つき）| 守るべき構造制約と判断原理 | `model.md` §4 |

### 注入の配線（別セッションが実装）
- spec-runner は既に design/implementer に `rules.md`（`copyRulesToChangeFolder`）と `project.md`（`needsProjectContext`）を注入している。**architecture/ の上記を同経路で writer に渡す**のが配線タスク。
- 配線箇所: `src/prompts/`（system prompt 注入）/ `src/core/runtime/*`（`setupWorkspace` での change folder コピー）/ `src/core/step/`（`needsProjectContext` 相当の `needsArchitecture` 等）。
- 粒度方針: 1 step = 1 関心（Lost-in-the-Middle 回避、per-step-rule ADR）。implementer には components/domain を厚く、review 系には B-1〜B-9 を criteria として。

---

## 消費点2: レビューする（request 出力が構造に沿うか）

2系統あり、**どちらも別の機構**で担う。

### (A) 決定的レビュー = 歯（arch test / dependency-cruiser）
判断を介さず CI が ○×。**実装はコード（別セッション）**。下表が「何を assert するか」の仕様。

| 不変条件 | assert する内容 | 検査方法の候補 |
|---|---|---|
| **B-1** domain ↛ adapters | `src/core`（runtime 除く）が `src/adapter` を import しない | grep / dependency-cruiser `forbidden` |
| **B-2** SDK 封じ込め | `@anthropic-ai/*` `@openai/*` が adapters の外（core/ports/comp-root）に現れない | import 検査 |
| **B-3** 上向き禁止 | shared-kernel / leaf / persistence が domain を import しない（循環検出含む）| dependency-cruiser circular + `forbidden` |
| **B-4** leaf | `util/` が他 src を import しない | import 検査 |
| **B-5** 判定系 pure | verdict / transition / spec-rules が `node:fs`/`child_process` を import しない | import 検査 |
| **B-6** credential 封じ込め | spawn / SDK query の env が `stripSecrets(process.env)` 経由か（raw `process.env` を子プロセス env に渡していない）| import / 呼び出し検査（`spawnCommand` ・SDK query の env 引数）|
| **B-7** 出力 mask | logger seam の外で raw `process.stdout/stderr.write` を呼んでいないか（ANSI 制御除く）| grep / import 検査 |
| **B-8** runtime 分岐集約 | `config.runtime` の分岐が `createRuntime` 以外（domain/CLI）に現れていないか | grep 検査 |
| **B-9** status 単一 mutator | `JobState.status` の変更が `transitionJob` 経由のみか（`patch`/`persist` で status 直書きしていないか）| grep 検査 |
| **B-10** host↔token 束縛 | composition-root の全 `resolveGitHubToken` 呼び出しに host 引数、全 `createGitHubClient` 呼び出しに baseUrl 引数があるか（token を誤った host へ送らない構造前提）| grep 検査（call-site）|

- 歯: `tests/unit/architecture/core-invariants.test.ts` が src 全体で上記 B-1〜B-10 を検査する。`arch-allowlist.ts` の grandfather 台帳は削除のみで縮む ratchet。`module-boundary.test.ts` も併存。
- closure: model.md §3 の許可行列にない edge を全て divergence にする（`allowed` whitelist 方式＝DSM 検査）。
- 現状の divergence・実装状態は `divergence-status.md`（状況断面）を参照。

### (B) 判断レビュー = review agent の criteria
code-review / spec-review / module-architect が、構造に照らして判断する観点。**構造を criteria として注入**して使わせる。

| 観点 | 何を見るか | 出典 |
|---|---|---|
| 責務の整合 | 追加/変更が当該コンポーネントの責務内か（executor 肥大化等）| components.md |
| interface 準拠 | 新 step が `Step` 契約を満たすか / 新 IO が port 経由か | components.md |
| ドメイン型の使用 | state を `JobStateStore` 経由で触るか | domain-model.md |
| 層配置 | 新規モジュールが正しい層に置かれ mapping に整合するか | model.md §2/§3 |
| non-goal | 宣言した非目標（重い ceremony 等）に触れていないか | model.md §1 |

- 配線: spec-runner の code-review/spec-review の scoring/criteria に上記を足す（`src/prompts/*-review-system.ts` / PIPELINE_RULES 相当）。**コード＝別セッション**。

---

## 「実用レベル」の定義（このファイルの達成基準）

| 達成項目 | 種別 |
|---|---|
| 書く側に構造が注入され、conforming に書ける | doc（内容）/ 配線（コード）|
| 決定的レビュー（B-1〜B-9 + closure）が CI で効く | 歯（コード）|
| 判断レビューが構造を criteria に照合 | doc（観点）/ 配線（コード）|

本書は注入内容・歯の仕様・review 観点という**時間に依存しない仕様**を定める。各項目の現状の達成状態（配線済みか等）は `divergence-status.md` を参照。

---

## 別セッションへの実装ハンドオフ（順序）

歯（B-1〜B-9 + closure）の assert 仕様は上記 (A)。残る配線:

1. **writer 注入**: architecture/ を design/implementer の change folder / system prompt に注入（rules.md 経路の拡張）。
2. **reviewer 注入**: code-review/spec-review の criteria に (B) を追加。
3. **`tests/` 二重構造**（`tests/core/` と `tests/unit/`）の整理。

いずれも CODEOWNERS-gated。各項目の着手状況は `divergence-status.md`。詳細な配置・型は components.md / domain-model.md、依存規則は model.md。
