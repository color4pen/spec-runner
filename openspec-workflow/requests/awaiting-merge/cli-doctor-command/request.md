# Add `specrunner doctor` command — environment / dependency / auth diagnostics

## Meta

- **type**: new-feature
- **slug**: cli-doctor-command
- **date**: 2026-04-30
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

dogfooding-001〜005 で SpecRunner が動作する前提条件（外部 CLI 依存 / 認証 / 設定 / リポジトリ状態 / Anthropic agent 登録状況）が揃っていないと runtime error が出るが、現状はこれらを起動前に診断する手段がない。`specrunner run` を叩いて初めて「config がない」「token expired」「openspec が install されてない」等が判明する。

並行して、`specrunner finish`（PR merge → archive → archive PR の自動化、別 request で起票予定）の実装を計画中で、これは外部依存（git / openspec）を更に活用する。事前に依存検証を提供しないと finish の failure mode 解析が困難になる。

`brew doctor` / `flutter doctor` 系の診断コマンドを追加して、proactive に環境問題を検出可能にしたい。

## 目的

`specrunner doctor` という新規 CLI subcommand を追加し、SpecRunner が必要とする全前提条件を機械的に検証して結果を表示する。pass / warn / fail の 3 段階で診断、warn は exit 0、fail があれば exit 1（CI 利用可）。

## 要件

### 1. CLI subcommand の追加

`bin/specrunner.ts` に `doctor` ケースを追加。`specrunner doctor` で起動。

```bash
specrunner doctor              # 標準出力で人間向け表示
specrunner doctor --json       # 機械可読 JSON 出力（CI 向け）
```

exit code:
- 0: すべて pass / warn のみ
- 1: 1 つ以上の fail
- 2: doctor 自身が crash（unexpected）

### 2. 診断項目（必須カテゴリ）

以下のチェックを実装する。各チェックは独立した `DoctorCheck` として実装（テスト容易性のため）。

#### Runtime
- node version (>= 18 required)
- bun version (実行に bun を要求するなら)
- git installed + version
- openspec available（`npx openspec --version` で確認、global install 不要）

#### Configuration
- `~/.config/specrunner/config.json` 存在 + permission 0600
- `anthropic.apiKey` フィールド存在
- `github.accessToken` フィールド存在

#### Environment variables
- `SPECRUNNER_GITHUB_CLIENT_ID` 設定状況（warn — login 時のみ必須）

#### Authentication
- Anthropic API key 有効性（軽量な GET リクエストで 200 確認、レート消費最小）
- GitHub token 有効性（`GET /user` で 200 + scope に `repo` 含む）

#### Repository state
- cwd が git repository
- `origin` remote が GitHub（`https://github.com/...` または `git@github.com:...`）
- `openspec/project.md` 存在（openspec init 済み）
- `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` 構造存在（warn — bootstrap 推奨）

#### Anthropic agents
- 7 agents（propose / spec-review / spec-fixer / implementer / build-fixer / code-review / code-fixer）が config に登録済み
- environment ID 登録済み
- agent definition drift 検出（src/prompts の現在の system prompt hash と config の `definitionHash` を比較）— mismatch なら warn + `specrunner init --resync` 提案

#### Storage
- `~/.local/share/specrunner/jobs/` 書き込み可
- 古い job state file 数（情報のみ表示、多すぎたら gc 推奨を warn として出す）

### 3. 出力フォーマット

人間向け（default）:

```
$ specrunner doctor
Running diagnostics for SpecRunner...

Runtime
  [✓] node v22.21.1 (>= 18 required)
  [✓] bun v1.x
  [✓] git 2.42.0
  [✓] openspec 1.3.1 (via npx)

Configuration
  [✓] config: ~/.config/specrunner/config.json (perm 0600)
  [✓] anthropic.apiKey: set
  [✓] github.accessToken: set

(...)

────────────────────────────────────
Summary: 14 pass, 2 warn, 0 fail
```

JSON 出力（`--json`）:

```json
{
  "summary": { "pass": 14, "warn": 2, "fail": 0 },
  "results": [
    { "name": "node", "category": "runtime", "status": "pass", "message": "v22.21.1 (>= 18 required)" },
    ...
  ]
}
```

### 4. 各 check の interface 統一

```typescript
interface DoctorCheck {
  name: string;
  category: "runtime" | "config" | "env" | "auth" | "repo" | "agents" | "storage";
  required: boolean;
  check(ctx: DoctorContext): Promise<DoctorResult>;
}

interface DoctorResult {
  status: "pass" | "warn" | "fail";
  message: string;
  hint?: string;     // 修復方法
  details?: string[]; // 補足情報
}
```

