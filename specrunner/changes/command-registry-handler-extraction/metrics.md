# R3a Refactoring Metrics

before = base commit `483c75f7`  
after  = working tree (post T-01 through T-23)

Measurement commands shown verbatim; re-run from the repo root to reproduce.

---

## 1. `command-registry.ts` 行数

| | before (483c75f7) | after |
|---|---|---|
| LOC | **1696** | **1084** |

```sh
# before
git show 483c75f7:src/cli/command-registry.ts | wc -l

# after
wc -l src/cli/command-registry.ts
```

---

## 2. Inline handler 数（`handler: async` パターン）

| | before | after |
|---|---|---|
| `handler: async` count | **29** | **0** |

```sh
# before
git show 483c75f7:src/cli/command-registry.ts | grep -c "handler: async"

# after
grep -c "handler: async" src/cli/command-registry.ts || echo 0
```

---

## 3. Named handler reference 数（`handler:` プロパティ）

| | before | after |
|---|---|---|
| `handler:` reference count | **30** | **30** |

Handler 参照の総数は不変。inline closure から named function への置き換えのみ。

```sh
# before
git show 483c75f7:src/cli/command-registry.ts | grep -c "handler:"

# after
grep -c "handler:" src/cli/command-registry.ts
```

---

## 4. Registry 内 `process.exit` 件数

| | before | after |
|---|---|---|
| command-registry.ts process.exit | **67** | **0** |

Before: inline handler 内の分岐ごとに直接 `process.exit` を呼んでいた。  
After: dispatch を handler module に委譲したため registry 自体には 0 件。

```sh
# before
git show 483c75f7:src/cli/command-registry.ts | grep -c "process.exit"

# after
grep -c "process.exit" src/cli/command-registry.ts || echo 0
```

---

## 5. Repository 全体の `process.exit` 件数

### 5a. Raw grep（全 `.ts` ファイル）

| | before (483c75f7) | after (working tree) |
|---|---|---|
| Raw count | **224** | **269** |

After の増加はテストインフラの変化（T-20: handler-duplicating mock 撤去により、
job-\*-handler.ts を import するテストが追加されたこと）による。
Production コードの意図しない削減はない（5b 参照）。

```sh
# before
git ls-tree -r 483c75f7 --name-only | grep '\.ts$' \
  | while read f; do git show 483c75f7:"$f" 2>/dev/null | grep -c "process\.exit"; done \
  | paste -s -d+ | bc

# after
grep -rn "process\.exit" . --include="*.ts" | wc -l
```

### 5b. Production のみ（`src/` + `bin/`、`__tests__` および `*.test.ts` を除く）

| | before (483c75f7) | before T-19 (83b863e5) | after T-19 (working tree) |
|---|---|---|---|
| Production count | **95** | **98** | **98** |

- base → before T-19: +3（T-01-18 で request・usage・scaffold 等のハンドラを抽出した際に
  正当に追加された 3 件。command-registry.ts から handler module への分散）
- **before T-19 → after T-19: ±0**（T-19 は `run.ts`/`resume.ts`/`archive.ts` から
  `job-*-handler.ts` へ純粋に移動のみ。削減も追加も行わない）

T-23 Acceptance Criteria「before と after で一致する」は T-19 の before/after（98 → 98）を指す。

```sh
# before
git ls-tree -r 483c75f7 --name-only \
  | grep -E '^(src|bin)/' | grep '\.ts$' \
  | grep -v '__tests__\|\.test\.ts' \
  | while read f; do git show 483c75f7:"$f" 2>/dev/null | grep -c "process\.exit"; done \
  | paste -s -d+ | bc

# after
grep -rn "process\.exit" src/ bin/ --include="*.ts" \
  | grep -v '__tests__\|\.test\.ts' | wc -l
```

---

## 6. Registry の fs / credential / GitHub client value import 数

| import 対象 | before (483c75f7) | after |
|---|---|---|
| `node:fs` | **1** | **0** |
| `../core/credentials/github.js` | **1** | **0** |
| `../adapter/github/github-client.js` | **1** | **0** |
| `../config/github-host.js` | **1** | **0** |
| **合計** | **4** | **0** |

これらは handler 内でのみ使用されていた依存で、handler module 移動により
command-registry.ts から完全に撤去された。

