# Design — `specrunner run` propose ステップ最小実装

## Context

SpecRunner は ADR-20260427-cli-first-architecture により CLI ファースト体制に転換した。現状:

- Next.js プロトタイプは削除済み（コミット 8bd226b）。`src/lib/anthropic.ts` 等は git history からのみ参照可能。
- `package.json` は `"type": "module"`、`bin: { specrunner: "./bin/specrunner.ts" }`、`@anthropic-ai/sdk@^0.91.0` を宣言済み。実装ソースはまだ存在しない。
- Phase 1 PoC で確認済みの事実（docs/managed-agents/phase1-findings.md）:
  - `packages.npm` で Environment に CLI を事前インストール可
  - Private GitHub リポはローカルプロキシ経由でマウントされ push も成功
  - Session 単位で `/workspace` が完全分離される
  - `events.list` で過去イベントを再取得可
- Managed Agents Beta header: `managed-agents-2026-04-01`、SDK は `client.beta.{agents, environments, sessions}` namespace。SDK v0.89.0 → v0.91.0 への変更点は本実装で必要な範囲では surface-level に同等（`sessions.retrieve`, `sessions.events.stream`, Custom Tools の `requires_action` フロー）。
- 参照可能な過去資産: docs/managed-agents/{guide.md, phase1-findings.md, sdk-capabilities.md}、ADR 一式、git history。

## Goals / Non-Goals

**Goals:**

- `specrunner` という単一バイナリで `init` / `login` / `run` / `ps` の 4 コマンドが動作する
- `specrunner run <request.md>` が **propose セッションのみ** を起動 → 完了検知 → 状態ファイル更新まで自動実行する
- propose の Custom Tool（`register_branch`）が SSE 経由で受信・応答され、応答後に session が再開される
- 多段リソース作成の rollback、SSE break-after-completion、ファイル atomic 書き込み等の構造的な再発防止策を組み込む
- SDK の型定義に整合した実装が可能な設計を spec / design 段階で確定し、implementer が SDK 再調査を行わなくて済む状態にする

**Non-Goals:**

- spec-review / implement / code-review セッションの起動・接続（後続 request）
- `fixup` / `merge` / `cancel` / `logs -f` / `stop` / `resume` / `dashboard`
- multi-tenant / 複数ユーザーアカウント運用
- 対象リポジトリ内の `specrunner/` ディレクトリ設計
- バックグラウンド実行・daemon・ジョブキュー（Phase 1 では foreground 1 ジョブのみ）
- Web UI / TUI

## Architecture Overview

```
bin/specrunner.ts                # shebang + Commander 風ディスパッチ
└── src/
    ├── cli/                    # コマンド層（薄いアダプタ。core を呼ぶだけ）
    │   ├── init.ts             # specrunner init
    │   ├── login.ts            # specrunner login
    │   ├── run.ts              # specrunner run <request.md>
    │   └── ps.ts               # specrunner ps
    ├── core/                   # ドメインロジック（純粋寄り）
    │   ├── pipeline.ts         # propose ステップの状態マシン
    │   ├── session.ts          # session 作成/ポーリング/SSE 接続
    │   ├── completion.ts       # idle + end_turn 判定 + break ガード
    │   └── tools/
    │       ├── register-branch.ts   # Custom Tool 定義 + handler（同一ファイル）
    │       └── registry.ts          # tool 定義と handler を結線するヘルパー
    ├── sdk/                    # @anthropic-ai/sdk の薄いラッパ（モック容易化）
    │   ├── client.ts           # Anthropic client factory
    │   ├── agents.ts           # agents.create/retrieve/update
    │   ├── environments.ts     # environments.create/retrieve
    │   └── sessions.ts         # sessions.create/retrieve/events.stream/send
    ├── config/                 # ~/.config/specrunner/config.json
    │   ├── store.ts            # 読み書き、permission 0600 強制
    │   └── schema.ts           # zod 不使用、TypeScript 型 + 手書き validator
    ├── state/                  # ~/.local/share/specrunner/jobs/<id>.json
    │   ├── store.ts            # atomic write（temp + rename）、append history
    │   └── schema.ts
    ├── auth/
    │   └── github-device.ts    # Device Flow 実装（fetch ベース）
    ├── git/
    │   └── remote.ts           # `git remote get-url origin` パース
    ├── parser/
    │   └── request-md.ts       # request.md → { type, title, content, enabled }
    ├── prompts/
    │   └── propose-system.ts   # propose 用 system prompt テンプレート
    ├── logger/
    │   └── stdout.ts           # 進捗表示・色制御
    └── errors.ts               # 名前付きエラークラス（推奨アクション付き）
```