`DoctorContext` は config / cwd / fetch などを inject。port パターンと整合。

### 5. テスト容易性

各 check は単独で unit test 可能とする。`DoctorContext` を mock することで依存（fetch / fs / child_process）を差し替え。

## 受け入れ基準

- [ ] `specrunner doctor` で全カテゴリ (runtime / config / env / auth / repo / agents / storage) の検証が走る
- [ ] 各 check が独立した DoctorCheck object として export されている（再利用可能）
- [ ] `--json` オプションで機械可読出力が得られる
- [ ] fail があれば exit 1、warn のみなら exit 0、すべて pass なら exit 0
- [ ] 各 check に対する unit test が存在する（DoctorContext mock を使用）
- [ ] e2e test: 実環境で 1 回実行して正常終了する（`bun bin/specrunner.ts doctor` が exit 0 or 期待通りの fail を返す）
- [ ] doctor command の使い方が `specrunner --help` に表示される
- [ ] ADR が `openspec-workflow/adr/{NNN}-external-dependency-policy.md` に生成され、外部依存の宣言（openspec / git は必須、gh CLI 不要、LLM 介在不要）と判断根拠が記録される
- [ ] delta spec `openspec/changes/cli-doctor-command/specs/cli/spec.md` が生成され、doctor の責務が仕様化される
- [ ] 既存テスト全 PASS（regression 0、現状 533 tests）

## 設計上の重要な決定

### 外部依存の方針

| 依存 | 必須? | 理由 |
|---|---|---|
| **node** | 必須 | runtime |
| **bun** | 必須 | shebang で bun 指定の場合 |
| **git** | 必須 | repo 操作（init / pipeline / finish 等で必須） |
| **openspec** | 必須（`npx` 経由可） | spec management の本丸、自前実装はしない |
| **gh CLI** | **不要** | GitHubClient port 経由で REST API 直叩きで代替（既存 pattern） |
| **LLM (Managed Agents)** | **不要** | doctor は完全に deterministic な機械検証、judgment 不要 |

これは ADR で明文化する MUST：

- **ADR タイトル**: SpecRunner external dependency policy: openspec & git required, gh CLI replaced by GitHubClient port, no LLM in operational tooling
- **Context**: dogfooding 経験 / openspec-workflow との比較 / Anthropic Managed Agents との責務分離
- **Decision**: 上記表のスコープ
- **Consequences**: openspec install を user に要求する代わりに、bundle size / version conflict を回避

### LLM 不在で完結する根拠

doctor の全 check は以下のいずれかで実装可能：
- file existence (`existsSync`)
- shell command exit code (`execFile`)
- HTTP API response (`fetch` with timeout)
- JSON parse / hash compare

LLM judgment が要る項目はない。これは将来の `specrunner finish` / `specrunner cancel` などの operational tooling にも共通する原則 → ADR で明文化することで、将来「ここにも LLM 入れたい」誘惑への防波堤にする。

## 振る舞い不変の確認方法

- 既存テスト全 PASS（doctor は新規 subcommand なので既存挙動を変えない）
- `bin/specrunner.ts` 既存 case (init / login / run / ps) の動作不変

## 補足

### 関連 request

- 後続: `specrunner finish` の追加（別 request、doctor の後に着手予定）
- 後続: `specrunner cancel` / `specrunner gc` / `specrunner status` 等の operational tooling phase

### 実装規模見積

- `src/cli/doctor.ts` ~80 行
- `src/core/doctor/types.ts` ~30 行
- 個別 check 18 個 ~500 行
- `bin/specrunner.ts` 拡張 ~20 行
- ADR 生成 ~80 行
- delta spec ~60 行
- tests ~600 行
- **合計 ~1370 行（実装 770 行 + tests 600 行）**

### 既存 CLI との整合

`init` / `login` / `run` / `ps` と同じ pattern で `bin/specrunner.ts` の switch case に `doctor` を追加。subcommand structure と help message 更新を含む。

### dogfooding 投入想定

本 request 完了後、`specrunner doctor` を実機で 1 回 invoke してすべての check の挙動を確認する（acceptance criteria の e2e 部分）。これは pipeline 内で実施せず、merge 後に手で確認する想定（doctor を pipeline 内で叩く意味は薄い）。