```sh
# before
git show 483c75f7:src/cli/command-registry.ts \
  | grep -E '^import' \
  | grep -E 'node:fs|/credentials/|github-client|github-host'

# after
grep -E '^import' src/cli/command-registry.ts \
  | grep -E 'node:fs|/credentials/|github-client|github-host' \
  || echo "(none)"
```

---

## 7. 抽出した handler module 数と command family 対応表

対象は base で `handler: async ...` だった inline handler **29 件すべて**（registry 内 local 関数 `runJobHandler` を参照していた `job start` を加えると registry の handler 参照は 30 件）。
計測は COMMANDS tree を走査し、各 leaf の `handler.name` と command-registry.ts の import 文から所有 module を解決する（コマンドは末尾）。

| | before (483c75f7) | after |
|---|---|---|
| registry 内 inline handler | **29** | **0** |
| registry 内 local named handler（`runJobHandler`） | **1** | **0** |
| registry が handler を import する module 数 | **0** | **21** |
| ├ 新設 module | — | **7** |
| └ 既存 module の拡張 | — | **14** |

### command family → module 集計

| command family | 抽出 handler 数 | 所有 module（新設 = ★） |
|---|---|---|
| `init` / `login` / `credentials` | 3 | `init.ts`, `login.ts`, `credentials.ts` |
| `request *` | 5 | ★ `request-handlers.ts` |
| `job start` / `job resume` / `job archive` | 3 | ★ `job-start-handler.ts`, ★ `job-resume-handler.ts`, ★ `job-archive-handler.ts` |
| `job ls` / `job stats` | 2 | `ps.ts` |
| `job show` / `job wait` / `job cancel` / `job reopen` / `job attach` / `job prune` | 6 | `job-show.ts`, `job-wait.ts`, `cancel.ts`, `reopen.ts`, `attach.ts`, `prune.ts` |
| `config effective` | 1 | `config-effective.ts` |
| `inbox run` | 1 | `inbox.ts` |
| `rules new` / `reviewers new` | 2 | ★ `scaffold-handlers.ts` |
| `runtime *` | 3 | `managed.ts` |
| `doctor` / `doctor repair` | 2 | `doctor.ts` |
| `guide` | 1 | ★ `guide-handler.ts` |
| `usage` | 1 | ★ `usage-handler.ts` |
| **合計** | **30**（inline 29 + local named 1） | **21 module**（新設 7 / 既存 14） |

### command path → handler → 所有 module（全 30 件）

| command path | before (483c75f7) | after handler | 所有 module | 新設 |
|---|---|---|---|---|
| `init` | inline | `handleInit` | `src/cli/init.ts` | |
| `login` | inline | `handleLogin` | `src/cli/login.ts` | |
| `credentials set` | inline | `handleCredentialsSet` | `src/cli/credentials.ts` | |
| `request new` | inline | `handleRequestNew` | `src/cli/request-handlers.ts` | ★ |
| `request prompt` | inline | `handleRequestPrompt` | `src/cli/request-handlers.ts` | ★ |
| `request ls` | inline | `handleRequestLs` | `src/cli/request-handlers.ts` | ★ |
| `request template` | inline | `handleRequestTemplate` | `src/cli/request-handlers.ts` | ★ |
| `request validate` | inline | `handleRequestValidate` | `src/cli/request-handlers.ts` | ★ |
| `job start` | local named `runJobHandler` | `handleJobStart` | `src/cli/job-start-handler.ts` | ★ |
| `job ls` | inline | `handleJobLs` | `src/cli/ps.ts` | |
| `job show` | inline | `handleJobShow` | `src/cli/job-show.ts` | |
| `job wait` | inline | `handleJobWait` | `src/cli/job-wait.ts` | |
| `job cancel` | inline | `handleJobCancel` | `src/cli/cancel.ts` | |
| `job resume` | inline | `handleJobResume` | `src/cli/job-resume-handler.ts` | ★ |
| `job reopen` | inline | `handleJobReopen` | `src/cli/reopen.ts` | |
| `job attach` | inline | `handleJobAttach` | `src/cli/attach.ts` | |
| `job archive` | inline | `handleJobArchive` | `src/cli/job-archive-handler.ts` | ★ |
| `job prune` | inline | `handleJobPrune` | `src/cli/prune.ts` | |
| `job stats` | inline | `handleJobStats` | `src/cli/ps.ts` | |
| `config effective` | inline | `handleConfigEffective` | `src/cli/config-effective.ts` | |
| `inbox run` | inline | `handleInboxRun` | `src/cli/inbox.ts` | |
| `rules new` | inline | `handleRulesNew` | `src/cli/scaffold-handlers.ts` | ★ |
| `reviewers new` | inline | `handleReviewersNew` | `src/cli/scaffold-handlers.ts` | ★ |
| `runtime setup` | inline | `handleRuntimeSetup` | `src/cli/managed.ts` | |
| `runtime status` | inline | `handleRuntimeStatus` | `src/cli/managed.ts` | |
| `runtime reset` | inline | `handleRuntimeReset` | `src/cli/managed.ts` | |
| `doctor` | inline | `handleDoctor` | `src/cli/doctor.ts` | |
| `doctor repair` | inline | `handleDoctorRepair` | `src/cli/doctor.ts` | |
| `guide` | inline | `handleGuide` | `src/cli/guide-handler.ts` | ★ |
| `usage` | inline | `handleUsage` | `src/cli/usage-handler.ts` | ★ |

