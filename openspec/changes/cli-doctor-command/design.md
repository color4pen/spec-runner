## Context

SpecRunner は CLI ファースト（`bin/specrunner.ts` を entry とする）アーキテクチャで、現在は `init` / `login` / `run` / `ps` の 4 サブコマンドを提供している。各サブコマンドは port パターン（`SessionClient` / `GitHubClient` / `AnthropicClient` / `ConfigStore`）で外部依存を抽象化し、core から adapter を直接 import しない設計を遵守している。

dogfooding 001〜005 を通じて、SpecRunner が動作する前提条件（Anthropic key 有効、GitHub token に repo scope、`openspec/project.md` 存在、7 agents 登録、environment 登録、definitionHash 一致、`~/.config/specrunner/config.json` permission 0600 等）が揃わないと runtime error で初めて気付く問題が顕在化した。前提検証用の `runPreflight` は `specrunner run` の起動時にしか走らず、独立した「環境診断」として呼び出せない。

`brew doctor` / `flutter doctor` 系の診断 CLI を追加し、proactive に環境問題を検出可能にする。実装は port パターンに整合し、各 check は単独で unit test 可能にする。

## Path Note

> **Delta spec path**: `request.md` L152 は delta spec を `openspec/changes/cli-doctor-command/specs/cli/spec.md` と表記しているが、実際のファイルは既存 capability 名 `cli-commands` に従い `openspec/changes/cli-doctor-command/specs/cli-commands/spec.md` に配置されている（`proposal.md` L40 も同パスを正として記載）。実装時は `cli-commands` パスを使用すること。

## Goals / Non-Goals

**Goals:**

- `specrunner doctor` 単独実行で 7 カテゴリ（runtime / config / env / auth / repo / agents / storage）を検証できる。
- `--json` で機械可読出力（CI 利用想定）。
- exit code が pass/warn=0、fail=1、crash=2 で安定し、CI スクリプトから利用可能。
- 各 check は `DoctorCheck` interface 実装として独立。`DoctorContext` を mock することで unit test 可能。
- LLM judgment 不要。すべて deterministic な検証（file existence / shell exit / HTTP status / JSON parse / hash compare）で完結。
- ADR で外部依存方針（openspec/git 必須、gh CLI 不要、LLM 介在不要）を明文化し、将来の operational tooling（finish / cancel / gc）への原則とする。

**Non-Goals:**

- doctor 自身が問題を「修復」することはしない（hint 表示のみ。`specrunner init --resync` 等の修復コマンドは別 request）。
- pipeline 実行中の health monitoring（doctor は static な事前検査）。
- LLM agent 経由の判断を doctor 内で行わない。
- e2e（実 API への通信）は acceptance test の手動 1 回のみで、CI には組み込まない。
- 既存サブコマンド（init / login / run / ps）の挙動変更は行わない。
- **Windows でのフル動作サポート**: permission 0600 check は Windows 環境では `warn` または `skip` 扱いとし、Windows 完全対応は別 issue とする（MVP は darwin / linux のみ）。

## Decisions

### D1: `DoctorCheck` interface と `DoctorContext` injection で port パターンに統合する

**Decision**: `DoctorCheck` を interface とし、各 check は `check(ctx: DoctorContext): Promise<DoctorResult>` を実装する。`DoctorContext` には fetch / fs / child_process / config / githubClient / anthropicClient / cwd / env / now を inject する。

**理由**:

- 既存 port パターン（`SessionClient` 等）と整合する。
- 各 check が ctx 経由で副作用にアクセスするため、unit test で `DoctorContext` を mock すれば fetch / fs / process spawn を全て差し替え可能。
- check 同士は完全独立で、追加・削除が trivial。

**Alternatives considered**:

- グローバル `process` / `fs` 直接利用 → test 容易性が崩れ、port パターンに反する。却下。
- DI コンテナ導入（inversify 等）→ overkill。手書き ctx で十分。却下。

### D2: 18 個の check を `src/core/doctor/checks/*.ts` に分割し、`runner.ts` で逐次実行する

**Decision**: 各 check は 1 ファイル（または同カテゴリの近接 check は 1 ファイル）に分け、`runner.ts` が配列で受け取って逐次（または `Promise.all` 並列）実行する。逐次か並列かは MVP では **逐次** とする（出力順を安定させ、debug 容易性を優先）。

**理由**:

- check 単位で test を書けば covera​ge が読みやすい。
- 並列化は将来必要になったら `runner.ts` だけ差し替えれば済む。check 側の I/F は変えない。

**Alternatives considered**:

- 1 ファイルに全 check を纏める → 500 行超でレビュー困難、SRP 違反。却下。
- 並列実行 default → ネットワーク check（Anthropic / GitHub）の同時 fire が rate limit を踏みやすい。MVP では避ける。

### D3: exit code 仕様 `0 / 1 / 2` を厳格に守る

**Decision**:

- exit 0: 全 result が `pass` または `warn`。
- exit 1: 1 つ以上の `fail`。
- exit 2: doctor runner / formatter 自身が throw（unexpected）。

`required: true` の check が `fail` → exit 1。`required: false` で `fail` でも exit 1（fail は fail）。warn は required を問わず exit 0。

**理由**:

- CI で `specrunner doctor || exit 1` と書ける。
- exit 2 を crash 専用にすることで、CI で「doctor 自身がバグった」を区別可能。

**exit 2 の発火層**: `bin/specrunner.ts` の `doctor` case が `runDoctor(...)` を `try/catch` で包む。`catch` 経路で `process.stderr.write("Fatal: ...")` → `process.exit(2)` を発する。`runDoctor` 内で unhandled exception が throw されても、`bin/specrunner.ts` 側の catch が必ず exit 2 に変換する。これにより exit 2 は必ず doctor case 専用の catch から発火し、既存の `main().catch(exit 1)` と混同されない。

**Alternatives considered**:

- required=false の fail を warn 扱いに格下げ → required の意味が曖昧化。却下。
- exit 2 を「warn あり」に使う → bash `&&` chain で扱いにくい。却下。

### D4: 出力フォーマッタは human / JSON の 2 種を `formatter.ts` に集約

**Decision**: `formatHuman(results: DoctorResult[]): string` と `formatJson(results: DoctorResult[]): string` を export。`src/cli/doctor.ts` が `--json` フラグを見て呼び分け、stdout に書き出す。

JSON schema:

```json
{
  "summary": { "pass": <number>, "warn": <number>, "fail": <number> },
  "results": [
    {
      "name": "<string>",
      "category": "runtime|config|env|auth|repo|agents|storage",
      "required": <boolean>,
      "status": "pass|warn|fail",
      "message": "<string>",
      "hint": "<string|undefined>",
      "details": ["<string>", ...] | undefined
    }
  ]
}
```

**理由**:

- formatter を分離することで、新フォーマット（例: GitHub Actions annotations）追加が容易。
- JSON schema を spec で固定 → CI 利用者が parse の互換性を期待できる。

### D5: 外部依存方針を ADR に明文化

**Decision**: 以下を ADR `openspec-workflow/adr/ADR-20260430-external-dependency-policy.md` に記録する。

> **Note**: `request.md` L151 は `{NNN}-external-dependency-policy.md` という暫定表記を使っているが、プロジェクトの命名規約（`openspec-workflow/adr/README.md` L7）は `ADR-YYYYMMDD-<タイトル>.md` 形式であり、既存 ADR 全件もこれに従う。実際のファイルは上記パスに生成される。

| 依存 | 必須? | 検証方法 |
|---|---|---|
| node | 必須 | `process.version` |
| bun | 必須 | `bun --version`（execFile） |
| git | 必須 | `git --version`（execFile） |
| openspec | 必須（npx 経由可） | `npx openspec --version`（execFile） |
| gh CLI | 不要 | GitHubClient port 経由で REST 直叩き |
| LLM | 不要 | doctor は deterministic 検証のみ |

**ADR 生成の役割分担**: implementer は ADR ファイルを直接書かない。`request.md` の「外部依存方針」セクションおよび本 D5 の決定テーブルが decision rationale として機能し、Step 7 の `adr-create` スキルがこれを参照して `ADR-20260430-external-dependency-policy.md` を生成する。二重生成を防ぐため、implementer は ADR ファイルに触れない。

**理由**:

- 将来の operational tooling（finish / cancel / gc）が「LLM 入れたい」誘惑を制度的に防ぐ。
- gh CLI を不要としたことで dogfooding 環境のセットアップが簡素化される（GitHubClient port は既存）。
- workflow option `adr: enabled` がある場合、ADR 生成は Step 7 の専属責務。implementer が先に書くと上書き競合が発生する。

### D6: config / auth / agent definition drift の検証手順

**Decision**:

- **config 存在 + permission**: `fs.statSync(path).mode & 0o777` を比較。permission 0600 でない場合は warn。
- **anthropic.apiKey 有効性**: 軽量な GET（例: `GET https://api.anthropic.com/v1/models`）を 5s timeout で発行し、200 なら pass、401 なら fail、それ以外（5xx / network）は warn。レート消費を最小化するため list endpoint を 1 回叩くのみ。
- **github.accessToken 有効性 + scope**: `GitHubClient` port に `verifyTokenScopes(): Promise<{ status: number; scopes: string[] }>` を追加する。`auth/github-token-valid.ts` はこの port method 経由でのみ呼び出し、fetch を直叩きしない。`scopes` に `repo` が含まれなければ fail。`fetch` 直叩きは port パターンに反するため採用しない。
- **agent definitionHash drift**: `src/prompts/*` の現在の system prompt を読み込んで hash 計算 → config の `agents[role].definitionHash` と比較。mismatch 時は warn + `specrunner init --resync` 提案。

