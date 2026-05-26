## Context

config.json は `~/.config/specrunner/config.json`（user global）のみ。複数 repo 運用で repo ごとの性格差（research = cost 優先 / production = 品質優先）に対応できない。加えて request type ごとの最適 model が異なる（bug-fix の design は sonnet で十分、spec-change の code-review は opus 必須）にも関わらず step model は 1 軸固定。

PR #398（bug-fix の design に opus $6.60）と PR gh-cli-to-rest-api（code-review opus で $89.50）が cost 最適化の実例。

validation に関しては `validateConfig()` は `loadConfig()` 内で呼ばれるが、CLI command によって呼び出しタイミングが異なり、pipeline 中盤で初めて CONFIG_INVALID が出るケースがある。

## Goals / Non-Goals

**Goals:**

- `<repo-root>/.specrunner/config.json` (project local) を user global に deep merge で overlay
- `steps.<step>.byRequestType.<type>.model` で request type ごとに step model を切替
- validation を新 schema 対応に拡張し、CLI entry の起動直後で統一的に実行
- 既存 user global config のみの運用に breaking change なし

**Non-Goals:**

- credentials の project local 化（credentials は user global のまま）
- 環境変数 override (`SPECRUNNER_STEP_DESIGN_MODEL=opus` 等)
- profile / preset 機構
- price table embed / USD 換算
- 動的 model registry 更新
- project local config の git 管理ワークフロー（`.specrunner/` は既に `.gitignore` 対象）

## Decisions

### D1: config load の 2 層化 — `loadConfig(repoRoot?)` の拡張

現在の `loadConfig()` を `loadConfig(repoRoot?: string)` に拡張する。

```
Load 順序:
1. ~/.config/specrunner/config.json (user global) → base
2. <repoRoot>/.specrunner/config.json (project local) → overlay
3. deep merge で overlay が base を上書き、不在 key は base を継承
```

- `repoRoot` が渡されない場合は既存挙動（user global のみ）
- `repoRoot` が渡された場合:
  - user global + project local 両方存在 → deep merge
  - user global なし + project local のみ → project local を standalone config として validate（部分 config だけなら CONFIG_INVALID）
  - project local なし + user global のみ → user global のみ（既存挙動）
  - 両方なし → 既存挙動（CONFIG_MISSING）

**理由**: `loadConfig()` の呼び出し元（preflight, bootstrap, init 等）が repo root を解決済みの場合にのみ overlay を適用する。read-only command（ps, doctor 等）は repo root を best-effort で解決し、project local がなくても動作する。

### D2: deep merge の実装

`src/config/merge.ts` に `deepMergeConfig(base, overlay)` を pure function として実装する。

```typescript
function deepMergeConfig(base: SpecRunnerConfig, overlay: Partial<SpecRunnerConfig>): SpecRunnerConfig
```

マージルール:
- object 型の value は再帰的に deep merge
- array は overlay が完全置換（config に array は `models` くらいで、deep merge 不要）
- primitive は overlay が上書き
- overlay に key が不在（undefined）→ base を維持
- overlay に `null` → `null` で上書き（explicit clear semantics は `null` = unlimited と整合）

**理由**: lodash は使わず、config schema に特化した小さな pure function を書く。test が書きやすく、config 固有のセマンティクス（null の扱い）を明示的に制御できる。

### D3: project local config ファイルパス

`<repo-root>/.specrunner/config.json` を project local config のパスとする。

**理由**: `.specrunner/` はジョブ状態ファイル（`.specrunner/jobs/`）の格納先として既に使われており、gitignore 対象。config もここに置けば新しいディレクトリを追加する必要がない。user global の `~/.config/specrunner/config.json` と区別しやすい。

### D4: byRequestType の schema 設計 — step 中心のネスト

`StepExecutionConfig` に `byRequestType` optional field を追加する。

```typescript
interface StepExecutionConfig {
  model?: string;
  maxTurns?: number | null;
  timeoutMs?: number | null;
  byRequestType?: Record<string, StepExecutionConfig>;  // 再帰的に同型
}
```

config 例:
```jsonc
{
  "steps": {
    "defaults": { "model": "claude-sonnet-4-6" },
    "design": {
      "model": "claude-opus-4-6[1m]",
      "byRequestType": {
        "bug-fix": { "model": "claude-sonnet-4-6" }
      }
    },
    "code-review": {
      "model": "claude-sonnet-4-6",
      "byRequestType": {
        "spec-change": { "model": "claude-opus-4-6[1m]" },
        "new-feature": { "model": "claude-opus-4-6[1m]" }
      }
    }
  }
}
```

