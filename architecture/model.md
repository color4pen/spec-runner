# Architecture Model — spec-runner の構造 authority（定義）

> **これは構造の定規（the structural authority）**。「コードがどう組まれているべきか」（層・依存方向）を positive・self-standing に宣言する。
> **out-of-loop**: pipeline はここに書き込まない。`CODEOWNERS` で人間 review に固定する。
> **対になるもの**:
> - この `architecture/model.md`（構造の authority）= **コードがどう構造化されているか**
> - **test suite**（振る舞いの authority）= **振る舞いがどう確定しているか**
>
> rulings の出自は module-architect 推奨（`specrunner/adr/2026-05-31-structure-rulings.md`）。改訂は ADR 経由。

---

## 1. 様式

> **Modular Monolith + Hexagonal-lite + Pipes & Filters** ／ 短縮: **Layered Capability Modules**

- **domain = Pipes & Filters**: `Step`=filter / `Pipeline`=composition / `JobState`=流通データ。
- **Hexagonal-lite**: 外部 I/O の seam だけを `ports`（interface）＋ `adapters`（実装）で引く。3 層厳密分離はしない。
- **core は imperative を許容**。純粋性は判定系のみ（B-5）。「Functional Core 全体」は目標にしない。
- tactical DDD は 4 概念のみ: Aggregate=`JobState`+`StepRun[]` / Repository=`JobStateStore`,`ConfigStore` / Value Object=`Verdict`,`StepOutcome`,`StepName` / Domain Event=`EventBus`。
- 制約: solo dogfood・TS・重い ceremony（DI コンテナ / フル DDD / 未使用 port）を入れない。

> **被覆スコープ**: 本書は静的構造（層・依存・不変条件）のみを縛る。

---

## 2. 層（nodes）と責務 / mapping

| 層 | 責務 | 含む（mapping）|
|---|---|---|
| **composition-root** | 実装を new し依存を組み立てる。実行戦略の分岐 | `cli/`, `core/runtime/` |
| **domain** | pipeline / step / 判定 / archive / request 等 | `core/`（`runtime`・`port` を除く）|
| **ports** | domain が要求する外部 I/O の interface | `core/port/` |
| **adapters** | ports の実装。外部 SDK はここだけ | `adapter/`, `auth/` |
| **persistence** | standalone Repository（port を持たない、§5-4）| `store/` |
| **shared-kernel** | 全層が参照する schema / 値 / 共有語彙 / pure util 群 | `config/`, `state/`, `git/`, `parser/`, `prompts/`, `logger/`, `errors`, `templates/`, `kernel/`（import ゼロの共有型: `IEventBus`/`StepName`/`AgentDefinition`/`GitHubClient`/各 VO）|
| **leaf** | 何も import しない最下層 | `util/` |

```
composition-root ─→ (all)
   domain ─→ ports, persistence, shared-kernel, leaf
   ports  ─→ shared-kernel(型), leaf
   adapters ─→ ports, shared-kernel, leaf, external-SDK
   persistence ─→ shared-kernel, leaf
   shared-kernel ─→ leaf
   leaf ─→ (none)
```

---

## 3. 許可された依存（the closure model）

**✓ の edge だけ allowed。表に無い（✗）edge が actual に現れたら divergence。**

| from \ to | comp-root | domain | ports | adapters | persist | kernel | leaf | ext-SDK |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **composition-root** | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| **domain** | ✗ | — | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ |
| **ports** | ✗ | △¹ | — | ✗ | ✗ | ✓ | ✓ | ✗ |
| **adapters** | ✗ | ✗ | ✓ | — | ✗ | ✓ | ✓ | ✓ |
| **persistence** | ✗ | ✗ | ✗ | ✗ | — | ✓ | ✓ | ✗ |
| **shared-kernel** | ✗ | ✗ | ✗ | ✗ | ✗ | —² | ✓ | ✗ |
| **leaf** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✗ |

- ¹ ports が参照してよい domain 型は **Value Object のみ**（`Verdict`/`StepName` 等）。理想は VO を shared-kernel に置くこと。
- ² shared-kernel 内部は leaf 方向へのみ（上向き循環も ✗）。
- ³ 表の **"kernel" 列 = §2 の shared-kernel 層**（列見出しの短縮）。物理ディレクトリ `src/kernel/` は import ゼロの shared-kernel で、この層に属する（§3 の "kernel" 列と同義ではなく、その実体の一部）。
- **closure rule**: 上表で ✗ の edge が `src/` に存在したら divergence。未知の逆流も自動的に divergence になる。closure の機械強制は §6 の歯が担う。

---

## 4. Load-bearing 構造不変条件（the「must」＋ なぜ）

> ここは**構造**（層・依存・配置）の不変条件のみ。振る舞い・step-outcome 契約の不変条件は扱わない（その強制は `tests/unit/contract/` と型が担う）。
> **2 系統**（混同しない）: **B-1〜B-4 = 依存方向**（§3 DSM の edge に写る。dependency-cruiser / import 検査で assert）。**B-5〜B-11 = edge に写らない構造制約**（判定系の純粋性・credential/secret の seam 経由封じ込め・runtime 分岐集約・status 単一 mutator・host↔token 束縛・concrete runtime の能力 interface 実装。import / call-site の grep 検査で assert）。後者も「どの seam を通すか / どこに分岐を置くか / どの mutator を通すか / どの host へ token を送るか」という**静的な call-site 制約**であり、振る舞い（routing が何を読むか）ではない。B-6/B-7/B-10 は値（型でなく）の封じ込めで B-2 と対をなす。