**設計上の重要な分割:**

- `cli/*` は引数パース → core 呼び出し → exit code 翻訳のみ。テストは smoke。
- `core/*` は SDK / fs / fetch を抽象に依存させ、ユニットテスト可能にする。
- `sdk/*` ラッパは `@anthropic-ai/sdk` の型を re-export する。実装は **direct passthrough**。type alias 整理が主目的。
- `core/tools/register-branch.ts` は **definition と handler を 1 ファイルで colocate**。`registry.ts` 経由で `agent.create` 時の `custom_tools` 配列と SSE handler dispatch table の双方に登録する **唯一の API** とする（Bug 1 再発の構造的予防）。

## SDK 型定義の利用方針

@anthropic-ai/sdk v0.91.0 で使用する API surface（v0.89.0 と同等の interface）:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: cfg.apiKey,
  defaultHeaders: { "anthropic-beta": "managed-agents-2026-04-01" },
});

// Agent 作成（init 時）
await client.beta.agents.create({
  name: "specrunner-propose",
  model: "claude-sonnet-4-5",            // 暫定。将来 cfg 経由で切替
  system_prompt: PROPOSE_SYSTEM_PROMPT,
  toolset: { type: "agent_toolset_20260401" }, // 標準 8 ツール
  custom_tools: [registerBranchTool.definition],
});

// Environment 作成（init 時）
await client.beta.environments.create({
  name: "specrunner-default",
  packages: { npm: ["@fission-ai/openspec"] },
});

// Session 作成（run 時）
const session = await client.beta.sessions.create({
  agent: { id: cfg.agentId, type: "agent" },
  environment_id: cfg.environmentId,
  resources: [{
    type: "github_repository",
    repository: { owner, name },
    authorization_token: cfg.githubToken,
  }],
});

// SSE stream（propose のみ。Custom Tool 受信用）
const stream = await client.beta.sessions.events.stream(session.id);
for await (const event of stream) {
  // event.type: "agent.custom_tool_use" | "session.status_idle" | ...
}

// Event 送信（Custom Tool 結果 + 初回メッセージ）
await client.beta.sessions.events.send(session.id, {
  events: [
    {
      type: "user.message",
      content: [{ type: "text", text: PROPOSE_INITIAL_MESSAGE }],
    },
  ],
});
await client.beta.sessions.events.send(session.id, {
  events: [
    {
      type: "user.custom_tool_result",
      custom_tool_use_id: <id>,
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    },
  ],
});

// ポーリング（idle + end_turn 検知）
const s = await client.beta.sessions.retrieve(session.id);
// s.status: "running" | "idle" | "rescheduling" | "terminated"
// s.stop_reason: "end_turn" | "requires_action" | "interrupted" | null
```

### イベント型の取り扱い

SDK は `BetaManagedAgentsSessionEvent` ユニオンを export している。本実装ではイベント type を **discriminated union** として narrowing するヘルパーを `sdk/sessions.ts` に置く:

```ts
export function isCustomToolUseEvent(e: BetaManagedAgentsSessionEvent):
  e is BetaCustomToolUseEvent { return e.type === "agent.custom_tool_use"; }

export function isStatusIdleEvent(e: BetaManagedAgentsSessionEvent):
  e is BetaSessionStatusIdleEvent { return e.type === "session.status_idle"; }