**理由**:

- レート消費は doctor を 1 日 100 回叩いても問題ない水準（list endpoint は cheap）。
- scope 検証は GitHub の標準ヘッダで済む。
- definitionHash 比較は既存 init pipeline でも使われている（D4 in init）。再利用する。

**Alternatives considered**:

- Anthropic key 有効性を skip → init で検証済みだから redundant、という見方もあるが、key revoke 後の状態を doctor で発見したい。採用。

### D7: ネットワーク check は timeout を厳格に

**Decision**: 全ネットワーク・外部コマンド check の timeout を以下の表で一元管理する。

| Check | Timeout | 理由 |
|-------|---------|------|
| Anthropic API (`GET /v1/models`) | 5s | 通常の REST endpoint |
| GitHub API (`GET /user`) | 5s | 通常の REST endpoint |
| `npx openspec --version` | 30s | 初回実行時に npm download が走るため |
| `git --version` / `bun --version` | 5s | ローカルコマンド、遅延は異常 |

timeout 時は `warn` を返す（fail にしない、network 不調と key 失効を区別するため）。

**理由**: doctor が「ネットワーク悪い」だけで exit 1 になると CI が flaky。warn に留める。`npx openspec` だけ 30s にするのは初回 npm download が 5s を超え得るため（→ Risks の `[Risk] npx openspec --version が初回実行で重い` を参照）。

### D8: `~/.local/share/specrunner/jobs/` の書き込み可否は `fs.access(W_OK)` で判定

**Decision**: `fs.access(jobsDir, fs.constants.W_OK)` で判定。判定ロジック:

| 状態 | 結果 | hint |
|------|------|------|
| dir 存在 + 書き込み可 | `pass` | — |
| dir 存在 + 書き込み不可 | `fail` | `Check permissions on ~/.local/share/specrunner/jobs/` |
| dir **不在** + 親 dir 書き込み可 | `warn` | `Run 'specrunner ps' once to initialize storage.` |
| dir **不在** + 親 dir 書き込み不可 | `fail` | `Parent directory is not writable. Check permissions.` |

古い state file 数は単純カウントし、100 超なら warn（gc 推奨）。

**理由**: dir 不在を `pass` で隠すと「storage が未初期化の状態で CI が green になる」情報損失が発生する。warn + hint で CI 利用者に初期化手順を示す方が有用。

### D9: `bin/specrunner.ts` の dispatch は switch case に `doctor` を追加するだけ

**Decision**: 既存 init / login / run / ps と同じパターン。`--json` フラグだけパースし、`runDoctor({ json })` を呼ぶ。USAGE 文字列を更新。

**exit 2 の責務**: `doctor` case は `runDoctor` を `try/catch` で包む。`catch` 経路で `process.stderr.write(\`Fatal: \${err instanceof Error ? err.message : String(err)}\n\`)` を出力し `process.exit(2)` を呼ぶ。既存の `main().catch` は exit 1 を返すが、doctor crash は exit 2 として区別するため、doctor case 限定の catch が必要（→ D3 参照）。

## Risks / Trade-offs

- **[Risk] ネットワーク check が flaky**: → D7 で timeout=5s + warn 扱いで mitigation。CI 利用時は `--skip-network` フラグ追加（v1 では未実装、follow-up）。
- **[Risk] agent definitionHash 計算が `src/prompts/*` の現実装と divergence**: → 既存 init pipeline と同じ hash 関数を再利用（`computeDefinitionHash`）。新規実装はしない。
- **[Risk] `npx openspec --version` が初回実行で重い（download）**: → timeout 仕様の詳細は D7 の timeout 表を参照。openspec check のみ 30s。
- **[Risk] check 数が増えて runner が肥大化**: → `runner.ts` は配列受け取りに留め、check 配列は `src/core/doctor/checks/index.ts` で `export const allChecks: DoctorCheck[] = [...]` として集約。
- **[Risk] `permission 0600` チェックが Windows で意味を持たない**: → MVP は darwin / linux のみサポートと明記。Windows は別 issue。warn として skip 可能。
- **[Trade-off] 逐次実行で全 check に 30s かかる可能性**: → 並列化は v2 で。MVP は debug 容易性優先。

## Migration Plan

破壊的変更なし。新規サブコマンド追加のみ。

- リリース後、dogfooding で実環境 1 回 invoke して全 check の挙動を確認（acceptance criteria の e2e）。
- 既存ユーザーは `specrunner doctor` を新規に叩くだけで利用可能。
- ADR は本 change と同時に merge する。

## Open Questions

- ~~Anthropic key 有効性確認に使う endpoint は `GET /v1/models` か他か~~ → D6 で `GET /v1/models` に決定（list endpoint は cheap、auth check に十分）。
- network skip フラグは v1 で必要か → MVP は未実装。flaky になったら follow-up で追加。
- Windows サポート → MVP は scope 外。permission check は warn / skip で対応。