| # | invariant | なぜ |
|---|---|---|
| **B-1** | domain は adapters を import しない（I/O は ports 越し。adapters を組むのは composition-root のみ）| domain を IO 実装から差し替え可能に保つ。SDK 上げ替えの影響を adapters に閉じる |
| **B-2** | external SDK 型は adapters の外（domain / ports / comp-root）に漏らさない | SDK の breaking change が core に波及しない。型汚染の封じ込め |
| **B-3** | shared-kernel / leaf / persistence は domain を import しない（上向き禁止）| 層を非循環に保つ。core↔parser・util→core 等の循環を構造的に禁止 |
| **B-4** | leaf（util）は何も import しない | 依存グラフの底を固定 |
| **B-5** | domain の判定系（verdict / transition / spec-rules）は本物の I/O を持たない | routing/判定を副作用なく再現可能に。※ core 全体の純粋性は要求しない |
| **B-6** | subprocess / SDK query に渡す env は必ず `stripSecrets` seam（`util/env-filter`）経由。raw `process.env` を直接渡さない | credential（`GITHUB_TOKEN` / `*_API_KEY` 等）を子プロセス・外部 SDK に継承させない。**B-2 と対称な security 封じ込め**（型でなく値の封じ込め）|
| **B-7** | stdout / stderr / log への出力は `maskSensitive` seam（`logger/stdout`）経由。seam の外で raw `process.stdout/stderr.write` を呼ばない（ANSI 制御コード `\r` `\x1b[K` 等は値でなく制御なので例外）| token / API key が log・進捗出力に生で漏れない。漏洩面を seam 一点に集約 |
| **B-8** | runtime（local / managed）の分岐は `createRuntime` factory に集約。domain / CLI に `config.runtime` の分岐を散らさない | runtime 追加・差し替えの影響を1点に閉じる（ruling D2 の依拠根拠）。分岐散在を構造的に禁止 |
| **B-9** | `JobState.status` の変更は `transitionJob`（`state/lifecycle.ts`）経由のみ。patch / persist で status を直書きしない | 不正な状態遷移を `VALID_TRANSITIONS` で構造的に弾く。status mutation を単一 mutator に集約し、FSM 検証を bypass する raw 書き込みを禁止 |
| **B-10** | GitHub token は紐づく host にしか送らない（github.com 用 token を非 github.com host へ、enterprise token を github.com へ送らない）| credential を誤った送信先 host へ漏らさない（published security advisory パターン）。B-6（subprocess への入口の封じ込め）と対をなす**送信先**の封じ込め |
| **B-11** | `src/core/runtime/` の具象 runtime は `RealRuntimeStrategy`（`RuntimeStrategy` に `canDeriveChangedFiles` を必須化した交差型）を implements する。bare `implements RuntimeStrategy` を使わない | `permissionScope` を宣言する pipeline が要求する「changed-files 導出能力」を、将来の real runtime が実装し忘れて fail-open に戻ることを、コンパイル時（必須メソッド）＋ grep（bare implements 禁止）で構造的に封じる |

---

## 5. divergence — 状況断面は別ファイル

本書は**構造の定規**であり、「actual がこの定義へどれだけ収束しているか」という**状況断面（現状の divergence・burn-down 履歴）は持たない**。追跡は `divergence-status.md`（人間向け snapshot）と live な歯（`arch-allowlist.ts` の grandfather 台帳）で行う。

> 注: 「core/runtime→adapter」「adapter→config/state」は **定義上 divergence でない**（runtime=composition-root、config/state=shared-kernel への下方向依存）。

---

## 6. 強制（歯）と trust placement

- **歯**: `tests/unit/architecture/core-invariants.test.ts` が §4 の B-1〜B-11 と §3 closure（DSM）を **src 全体**で grep / import 検査する。既知 divergence は `arch-allowlist.ts` に grandfather し、allowlist は**削除のみで縮む ratchet**（許可されない edge / seam 違反 / status 直書きを新たに足すと red）。`module-boundary.test.ts` も併存。
- **trust placement**: CI の required check に入れ、**merge は GitHub gate（branch protection）に委ね、CLI(archive) は merge を持たない**（`finish-respect-branch-protection` → `archive-command`）＋ **`CODEOWNERS` でこの model.md と歯をループ外固定**。
- 現状の divergence・burn-down 履歴は構造でなく状況断面 → `divergence-status.md` を参照。

---

## 7. rulings の出自と要 ratification

本 model の以下は module-architect 推奨を**採用済み**。改訂は `specrunner/adr/2026-05-31-structure-rulings.md` 経由（人間 owner）:

1. runtime = composition-root（折衷。SDK は持たない＝B-2）
2. Functional Core を判定系（B-5）に縮小、imperative core を受容
3. shared-kernel 層を新設し core を頂点に片方向化（型降格で循環解消）
4. store = standalone Repository（port を持たない）
5. adapters → shared-kernel 直 import を許容

---

## 付録: 読み方

nodes（§2）＋ allowed edges + closure（§3）＋ mapping（§2）＋ why（§4）= reflexion model の "high-level model"。
actual をこれに map した convergence / divergence / absence は enforcement（§6）の生成出力で得る（手書きしない）。
