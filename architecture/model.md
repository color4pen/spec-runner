# Architecture Model — spec-runner の構造 authority（定義）

> **これは構造の定規（the structural authority）**。「コードがどう組まれているべきか」（層・依存方向）を positive・self-standing に宣言する。
> **out-of-loop**: pipeline はここに書き込まない。`CODEOWNERS` で人間 review に固定する。
> **対になるもの**:
> - この `architecture/model.md` = **コードがどう構造化されているか**の authority
> - `specrunner/specs/`（振る舞いの actual state 写し）の構造側の対
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

> **被覆スコープ（静的構造のみ）**: step 間の制御 / データの時系列フロー（誰が `JobState` のどのフィールドを書き、どの routing が読むか）は **spec（pipeline-orchestrator / step-execution-architecture）が authority**。本書は静的構造（層・依存・不変条件）のみを縛り、dynamic view（C4 Dynamic / シーケンス）は持たない。

---

## 2. 層（nodes）と責務 / mapping

| 層 | 責務 | 含む（mapping）|
|---|---|---|
| **composition-root** | 実装を new し依存を組み立てる。実行戦略の分岐 | `cli/`, `core/runtime/` |
| **domain** | pipeline / step / 判定 / finish / request 等 | `core/`（`runtime`・`port` を除く）|
| **ports** | domain が要求する外部 I/O の interface | `core/port/` |
| **adapters** | ports の実装。外部 SDK はここだけ | `adapter/`, `auth/` |
| **persistence** | standalone Repository（port を持たない、§5-4）| `store/` |
| **shared-kernel** | 全層が参照する schema / 値 / 共有語彙 / pure util 群 | `config/`, `state/`, `git/`, `parser/`, `prompts/`, `logger/`, `errors`, `templates/` |
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
- **closure rule**: 上表で ✗ の edge が `src/` に存在したら divergence。未知の逆流も自動的に divergence になる。

---

## 4. Load-bearing 構造不変条件（the「must」＋ なぜ）

> ここは**構造**（層・依存・配置）の不変条件のみ。振る舞い・step-outcome 契約の不変条件は扱わない（その強制は `tests/unit/contract/` と型が担う）。
> **2 系統**（混同しない）: **B-1〜B-4 = 依存方向**（§3 DSM の edge に写る。dependency-cruiser / import 検査で assert）。**B-5〜B-8 = edge に写らない構造制約**（判定系の純粋性・credential/secret の seam 経由封じ込め・runtime 分岐集約。import / call-site の grep 検査で assert）。後者も「どの seam を通すか / どこに分岐を置くか」という**静的な call-site 制約**であり、振る舞い（routing が何を読むか）ではない。B-6/B-7 は値（型でなく）の封じ込めで B-2 と対をなす。

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

---

## 5. この定義に対する現状 divergence（直すべき課題、ROI 順）

詳細な計測根拠は §7 の ADR と当時の reflexion を参照。継続的には enforcement（§6）の生成出力で追う。

| 課題 | 違反 | 直し方 | ROI |
|---|---|---|---|
| **core↔parser 循環** | B-3 | `ParsedRequest`/`ParsedRequestSections` を core/request→shared-kernel へ降格 | ★最高 |
| **core/runtime の SDK 直 import**（local.ts:17）| B-2 | 生 SDK `query` を adapters へ追い出す | ★高 |
| **歯が core/request scoped** | enforcement gap | arch test を core 全体へ拡張、runtime 除外を解除 | ★高 |
| **domain に SDK 型 1 件** | B-2 | adapters 経由に | 高 |
| **step-names back-edge**（config/state→core）| B-3 | `step-names` を core/step→shared-kernel へ降格 | 中 |
| **util→core/state/prompts** | B-4 | `slugify` の re-export を外し util を真の leaf に | 中 |
| **判定系の fs 混入** | B-5 | spec/rules の load を seam 化（判定系のみ）| 低 |
| **credential/出力 seam 未強制** | B-6/B-7 | `doctor.ts` の raw `process.env`→execFile・`progress.ts` の raw stderr を seam 経由へ寄せ、歯（B-6/B-7）を E1 に含める | 中 |
| **runtime 分岐の散在** | B-8 | `executor.ts`・`preflight.ts` 等の `config.runtime` 分岐を `createRuntime` 集約 or seam 化。歯を E1 に含める | 中 |
| **単一 mutator 未強制** | （lifecycle）| `transitionJob` を経由しない raw status 書き（`store.fail()` / `exit-guard` 等）を検出する歯を E1 に含める（domain-model.md JobStatus 節の divergence）| 中 |

> 注: 旧来「core/runtime→adapter」「adapter→config/state」は **本定義では divergence でない**（runtime=composition-root、config/state=shared-kernel への下方向依存）。

---

## 6. 強制（歯）と trust placement

- **現状の歯**: `tests/unit/architecture/module-boundary.test.ts`（**`core/request` のみ** scoped、runtime 除外）。本定義の B-1〜B-5 はまだ部分的にしか守られていない。
- **目標の歯**: §3 の表と §4 を `dependency-cruiser`（`forbidden`+`allowed`+`required`）または arch test の **core 全体拡張**に compile。循環検出（B-3）・判定系 IO（B-5）を追加。各 rule に why を `comment`。
- CI の required check に入れ、`finish` が gate を尊重（`finish-respect-branch-protection`）＋ **`CODEOWNERS` でこの model.md と歯をループ外固定**。

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