```

実装者は narrowing ヘルパーのみ参照する（SDK 型を直接扱わない）。SDK バージョン差分はラッパ内で吸収する。

## Decisions

### D1. Polling primary, SSE secondary（completion detection）

**選択**: ポーリング（`sessions.retrieve` + `status: idle && stop_reason: end_turn`）を主、SSE を Custom Tool 受信用にのみ使う。

**理由**: ADR-20260427-cli-first-architecture で「セッションは Anthropic 上で自律実行され SSE は観察用」と決定済み。SSE は接続切断・タイムアウト・取りこぼしのリスクがあり、CI/CD ランナーの完了判定には不向き。

**バックオフ**: 初期 2s、上限 30s、指数 ×1.5、ジッタ ±20%。1 ジョブで read 600 req/min 制限を使い切らない。

**SSE break ガード**: SSE ループ内で `session.status_idle` + `stop_reason: end_turn` を観測したら即 break。feedback_sse_break_after_completion で 2 回踏んだ事象の構造的予防。`completion.ts` に `assertBreakAfterCompletion(event)` を置き、テストで break が呼ばれることを検証する。

**却下案**:
- SSE primary：接続切断時の再接続実装が複雑、長時間 idle で課金されないため retrieve で十分。
- Webhook：SDK にサポートなし。

### D2. Custom Tool 結線の colocate 強制

**選択**: `core/tools/register-branch.ts` に **definition + handler を同一 export として置き**、`registry.ts` の `registerCustomTool(tool)` 経由でしか追加できない設計にする。

```ts
// register-branch.ts
export const registerBranchTool = defineCustomTool({
  definition: {
    type: "custom",
    name: "register_branch",
    description: "...",
    input_schema: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"] },
  },
  handler: async (input, ctx) => { ... },
});

// registry.ts
const tools: CustomTool[] = [];
export function registerCustomTool(t: CustomTool) { tools.push(t); }
export function getDefinitions() { return tools.map(t => t.definition); }
export function getHandler(name: string) { return tools.find(t => t.definition.name === name)?.handler; }
```

`agents.create` 時の `custom_tools` 配列と SSE dispatch の双方が同じ `tools` 配列を参照する。新ツールを追加するときに **片方だけ** 登録することが構造的に不可能になる。

**理由**: constraints.md「定義済み関数の未呼び出し、Custom Tool の Agent tools 配列への未登録は致命的なサイレント障害」。Bug 1 の再発を構造的に阻止する。

**却下案**: 規約ベース（同名なら自動結線）→ typo / case 違いを検出できないためサイレント障害が残る。

### D3. `register_branch` の冪等性 = last-write-wins

**選択**: 同一 session で複数回呼ばれた場合、handler は **最後の値で state を上書き** する。Agent からの戻り値は常に `{ ok: true, branch }` を返す（エラーにしない）。

**理由**: Custom Tool は Agent がリトライ・再呼び出しする可能性がある（constraints.md「Custom Tool のような外部エージェントが呼ぶインターフェースはリトライ・再実行を前提」）。エラーで返すと Agent が混乱する。最終呼び出しが正と仮定するのが Agent 行動と最も整合する。

**却下案**: 初回のみ受け付ける → Agent が修正のため呼び直したい場合に対応不能。

### D4. atomic write for state files

**選択**: `<path>.tmp.<random>` に書き込み → `fs.rename` で置換。`fsync` をその前に発行。

**理由**: `specrunner ps` が並行で読むケース、CLI が SIGINT で落ちるケースで部分書き込みファイルを残さないため。POSIX `rename` は atomic。

**履歴**: `state.history` を append-only 配列にし、各更新で `{ ts, step, status, message }` を push。最大 100 件で先頭から truncate。

### D5. config パーミッションの強制

**選択**: 書き込み時に `mode: 0o600` を指定。読み込み時に `stat` でチェックし、より緩いモード（group/other readable）なら警告を stderr に出して継続。

**理由**: 平文の API key / GitHub token を保護する最小限の措置。OWASP「機微情報の不適切な保存」対策。

**却下案**: OS keychain（macOS Keychain / libsecret）→ クロスプラットフォーム実装が複雑、初版の優先度ではない。

### D6. GitHub Device Flow OAuth

**選択**: `https://github.com/login/device/code` でデバイスコード取得 → ユーザーに `verification_uri` と `user_code` を表示 → `https://github.com/login/oauth/access_token` を `interval` 秒ごとに poll → token 取得。

