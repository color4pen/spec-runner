# project local config overlay と request type 別 step model 切替の導入

**Date**: 2026-05-26
**Status**: accepted

## Context

spec-runner は repo-bound なツールであるにもかかわらず、config は `~/.config/specrunner/config.json`（user global）のみだった。複数 repo を運用すると以下の問題が生じていた。

1. **repo ごとの性格差に対応できない**: research repo は cost 優先（sonnet 中心）、production repo は品質優先（opus 必要）。user global 1 ファイルでは両立できない
2. **request type ごとの最適 model が固定できない**: `bug-fix`（設計判断少）の design は sonnet で十分だが、`spec-change` + `adr=true` は opus 必須。step model を 1 軸で固定すると最適化できない
3. **validation が pipeline 中盤で失敗する**: `validateConfig()` は `loadConfig()` 内で走るが、呼び出しタイミングが command によって異なり、CONFIG_INVALID が pipeline 途中で初めて出るケースがあった

実例として、PR #398（bug-fix の design step に opus → $6.60 = total $10.15 の 65%）と PR gh-cli-to-rest-api（code-review opus で $89.50）が cost 最適化の障害になっていた。

## Decision

### D1: config load の 2 層化 — user global + project local overlay

`loadConfig(repoRoot?: string)` を拡張し、2 層の config load を確立した。

```
Load 順序:
1. ~/.config/specrunner/config.json        (user global) → base
2. <repoRoot>/.specrunner/config.json      (project local) → overlay
3. deep merge で overlay が base を上書き、不在 key は base を継承
```

存在パターン別の挙動:

| user global | project local | 挙動 |
|-------------|---------------|------|
| あり | あり | deep merge（project local が上書き） |
| あり | なし | user global のみ（既存挙動） |
| なし | あり | project local を standalone として validate（必須 field 欠如は CONFIG_INVALID） |
| なし | なし | 既存挙動（CONFIG_MISSING） |

`repoRoot` が渡されない場合は user global のみを参照する既存挙動を維持する。

### D2: deep merge の実装 — `deepMergeConfig(base, overlay)`

`src/config/merge.ts` に pure function として実装した。

マージルール:
- object 型は再帰的に deep merge
- array は overlay が完全置換（`models` 等の array は部分更新不要）
- primitive は overlay が上書き
- overlay の key が `undefined` → base を維持
- overlay の key が `null` → `null` で上書き（explicit clear semantics、`null = unlimited` と整合）

lodash 等の汎用ライブラリは使用せず、config schema に特化した最小実装とした。test 記述が容易になり、`null` の意味論を明示的に制御できる。

### D3: project local config のパス — `<repo-root>/.specrunner/config.json`

`.specrunner/` はジョブ状態ファイル（`.specrunner/jobs/`）の格納先として既に使用されており、gitignore 対象。config をここに置けば新しいディレクトリが不要で、user global（`~/.config/specrunner/config.json`）と明確に区別できる。

### D4: byRequestType の schema 設計 — step 中心のネスト

`StepExecutionConfig` に optional field `byRequestType` を追加した。

