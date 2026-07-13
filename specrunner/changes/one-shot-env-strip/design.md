# Design: one-shot SDK query の env を stripSecrets 経由に統一し、B-6 の歯を env-omission まで強める

## Context

構造不変条件 **B-6**（`architecture/model.md` §4）は「subprocess / SDK query に渡す env は必ず `stripSecrets` seam（`util/env-filter`）経由。raw `process.env` を直接渡さない」を要求する。目的は credential（`GH_TOKEN` / `*_API_KEY` 等）を子プロセス・外部 SDK に継承させないこと（B-2 と対称な、型でなく値の封じ込め）。

Claude Agent SDK の `query()` を呼ぶ call-site は本リポジトリに **2 つだけ**存在する（設計時走査で確認済み。`src/adapter/claude-code/sdk-loader.ts` は loader であり query 呼び出しではない）:

| call-site | 現状の env 扱い | B-6 準拠 |
|---|---|---|
| `src/adapter/claude-code/agent-runner.ts:397, 453` | `const sdkEnv = stripSecrets(process.env as …)` を作り、query options に `env: sdkEnv` を渡す | ✅ 準拠 |
| `src/adapter/claude-code/query-one-shot.ts:130-141` | query options に **`env` キーが一切無い** | ❌ 非準拠 |

`query-one-shot.ts` は `env` を省略しているため、SDK は親プロセスの `process.env`（`GH_TOKEN` / `ANTHROPIC_API_KEY` 等の credential を含む）をそのまま継承しうる。これは B-6 の保証と不整合である。

さらに **B-6 の歯**（`tests/unit/architecture/core-invariants.test.ts` の `describe("B-6 …")`）は `grep -rEn "process\.env"` で raw 参照を検出し、`stripSecrets` を含む行を安全として除外する grep 検査である。「`env` キーを渡さない = `process.env` 参照を一行も書かない」**env-omission** は grep に一切現れず、この歯では検出できない。これは **B-12** が `node:child_process` 側で塞いだのと同型の盲点（env を省略した spawn / query）が、SDK query 側に残っている状態である。

現状の唯一の呼び出し元（request 生成 generator）は `allowedTools: []` / `maxTurns: 1` で走るため、モデルが env を読み出す実 exploit 経路は今は無い。しかし契約の穴自体は実在し、将来 one-shot にツールを許す呼び出しが増えれば顕在化する。本 change は (a) one-shot の env を strip 経由に統一し、(b) 歯を env-omission まで強めて再発を防ぐ。

**信頼配置の注記**: B-6 の grep 歯が住む `tests/unit/architecture/` は `CODEOWNERS`（`@color4pen`）ゲート下にある。本 change は **その grep 歯を無変更で緑のまま**にし（後述 D4）、env-omission の検出は query site に近い一般 unit test（`tests/unit/adapter/claude-code/`、非ゲート）に置く。これにより歯を強めつつゲート下ファイルを触らない。

## Goals / Non-Goals

**Goals**:

- `queryOneShot` の SDK query options に `env: stripSecrets(process.env)` を渡す（`agent-runner.ts` と同一の strip 経路）。one-shot の他挙動（allowedTools / permissionMode / maxTurns / model / systemPrompt / timeout / cwd / abortController）は不変。
- one-shot の SDK query が受け取る env が **secret を除去し非 secret を保持している**ことを、注入 `queryFn` で `options.env` を捕捉して固定する（behavioral 捕捉テスト）。
- **env-omission（query site が env を渡さない状態）を歯が red にする**ことを、検出テストで固定する。捕捉した env に対する純粋述語 `envOmissionViolations(env)` を歯の判定核とし、`env` 不在（undefined）と secret 混入の双方を red として報告できることを合成入力で示す。
- 既存の B-6 grep 歯（raw `process.env` 検出）を**検査ロジック無変更**で green に保つ。
- one-shot / codex の既存凍結テストを**無変更**で green に保つ。

**Non-Goals**:

- `stripSecrets` の denylist → allowlist 化（別議論。本 change は既存 strip の適用範囲を one-shot に広げるのみ）。
- one-shot の `permissionMode`（`"bypassPermissions"` のまま）/ sandbox / ツール制限の変更。
- `agent-runner.ts` 側の env 扱いの変更（既に B-6 準拠。本 change では一切触れない）。
- `env` に明示値を注入する API（呼び出し元が個別 env を渡す機構）の追加。
- **one-shot への `CLAUDE_CODE_OAUTH_TOKEN` 注入の追加**。`agent-runner.ts:398-403` は strip 後の `sdkEnv` に `resolveClaudeCodeOAuthTokenFn` 由来の token を注入するが、one-shot はこの処理を持たず、本 change でも追加しない（コピーペースト混入を明示的に禁止）。
- codex adapter・one-shot 以外の経路の挙動変更。
- `agent-runner.ts` への behavioral env テストの追加（既に B-6 準拠でスコープ外。将来拡張として Open Questions に記す）。

## Decisions

### D1: `queryOneShot` の query options に `env: stripSecrets(process.env)` をインラインで足す

`src/adapter/claude-code/query-one-shot.ts` に次を加える:

- ファイル冒頭に `import { stripSecrets } from "../../util/env-filter.js";`（adapters → leaf の許可 edge。§3 DSM closure 準拠）。
- Step 4 の query options オブジェクト（現状 line 132-140）に `env: stripSecrets(process.env as Record<string, string | undefined>)` を **1 プロパティとして追加**する。`agent-runner.ts:397` と同一のキャスト・同一の strip 関数を使う。
- 他のキー（`cwd` / `allowedTools` / `permissionMode: "bypassPermissions"` / `...maxTurnsOption` / `model` / `systemPrompt` / `abortController`）は**位置も値も変えない**。

- **Rationale**: B-6 が要求する「SDK query の env は `stripSecrets` seam 経由」を、参照実装（agent-runner）と**同一経路**で満たす。インライン（中間 `const sdkEnv` を持たない）にするのは、agent-runner の `sdkEnv` は直後に `CLAUDE_CODE_OAUTH_TOKEN` を注入するための可変中間変数だが、one-shot はその注入を**行わない**（Non-Goal）ため、可変中間変数を作らないことで「後から token 注入を足す」コピーペースト誘発を構造的に避ける。
- **Alternatives considered**:
  - *`const sdkEnv = stripSecrets(...)` を作ってから `env: sdkEnv`（agent-runner 完全模倣）* — 動作は同じだが、可変中間変数が `CLAUDE_CODE_OAUTH_TOKEN` 注入の受け皿に見え、request-review finding #2 が警告する混入リスクを招く。インラインの方が「strip した env をそのまま渡すだけ」という意図が明快。
  - *env 明示注入 API を足して呼び出し元が env を渡す* — Non-Goal（スコープ外）。本 change は既存 strip の適用範囲を広げるのみ。

### D2: env-omission の歯は query site の behavioral 捕捉を主とする（grep を従とせず追加しない）

env-omission の検出を、**注入 `queryFn` が受け取る `options.env` を捕捉して assert する** behavioral テストで実現する。構造 grep の歯は**追加しない**。

- テストは `tests/unit/adapter/claude-code/query-one-shot.test.ts` に追加する（`queryOneShot` を実際に走らせて `options.env` を捕捉できる既存パターン——`capturedOptions` を使う test が同ファイルに複数ある）。
- **Rationale**: env-omission は「キーの不在」であり、grep（テキスト存在検査）では頑健に検出しづらく偽陰性が出やすい。実際に query site へ渡る値を捕捉して固定する方が確実で、`env` を消せば `options.env` が `undefined` になり即 red になる。request 作成者の推奨（behavioral 主・grep 従）に沿う。
- **既存 B-6 grep 歯との関係**: 既存 grep 歯は `src/` の raw `process.env` を検出する構造検査として**そのまま残す**（D4）。behavioral 捕捉は「渡る値」を固定する別レンズであり、grep（渡す前のソース形）を置換しない。二つのレンズが相補的に B-6 を守る。
- **Alternatives considered**:
  - *`core-invariants.test.ts` に「query options 構築ファイルに `env:` が存在する」grep 歯を追加* — options 構築が多様だと脆く、`env:` の substring 検査は別文脈（例 コメント）で誤検出する。かつ CODEOWNERS ゲート下ファイルの改変を要する。behavioral 捕捉で十分なため採らない。
  - *運用前提で塞ぐ（呼び出し元がツールを渡さない前提に依存）* — 契約の穴を運用で覆う形で、B-6 の「seam 経由を構造で守る」方針に反する。**不採用**（request 明記）。