**スコープ**: `repo` を要求（private repo の clone/push に必要）。

**Client ID**: SpecRunner 用 GitHub OAuth App の client_id を CLI コードに埋め込む（OAuth Device Flow は client_secret 不要）。

**期限切れ検出**: API 呼び出しで 401 を受けたら token を無効化フラグ付きで保持し、`specrunner login --refresh` を促す。

### D7. uuid v4 でジョブ ID

**選択**: `crypto.randomUUID()` を使う（Node 19+ で標準）。

**理由**: 衝突確率無視できる。Anthropic 側 session id とは別に CLI 起動時点で確定できる。状態ファイル名の安定 identifier として使える。

### D8. 入口に近い場所での fail-fast バリデーション

**選択**: `cli/run.ts` の最初で:
1. `~/.config/specrunner/config.json` が存在する（なければ「`specrunner init` を実行してください」）
2. `apiKey` / `agentId` / `environmentId` / `githubToken` が揃う
3. cwd が git repo
4. `git remote get-url origin` が GitHub URL を返す
5. request.md ファイルが存在しパース可能

を順にチェック。1 つでも失敗したら **session を作成する前に exit**。理由: rollback 対象を増やさない。

### D9. propose system prompt は CLI コードに固定

**選択**: `src/prompts/propose-system.ts` で `export const PROPOSE_SYSTEM_PROMPT = "..."` として持つ。`specrunner init` の Agent 作成時にリモートに同期する。

**理由**: Agent 定義（system prompt + custom tools + model）の source-of-truth は CLI 側。リモート（Anthropic 側 Agent）は CLI からデプロイされる成果物として扱う。CLI バージョン差分の検知は将来のスコープ。

### D10. Custom Tool description は 3-4 文以上で詳細記述

**理由**: docs/managed-agents/sdk-capabilities.md 「ツールの説明は 3〜4 文以上で詳細に（何をするか、いつ使うか、パラメータの意味、制限）」。`register_branch` の description には「propose 完了直前に branch 名を register する」「冪等で last-write-wins」「branch 名は openspec の slug 命名規約に従う」を含める。

## Sequence — `specrunner run request.md`

```
User                     CLI(run)              SDK                Anthropic           GitHub
 │  specrunner run req.md │                      │                     │                 │
 │ ──────────────────────▶│                      │                     │                 │
 │                        │ load config (0600)   │                     │                 │
 │                        │ parse request.md     │                     │                 │
 │                        │ resolve owner/name   │                     │                 │
 │                        │ create job state(uuid)│                    │                 │
 │                        │                      │                     │                 │
 │                        │ sessions.create      │                     │                 │
 │                        │ ────────────────────▶│ POST /sessions      │                 │
 │                        │                      │ ───────────────────▶│ clone repo via  │
 │                        │                      │                     │ local proxy     │
 │                        │                      │                     │ ──────────────▶│
 │                        │                      │                     │ ◀──────────────│
 │                        │ session.id           │                     │                 │
 │                        │ ◀────────────────────┤                     │                 │
 │                        │                      │                     │                 │
 │                        │ events.stream(SSE)   │                     │                 │
 │                        │ ────────────────────▶│ GET /events stream  │                 │
 │                        │                      │ ───────────────────▶│                 │
 │                        │                      │                     │                 │
 │                        │ events.send (initial)│                     │                 │
 │                        │ ────────────────────▶│ POST /events        │                 │
 │                        │                      │ ───────────────────▶│ propose start   │
 │                        │                      │                     │                 │
 │                        │ ◀── agent.custom_tool_use(register_branch) │                 │
 │                        │ handler: state.branch = ev.input.branch    │                 │
 │                        │ events.send(custom_tool_result {ok:true})  │                 │
 │                        │ ────────────────────▶│ POST /events        │                 │
 │                        │                      │                     │                 │
 │                        │  ── poll loop ──     │                     │                 │
 │                        │ sessions.retrieve    │                     │                 │
 │                        │ ────────────────────▶│ GET /session/:id    │                 │
 │                        │ status:running       │                     │                 │
 │                        │ ◀────────────────────┤                     │                 │
 │                        │ wait(backoff)        │                     │                 │
 │                        │ ...                  │                     │                 │
 │                        │ status:idle,         │                     │                 │
 │                        │ stop_reason:end_turn │                     │                 │
 │                        │ ◀────────────────────┤                     │                 │
 │                        │ break SSE loop ⚠     │                     │                 │
 │                        │                      │                     │                 │
 │                        │ verify branch exists │                     │                 │
 │                        │ via GitHub API       │                     │                 │
 │                        │ ────────────────────────────────────────────────────────────▶│
 │                        │ ◀────────────────────────────────────────────────────────────│
 │                        │ state.status=success │                     │                 │
 │ ◀──────────────────────│ exit 0               │                     │                 │
```