```typescript
interface StepExecutionConfig {
  model?: string;
  maxTurns?: number | null;
  timeoutMs?: number | null;
  byRequestType?: Record<string, StepExecutionConfig>;  // 1 階層のみ
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

`byRequestType` 内の `StepExecutionConfig` に対して `byRequestType` をネストすることは validation で CONFIG_INVALID とし、1 階層のみを許可する。

### D5: resolution chain の拡張 — 6 レベル

`getStepExecutionConfig(config, stepName, stepDefaults, requestType?)` に `requestType` を追加した。

```
Resolution chain（最初に defined な値を採用）:
1. config.steps.<step>.byRequestType.<type>.<field>   (type 別 step level)
2. config.steps.<step>.<field>                         (step level)
3. config.steps.defaults.byRequestType.<type>.<field>  (type 別 default)
4. config.steps.defaults.<field>                       (global default)
5. stepDefaults.<field>                                (step 定義 hardcoded)
6. SDK fallback                                        (maxTurns: null, timeoutMs: null)
```

`requestType` が undefined の場合、level 1 と 3 はスキップされ既存の 4 レベルと等価になる。

### D6: requestType の伝搬経路 — `AgentRunContext` 経由

`AgentRunContext` に `requestType?: string` を追加した。`StepExecutor.runAgentStep()` で `deps.request.type` から取得し、adapter 内で `getStepExecutionConfig()` に渡す。adapter が config resolution を担う既存パターンを維持し、StepExecutor の責務を増やさない。

### D7: validation の拡張と早期化

`validateConfig()` に以下を追加した:

1. `byRequestType` 内の各 key-value を `StepExecutionConfig` として validate（model / maxTurns / timeoutMs の型・範囲検証）
2. `byRequestType` 内へのネスト `byRequestType` は CONFIG_INVALID（1 階層制限）
3. `byRequestType` の key（request type 名）: 空文字列 key は CONFIG_INVALID、既知 type 集合外の key は warning のみ（reject しない）
4. error message に key path を含める（例: `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model must be a non-empty string`）

CLI entry の早期化: 全 command の起動直後に `loadConfig()`（validation 含む）を呼ぶことで、pipeline 中盤での CONFIG_INVALID を排除する。

## Alternatives Considered

### Alternative 1: 完全置換（deep merge なし）

project local が存在する場合、user global を完全に無視して project local のみを使う案。

- **Pros**: merge の edge case（null / undefined / array）が存在しない。挙動が単純
- **Cons**: user が project local に全 config を書き写す必要があり実用的でない。「この step だけ変えたい」という典型ニーズに応えられない
- **Why not**: `git config global/local` の慣習（local が global を partial override）と整合しない。partial overlay の実用性を優先した

### Alternative 2: type 中心のネスト — `stepsByRequestType.<type>.<step>`

top-level に `stepsByRequestType` を別建てする案。

```jsonc
{
  "stepsByRequestType": {
    "spec-change": {
      "design": { "model": "claude-opus-4-6[1m]" }
    }
  }
}
```

- **Pros**: type 軸で全 step の設定を俯瞰できる
- **Cons**: 「この step の挙動を変えたい」という操作の際に `steps.<step>` と `stepsByRequestType` の 2 箇所を確認する必要がある。step が追加されても type 設定に触れる必要がなく、関心事が分散する
- **Why not**: step 中心の構造を維持することで「この step は普段 sonnet、spec-change だけ opus」が step を見れば一目でわかる。既存の `steps` 構造と整合する

### Alternative 3: `byRequestType` キーを既知 type に制限（open string にしない）

`byRequestType` のキーを `"bug-fix" | "spec-change" | "new-feature"` の union に限定する案。

- **Pros**: typo を CONFIG_INVALID で早期検出できる
- **Cons**: request の `type` field は parser が open string として扱う既存設計がある。config schema だけを closed set にすると将来 type を追加するたびに schema 変更が必要になる
- **Why not**: open string（warning のみ）方式で config schema と parser の挙動を整合させる。structural check（空文字列拒否）は行い、type の妥当性は warning に留める

### Alternative 4: 環境変数 override を同時実装する

`SPECRUNNER_STEP_DESIGN_MODEL=opus` 等の OS env による override を本 request に含める案。

- **Pros**: CI/CD 環境での動的切替が可能になる
- **Cons**: 環境変数は 3 層目の override レイヤーとして別途 resolution chain を拡張する必要がある。config file 層の確立と env override は独立した関心事
- **Why not**: 2 層（user global + project local）を確立した後、env var は独立した request で追加する段階的アプローチを選択

## Consequences

### Positive

- user global config のみの既存運用は regression なし（`byRequestType` 未指定は既存 4 レベル chain と等価）
- project local は partial overlay として許容されるため、「この step だけ変えたい」が最小の JSON 記述で実現できる
- bug-fix / spec-change / new-feature の request type 別 model 設定により、型別コスト最適化が可能になる
- validation error に key path が含まれることで、設定ミスの feedback が即座かつ具体的になる
- CLI entry 起動直後の validation 統一により、pipeline 中盤での CONFIG_INVALID が消える

### Negative

- deep merge の edge case（array 完全置換 / null semantics）は明示的に文書化・テストが必要。将来の schema 拡張時に merge 挙動の再確認が必要になる
- `byRequestType` の 1 階層制限は将来の拡張に制約を与える。入れ子が必要になった場合は設計変更コストが発生する
- `AgentRunContext` への `requestType` 追加は additive だが、adapter 層の型変更が必要。optional field のため backward compat は維持される

### Known Debt

- project local config の CLI 経由書き込み（`specrunner config set --project`）は scope 外。`saveProjectConfig()` 関数は用意したが CLI command からの呼び出しは未実装
- 環境変数 override（3 層目）は scope 外。本 ADR が確立した 2 層構造の上に追加する
- profile / preset 機構（「production preset」「research preset」）は scope 外。project local overlay を基盤として別 request で検討

## References

- Request: `specrunner/changes/project-config-overlay/request.md`
- Design: `specrunner/changes/project-config-overlay/design.md`
- Related: `specrunner/adr/2026-05-25-usage-json-cost-tracking.md`（cost 観測基盤、step model 切替の動機）
- Related: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md`（`.specrunner/` ディレクトリ設計）
- Related: `specrunner/adr/2026-05-18-validation-rule-interface.md`（validation 設計の先行決定）