### D3: 捕捉 env の判定を純粋述語 `envOmissionViolations(env)` に括り出し、実テストと検出テストで共用する

テストファイル内に module-local の純粋関数を置く:

```
envOmissionViolations(env: Record<string, string | undefined> | undefined): string[]
```

- `env` が `undefined` / `null` → `["env omitted — SDK inherits raw process.env"]` を返す（env-omission）。
- `env` が `SECRET_DENYLIST`（`src/util/env-filter` から import）のいずれかのキーを含む → `["secret leaked: <KEY>", …]` を返す（strip 漏れ / secret 混入）。
- どちらでもない → `[]`（準拠）。

この述語を核に:

- **実テスト（要件 2・および要件 3 の本体固定）**: 事前に process.env に secret（`GH_TOKEN`）を設定 → `queryOneShot` を注入 `queryFn` で走らせ `options.env` を捕捉 → `expect(envOmissionViolations(captured)).toEqual([])` かつ、捕捉 env に `GH_TOKEN` が**含まれず** 非 secret（`PATH`）が**含まれる**こと、かつ `stripSecrets(process.env)` と `toEqual` で一致することを assert する。
- **検出テスト（要件 3 の機構証明）**: 合成入力に対し
  - `envOmissionViolations(undefined)` が**非空**（env-omission を red と判定）、
  - `envOmissionViolations({ GH_TOKEN: "x", PATH: "/bin" })` が secret-leak を**含む**（secret 混入を red と判定）、
  - `envOmissionViolations({ PATH: "/bin" })` が `[]`（準拠 env は緑）
  であることを assert する。

- **Rationale**: 実テストと検出テストが**同一述語**を共有することで、「実挙動を固定するテスト」と「その歯が env-omission を確かに red にする証明」が乖離しない。これは既存アーキ歯の T-04 回帰ガード idiom（合成注入で検出機構を証明する）を、値捕捉レンズに移植したもの。request-review finding #1 が問うた「要件 2 の捕捉テストが要件 3 のガードも兼ねるか」に対する答え——**同一述語を実捕捉と合成入力の両方に適用**することで両受け入れ基準を満たす、を構造で明示する。
- **Alternatives considered**:
  - *実テストで直接 `expect(captured).not.toHaveProperty("GH_TOKEN")` だけ書き、検出テストを別ロジックで組む* — 実テストと検出テストのロジックが分岐し、「捕捉テストが本当に omission を捕えるか」が別実装になって乖離しうる。述語共用で一致を保証する。
  - *`SECRET_DENYLIST` を使わず `GH_TOKEN` 固定で判定* — 述語が 1 キーに縛られ、strip 経路の意味（denylist 全体の除去）を表さない。denylist を回すことで seam の意味と述語を一致させる。

### D4: 既存 B-6 grep 歯・arch-allowlist は無変更。allowlist entry も追加しない

`tests/unit/architecture/core-invariants.test.ts`（B-6 grep 歯）と `tests/unit/architecture/arch-allowlist.ts` は**一切編集しない**。