## Error Handling & Rollback

### リソース cleanup の責務

| ステップ | 失敗時の cleanup |
|---------|-----------------|
| config 読み込み失敗 | なし。fail-fast で exit 1 |
| request.md パース失敗 | なし。fail-fast で exit 1 |
| state file 作成失敗 | なし。session 未作成 |
| sessions.create 失敗 | state file を `status: failed` で更新 |
| events.stream 接続失敗 | session を `interrupt` → `delete` 試行（best-effort、失敗してもログ） |
| Custom Tool handler 例外 | `custom_tool_result` で `{ok:false, error}` を返す → session 側で停止判断 |
| SSE 中の通信切断 | 再接続せず ポーリングに fallback。最終 idle/end_turn を待つ |
| polling 中の `status: terminated` | session は既に死亡。state.status=failed、cleanup 不要 |
| GitHub API でブランチ未確認 | warning を出すが state.status=success で続行（後続 request の責務） |

### 推奨アクション付きエラーメッセージ

`src/errors.ts` で:

```ts
class SpecRunnerError extends Error {
  constructor(public code: string, public hint: string, message: string) {
    super(message);
  }
}
```

- `CONFIG_MISSING` → `Run 'specrunner init' first.`
- `GITHUB_TOKEN_EXPIRED` → `Run 'specrunner login' to refresh.`
- `NOT_GIT_REPO` → `cd into a git repository before running specrunner.`
- `REMOTE_NOT_GITHUB` → `'origin' must point to github.com.`
- `REQUEST_MD_INVALID` → `Check the YAML front-matter in <path>.`
- `SESSION_TIMEOUT` → `Session exceeded 30 min. Inspect with 'specrunner ps'.`

## File Schemas

### `~/.config/specrunner/config.json`

```jsonc
{
  "version": 1,
  "anthropic": {
    "apiKey": "sk-ant-..."
  },
  "agent": {
    "id": "agent_01...",
    "definitionHash": "sha256:...",   // CLI side definition との同期判定用
    "lastSyncedAt": "2026-04-27T10:00:00Z"
  },
  "environment": {
    "id": "env_01...",
    "lastSyncedAt": "2026-04-27T10:00:00Z"
  },
  "github": {
    "accessToken": "gho_...",
    "tokenObtainedAt": "2026-04-27T09:50:00Z",
    "scopes": ["repo"]
  }
}
```

- file mode: `0600`
- 不足キーは `null` ではなく **未存在**（プロパティが存在しないことで未設定を表現）。
- 読み込み時 schema validator で必須キー存在を検証。

### `~/.local/share/specrunner/jobs/<jobId>.json`

```jsonc
{
  "version": 1,
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2026-04-27T10:30:00Z",
  "updatedAt": "2026-04-27T10:34:12Z",
  "request": {
    "path": "~/.../request.md",
    "title": "CLI Core Pipeline",
    "type": "new-feature"
  },
  "repository": { "owner": "color4pen", "name": "spec-runner" },
  "session": {
    "id": "sess_01...",
    "agentId": "agent_01...",
    "environmentId": "env_01..."
  },
  "step": "propose",
  "status": "running",                  // running | success | failed | terminated
  "branch": null,                        // register_branch で更新
  "history": [
    { "ts": "2026-04-27T10:30:00Z", "step": "init", "status": "started", "message": "job created" },
    { "ts": "2026-04-27T10:30:02Z", "step": "session-create", "status": "ok", "message": "sess_01..." },
    { "ts": "2026-04-27T10:31:14Z", "step": "register-branch", "status": "ok", "message": "feat/2026-04-27-foo" }
  ],
  "error": null
}
```

