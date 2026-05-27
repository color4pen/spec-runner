# Spec Review Result — agent-env-allowlist

- **verdict**: approved
- **reviewer**: spec-review agent
- **date**: 2026-05-27

---

## Summary

セキュリティ上の懸念（`process.env` がフィルタなしで子プロセスに継承される）に対し、`stripSecrets()` ユーティリティを共通経路に組み込む denylist 方式で構造的に対処する設計。architect 評価済み。スペックは実装可能な状態にある。

---

## Findings

### F1. `ANTHROPIC_BASE_URL` 除去がもたらす破壊的変更が delta spec に記録されていない（Advisory）

**箇所**: `specrunner/changes/agent-env-allowlist/specs/claude-code-runtime/spec.md`

**内容**:
`ANTHROPIC_BASE_URL` はクレデンシャルではなく API エンドポイント URL であり、その除去はセキュリティ上の効果より「カスタムエンドポイントが機能しなくなる」という破壊的変更の側面が大きい。SDK の `env` オプションは `process.env` を置換する（`sdk.d.ts:1232` で確認済み）ため、`ANTHROPIC_BASE_URL` が消えると Claude Code サブプロセスはデフォルトエンドポイントに接続する。

設計書には「別 request (#429) で SDK に baseURL を明示するため env override を残す必要なし」と記載があるが、この制約が delta spec のどのアーティファクトにも捕捉されていない。

**リスク**: #429 より先にこの変更がデプロイされると、カスタム Anthropic API エンドポイントを使用している環境でエージェント実行が失敗する。

**推奨対応**: delta spec に scenario を 1 件追加し、`ANTHROPIC_BASE_URL` の除去が既知かつ意図した動作変更であることを明示するか、design.md の dependency 節に「#429 と同時またはその後に deploy すること」を追記する。ただし実装の進行を妨げる必須修正ではない（advisory 扱い）。

---

### F2. `src/util/spawn.ts` の構造的保護が capability spec に記載されていない（Advisory）

**箇所**: tasks.md タスク 1.2 / design.md D2

**内容**:
設計の中心となる D2（`spawnCommand()` に env フィルタを組み込む）は tasks.md に記載され実装ガイドになっているが、対応する capability spec が存在しない。delta spec の `verification-runner` は `src/core/verification/commands.ts` の内部 `spawnCommand` と `runner.ts:spawnScript` を対象とし、`src/util/spawn.ts` の共通 spawn ユーティリティは明示的にカバーされていない。

finish / orchestration 経路で使われる `spawn-helper.ts` 経由の subprocess 保護は、spec レベルでは捕捉されない。

**評価**: 実装リスクは低い（`spawnCommand()` の変更は単純）。ただし将来のリグレッション検出ができないため、将来的に capability spec の追加を検討することを推奨する。

---

### F3. `GH_TOKEN` が denylist に含まれない（Advisory）

**箇所**: design.md D1

**内容**:
GitHub CLI (`gh`) は `GH_TOKEN` を `GITHUB_TOKEN` の代替として認識する。エージェントが `gh` コマンドを呼んだ場合、`GH_TOKEN` はフィルタされず漏洩しうる。現在の specrunner は `GH_TOKEN` を直接使用しないが、ユーザーが `GH_TOKEN` を設定した環境では保護が不完全になる。

**評価**: denylist アプローチが持つ本質的な限界（明示列挙漏れ）の一例。将来の denylist 追加候補として記録する。設計の architect 評価済み範囲であり、今回の実装には影響しない。

---

## Positive Observations

- **セキュリティアプローチ**: denylist を共通経路 (`spawnCommand`) に組み込む設計は「漏れを構造的に防ぐ」原則として適切。呼び出し元ごとに対策する方式より堅牢。
- **opts.env による明示的上書きの維持**: 将来の拡張ポイントとして正当な設計判断。
- **カバレッジの網羅性**: 5 つの spawn/query 経路（spawn.ts, agent-runner.ts, local.ts, commands.ts, runner.ts）すべてを tasks に明示。
- **delta spec のフォーマット**: 両 delta spec とも `### Requirement:` / `#### Scenario:` 形式・normative keyword を満たしている。`delta-spec-validation-result.md` の approved も確認済み。
- **テスト設計**: env-filter.ts のユニットテスト（immutability, denylist key 除去, denylist 外 key 保持, key 不在ケース）を明示的に定義しており、検証可能性が高い。
- **ANTHROPIC_API_KEY の安全な除去**: SDK は独自認証機構を持ち env に依存しないという前提は `sdk.d.ts:1232` の `env` オプション設計と一致している。