新設 7 module のうち `job-*-handler.ts` の 3 件は D7 の循環禁止（`run.ts` / `resume.ts` / `archive.ts` が
`from-issue.ts` 等の primitive を static import するため、handler を primitive module と同居させると
sibling 間の循環が生じる）により専用 module として切り出したもの。残り 4 件（`request-handlers.ts` /
`scaffold-handlers.ts` / `guide-handler.ts` / `usage-handler.ts`）は対応する既存 module が
handler 配置先として適切でなかった family（複数 primitive を束ねる、または registry 専用の薄い dispatch）。

```sh
# before: inline handler と local named handler の数
git show 483c75f7:src/cli/command-registry.ts | grep -c "handler: async"      # 29
git show 483c75f7:src/cli/command-registry.ts | grep -c "handler: runJobHandler" # 1

# after: command path → handler.name → 所有 module（COMMANDS tree を走査し import 文で解決）
bun -e '
import { readFileSync } from "node:fs";
import { COMMANDS } from "./src/cli/command-registry.ts";
const src = readFileSync("src/cli/command-registry.ts", "utf8");
const owner = {};
for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g))
  for (const n of m[1].split(",").map((x) => x.trim())) if (n) owner[n] = m[2];
const walk = (specs) => { for (const s of Object.values(specs)) {
  if (s.handler) console.log(s.path.join(" "), "\t", s.handler.name, "\t", owner[s.handler.name] ?? "(local)");
  if (s.children) walk(s.children); } };
walk(COMMANDS);
' | sort -t$'"'"'\t'"'"' -k3 | tee /tmp/handler-map.tsv
cut -f3 /tmp/handler-map.tsv | sort -u | wc -l   # 21
```

---

## 8. Value-import SCC 数（`src/` 全体）

| | before | after |
|---|---|---|
| SCC count (size > 1) | **0** | **0** |

Before: `await import("./from-issue.js")` 等の dynamic import が value-import グラフから
隠れていたため SCC は 0。しかし実行時に循環ロードのリスクが潜在していた。  
After: handler module が static import で `run.ts`/`from-issue.ts` を参照し、
command-registry.ts が handler module を static import する。グラフ上でも循環なし。

```sh
bun run test -- tests/unit/architecture/value-import-scc.test.ts
```

---

## 9. CLI contract 比較対象 command 数（`hasHandler: true` の leaf 数）

| | before | after |
|---|---|---|
| hasHandler: true | **30** | **30** |

base fixture と working tree の COMMANDS tree が完全一致することを
`src/cli/__tests__/cli-contract-snapshot.test.ts` で確認済み（T-21）。

```sh
grep -c '"hasHandler": true' src/cli/__tests__/fixtures/cli-contract.base.json
```

---

## 10. `src/cli` 内 `./` dynamic import 数

| | before (483c75f7) | before T-19 (83b863e5) | after T-19 |
|---|---|---|---|
| `import("./` count | **0** | **3** | **0** |

T-01-18 フェーズで handler を `run.ts`/`resume.ts`/`archive.ts` に移したとき、
各ファイルに `await import("./from-issue.js")` 等が生じた（計 3 件）。
T-19 でこれらを static import の handler module に置き換え、0 に戻した。

```sh
# before T-19 (HEAD)
grep -rn 'import("\\./' src/cli --include="*.ts" | grep -v __tests__ | wc -l

# after T-19 (working tree)
grep -rn 'import("\\./' src/cli --include="*.ts" | grep -v __tests__ | wc -l
```