- atomic write（temp + rename）
- history は最大 100 entries、超えたら先頭から truncate（古い entry は drop）

## Risks / Trade-offs

- **[R1] propose 中に CLI を kill すると session が宙ぶらりんになる** → mitigation: `state.session.id` を残しているため、後続の `specrunner cancel`（後続 request）で interrupt+delete 可。Phase 1 では手動でユーザーが Anthropic console から削除する選択肢を stderr で案内。
- **[R2] SSE 切断 → ポーリング fallback で完了は検知できるが、Custom Tool 応答が漏れて session が `requires_action` のまま停止する可能性** → mitigation: ポーリング側で `stop_reason: requires_action` を観測したら、events.list で未処理 custom_tool_use を取得して再応答する recovery を入れる。Phase 1 では「`requires_action` のままタイムアウトしたら fail」とし、再接続 logic は Phase 2。
- **[R3] GitHub OAuth Device Flow の token に refresh_token がない** → GitHub Device Flow の標準仕様で refresh_token は付与されない（GitHub App であれば付与される）。期限切れ時は `specrunner login` を再実行してもらう。Phase 2 で GitHub App 化を検討。
- **[R4] `register_branch` の last-write-wins が悪意ある Agent に書き換えられるリスク** → propose system prompt が改ざんされない限り問題なし。Agent はリモート Agent 定義（CLI が同期したもの）でのみ動作するため改ざんは init 時のチェックでカバー。
- **[R5] 状態ファイルの履歴 truncate でデバッグ情報を失う** → mitigation: `logs/<jobId>.log` への raw event ダンプは Phase 2 で追加（本 request スコープ外）。
- **[R6] config の API key が平文** → mitigation: 0600 + ホームディレクトリ前提。OS keychain は Phase 2 以降。
- **[R7] @anthropic-ai/sdk v0.91.0 の Custom Tool イベント schema が v0.89.0 から変わっていた場合** → mitigation: `sdk/sessions.ts` のラッパで吸収する。早期に integration test で互換確認する。

## Migration Plan

新規実装のため migration はない。ただし以下を init 時に確認する:

1. `node --version` ≥ 20（`crypto.randomUUID`、`fs.promises.cp`、native fetch 利用のため）
2. `git --version` 存在
3. ホームディレクトリ書き込み可

旧 Next.js プロトタイプのファイル/設定は既に削除済み（コミット 8bd226b）。残存 risk は既存 specs（openspec/specs/ 以下）が CLI 動作と重複する記述を持つこと。本変更では archive せず、後続 request で archive 計画を立てる。

## Open Questions

- **OQ1**: Agent の model id（claude-sonnet-4-5 等）を config 化するか? → Phase 1 では CLI コードに固定、`config.agent.definitionHash` で差分検知のみ。
- **OQ2**: `specrunner init` で既存 Agent との差分があった場合 update するか recreate するか? → 仕様: `agents.update` で system_prompt と custom_tools を上書き。version は SDK が自動 increment。
- **OQ3**: GitHub OAuth client_id をどう CLI に埋め込むか? → constants ファイルに置く。Device Flow は client_secret 不要なので公開しても OK。
- **OQ4**: ポーリングの最大時間（タイムアウト）を何分にするか? → 既定 30 分。CLI フラグ `--timeout=Nm` で上書き可（実装は本 request 範囲）。
- **OQ5**: SSE 接続が失敗したときの retry 戦略は? → Phase 1: retry なし、ポーリング fallback。Phase 2: 指数バックオフ retry。
- **OQ6**: Custom Tool ハンドラが async で長時間かかる場合のセッションタイムアウトは? → `register_branch` は state file 書き込みのみで O(ms)。問題にならない。
- **OQ7**: `specrunner ps` で表示する fields の確定 → JOB_ID / STEP / STATUS / BRANCH / AGE の 5 列。詳細フォーマットは specs/cli-commands/ で固定。