**理由**: `stepsByRequestType` を top-level に別建てする方式より step 中心の方が直感的。「この step は普段 sonnet、spec-change だけ opus」がその step の config を見れば一目で分かる。`byRequestType` 内の `StepExecutionConfig` は再帰的に同型だが、入れ子の `byRequestType` は validate で reject（1 階層のみ許可）。

### D5: resolution chain の拡張 — 6 レベルに

`getStepExecutionConfig()` のシグネチャに `requestType?: string` を追加する。

```
Resolution chain (最初に見つかった defined 値が採用):
1. config.steps.<step>.byRequestType.<type>.<field>  (type 別 step level)
2. config.steps.<step>.<field>                        (step level)
3. config.steps.defaults.byRequestType.<type>.<field> (type 別 default)
4. config.steps.defaults.<field>                      (global default)
5. stepDefaults.<field>                               (step 定義 hardcoded)
6. SDK fallback                                       (maxTurns: null, timeoutMs: null)
```

`requestType` が undefined の場合、level 1 と 3 はスキップされ既存 4 レベルと同等。

**理由**: request type は optional context であり、供給されない場合（test / 単独実行）でも既存挙動を維持する。

### D6: requestType の伝搬経路

`AgentRunContext` に `requestType?: string` を追加する。`StepExecutor.runAgentStep()` で `deps.request.type` から取得し、`ctx.requestType` として adapter に渡す。adapter 内で `getStepExecutionConfig(ctx.config, step.name, stepDefaults, ctx.requestType)` を呼ぶ。

`CliStep`（verification, delta-spec-validation）のパスでも同様に `getStepExecutionConfig()` が呼ばれる箇所があれば requestType を渡す。現状 CliStep で `getStepExecutionConfig` を呼んでいる箇所はないため、AgentStep パスのみ対応。

**理由**: `AgentRunContext` に 1 field 追加は最小限の変更。adapter が config resolution を行う既存パターンを維持し、StepExecutor の責務を増やさない。

### D7: validation 拡張 — byRequestType + 早期化

`validateConfig()` に以下を追加:

1. `byRequestType` が存在する場合、各 key-value を `StepExecutionConfig` として validate（model / maxTurns / timeoutMs の型・範囲検証）
2. `byRequestType` 内にネストした `byRequestType` があれば CONFIG_INVALID（1 階層制限）
3. `byRequestType` の key（request type 名）:
   - 空文字列 key → CONFIG_INVALID
   - 既知 type 集合外 → warning ログ（reject しない）
4. error message に key path を含める: `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model must be a non-empty string`

CLI entry の早期化:
- `runPreflight()` は既に起動直後に `loadConfig()` を呼んでいる（run.ts）
- `bootstrap()` も起動直後に `loadConfig()` を呼んでいる（resume.ts）
- `command-registry.ts` の `request generate` / `request review` は best-effort で呼んでいる
- 確認: 全 CLI command が起動直後に config を load しているか audit し、漏れがあれば追加

### D8: saveConfig の変更なし

`saveConfig()` は user global config のみに書き込む既存挙動を維持する。project local config の書き込みは `saveProjectConfig(repoRoot, cfg)` を別関数として追加する。ただし本 request では project local config の CLI 経由書き込みは scope 外（ユーザーが手動で JSON を書く想定）。`saveProjectConfig` は将来の `specrunner config set --project` コマンド用に関数だけ用意しておくが、CLI command からの呼び出しは実装しない。

### D9: doc / template 更新

- `src/prompts/rules.ts`: project local config の存在を明示（`<repo-root>/.specrunner/config.json` で step model を repo 単位にカスタマイズ可能）
- `specrunner/project.md`: 設定セクションに project local overlay と byRequestType の説明を追加
- `README.md`: project local config の使い方を config example として記載

## Risks / Trade-offs

- [Risk] deep merge の edge case（array / null / undefined の扱い）→ テストで網羅。config schema は比較的 flat なので複雑なネストは少ない
- [Risk] project local config が部分 config + user global なし → standalone として validate。不完全なら CONFIG_INVALID で即座に feedback
- [Trade-off] `byRequestType` 内の `StepExecutionConfig` に `byRequestType` のネストを禁止 → 複雑さを制限。必要になった場合は別 request で拡張
- [Trade-off] `byRequestType` の key validation は warning のみ（reject しない）→ parser の type 扱い（open string）と整合。config schema 変更なしで将来 type 追加可能
- [Risk] `AgentRunContext` に `requestType` を追加 → adapter の型変更が必要だが、optional field なので backward compat
