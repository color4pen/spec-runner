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
| B-1〜B-5（why つき）| 守るべき構造制約と判断原理 | `model.md` §4 |

### 注入の配線（別セッションが実装）
- spec-runner は既に design/implementer に `rules.md`（`copyRulesToChangeFolder`）と `project.md`（`needsProjectContext`）を注入している。**architecture/ の上記を同経路で writer に渡す**のが配線タスク。
- 配線箇所: `src/prompts/`（system prompt 注入）/ `src/core/runtime/*`（`setupWorkspace` での change folder コピー）/ `src/core/step/`（`needsProjectContext` 相当の `needsArchitecture` 等）。
- 粒度方針: 1 step = 1 関心（Lost-in-the-Middle 回避、per-step-rule ADR）。implementer には components/domain を厚く、review 系には B-1〜B-5 を criteria として。

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

- 現状: `tests/unit/architecture/module-boundary.test.ts` は `core/request` のみ・`core/runtime` 除外。→ **core 全体へ拡張＋除外解除**が歯タスク（model.md §6）。
- closure: model.md §3 の許可行列にない edge を全て divergence にする（`allowed` whitelist 方式）。

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

| 達成項目 | 種別 | 状態 |
|---|---|---|
| 書く側に構造が注入され、conforming に書ける | doc（内容＝完）/ 配線＝コード | doc ✅ / 配線 ❌ |
| 決定的レビュー（B-1〜B-8）が CI で効く | 歯＝コード | 仕様 ✅ / 実装 ❌ |
| 判断レビューが構造を criteria に照合 | doc（観点＝完）/ 配線＝コード | doc ✅ / 配線 ❌ |

→ **ドキュメント（注入内容・歯の仕様・review 観点）はここで完成**。残るは配線と歯の**実装＝別セッション**。本書がその実装指示書になる。

---

## 別セッションへの実装ハンドオフ（順序）

1. **歯（B-1〜B-8 + closure）**: `tests/unit/architecture/` を core 全体へ拡張（or dependency-cruiser 導入）。B-6/B-7（credential/出力 seam）・B-8（runtime 分岐集約）・単一 mutator（status 書きは `transitionJob` 経由のみ）も同 arch test に含める。先に divergence 是正（model.md §5 R1〜R3 + B-6/B-7/B-8）してから green 化。併せて `tests/` の二重構造（`tests/core/` と `tests/unit/`）の整理もここで巻き取る。
2. **writer 注入**: architecture/ を design/implementer の change folder / system prompt に注入（rules.md 経路の拡張）。
3. **reviewer 注入**: code-review/spec-review の criteria に (B) を追加。

いずれも CODEOWNERS-gated。詳細な配置・型は components.md / domain-model.md、依存規則は model.md。