- **Rationale**: D1 で追加する行は `env: stripSecrets(process.env as Record<string, string | undefined>)`。この行は `process.env` を含むが**同時に `stripSecrets` を含む**ため、B-6 grep 歯の既存フィルタ（`candidates = allMatches.filter(m => … && !m.content.includes("stripSecrets"))`, `core-invariants.test.ts:353-357`）に**自動的に安全判定されて除外**される。したがって新規 violation は生まれず、allowlist entry も不要で、既存 grep 歯は**検査ロジック無変更で green** を保つ（受け入れ基準「既存の B-6 の歯が無変更で green」を満たす）。
- **invariant カタログ parity への影響**: B-6 は既にカタログ（`model.md` §4 / `conformance.md` (A)）にも歯（`describe("B-6 …")`）にも存在する。新しい `describe("B-N")` block を足さないため、`invariant-catalog-parity.test.ts` の B-x ID 集合は不変。
- **Alternatives considered**:
  - *B-6 の grep 歯に env-omission 用の新 `describe` を追記* — CODEOWNERS ゲート下の改変を要し、grep での不在検出は脆い（D2）。behavioral 捕捉で足りるため不要。

### D5: agent-runner・codex・one-shot 以外は無変更（挙動不変を凍結テストで担保）

`agent-runner.ts` / codex adapter / one-shot の既存挙動（sandbox 不在・canUseTool 不在・permissionMode・allowedTools 既定など）は変更しない。

- **Rationale**: scope-out に「agent-runner 側の env 扱い（既に B-6 準拠）」「one-shot の permissionMode / sandbox / ツール制限の変更」「codex adapter・one-shot 以外の経路は挙動不変」が明記されている。one-shot の既存凍結テスト（`TC-SB-05`: sandbox キー不在 / `TC-FW-07`: canUseTool キー不在・permissionMode・allowedTools）は、`env` キー追加によって**影響を受けない**（これらは特定キーの有無・値のみを検査し、options に他キーが増えても pass する）。したがって既存凍結テストは無変更で green。
- **Alternatives considered**:
  - *agent-runner にも behavioral env テストを足して両 query site を対称に固定* — request 作成者は「可能なら」と任意扱い。本 change の必須要件は one-shot のみで、agent-runner は既に B-6 準拠。スコープを広げないため本 change では見送り、Open Questions に将来拡張として記す。

## Risks / Trade-offs

- **[env の behavioral テストが `process.env` を変異させてテスト間汚染]** → 実テストは `GH_TOKEN` 等の設定・削除を **save/restore**（`afterEach` もしくは try/finally で元値へ復元）で囲む。非 secret 側 `PATH` は runtime が常時提供する前提だが、決定性を上げたい場合は制御された非 secret マーカーキーを別途設定して保持を assert してもよい（test-case-gen が最終化）。
- **[implementer が agent-runner から `CLAUDE_CODE_OAUTH_TOKEN` 注入ブロックをコピー混入]** → D1 でインライン化し中間 `sdkEnv` を持たせないこと、Non-Goal と tasks の禁止事項で明示することの二重で抑止（request-review finding #2）。
- **[behavioral 捕捉が grep 歯を「置換した」と誤読され、既存 grep 歯が緩められる]** → D4 で既存 grep 歯・allowlist を無変更に固定し、behavioral は**相補レンズ**であることを design/spec/tasks に明記。既存 grep 歯が触られていないことは検証タスクで git diff により確認する。
- **[env-omission 検出が実テストの `toBeDefined` 相当に埋もれ、意図が伝わらない]** → D3 で純粋述語 `envOmissionViolations` に括り出し、検出テストで合成 `undefined` 入力が red になることを独立に固定して、機構を可視化する。
- **[将来別の SDK query call-site が追加され env を省略しても behavioral 歯が届かない]** → 現状 call-site は 2 つ（agent-runner / query-one-shot）で確定。新 call-site 追加時に同じ behavioral 捕捉を足す運用は Open Questions に記す。本 change のスコープは one-shot の穴を塞ぐことに限定。

## Open Questions

- なし（実装に必要な判断はすべて確定）。将来拡張候補として、(1) `agent-runner.ts` の env にも同型の behavioral 捕捉テストを足して両 query site を対称に固定する、(2) 新規 SDK query call-site 追加時に env 捕捉テストを必須化する運用、の 2 点があるが、いずれも本 change のスコープ外。
