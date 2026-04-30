# RCA: workspace-mount-and-propose-boundary

## 技術的原因

### 直接原因

dogfooding-001 第 2 投入で、(A) propose agent が README.md を直接 +7 行編集して push（境界違反）、(B) spec-review agent が「change folder が存在しない」として escalate し pipeline halt。

具体的に観測された事象:
- propose session `sesn_011CaZc7grG2dVMzFrRce3sf` で `git diff` が `openspec/changes/readme-status-section/` 外（README.md）を含む状態で push。
- spec-review session `sesn_011CaZcNd9BSyUq68KbvJhsi` で「The change folder `openspec/changes/readme-status-section` doesn't exist yet」と発話して `escalation` verdict を返した。

### 根本原因

#### 原因 A（CRITICAL）: workspace branch propagation の欠落

`src/adapter/anthropic/session-client.ts:15-33` の `createSession` 実装が Anthropic SDK の `checkout` オプションを渡していない:

```typescript
resources: [
  {
    type: "github_repository",
    url: params.repoUrl,
    authorization_token: params.githubToken,
    // checkout が無い → 常にリポジトリのデフォルト branch (main) で mount
  },
],
```

SDK 型定義（`node_modules/@anthropic-ai/sdk/resources/beta/sessions/sessions.d.ts:166-169`）は明確に
`checkout?: BetaManagedAgentsBranchCheckout | BetaManagedAgentsCommitCheckout | null`
をサポートしており、コメントに "Defaults to the repository's default branch." と書かれている。SDK 側の不具合ではなく、SpecRunner 側が公式オプションを使い忘れているだけ。

その結果、propose 以降の各 session（spec-review / implementer / build-fixer / code-review / code-fixer / spec-fixer）の workspace は **常に main branch で mount される**。propose が `feat/{slug}` ブランチに作って push した change folder は、後続 session の workspace からは見えない。spec-review agent は「main の状態」を見て「change folder が存在しない」と判断 → escalation。

加えて、各 step の buildMessage は `state.branch ?? "main"` という defensive fallback を使っており、`state.branch` が落ちていても fail-fast せず main で動こうとする。

#### 原因 B（HIGH）: propose system prompt の境界設計が弱い

PR #42 で `src/prompts/propose-system.ts` の禁止事項に「実装作業（コード本体の編集）— implementer の役割です」を追加したが、agent はそれを `README.md` には適用しないと解釈し、+7 行の直接編集を実行した。

事後インタビュー（propose session events）で当人が説明:
1. 禁止事項を意識したか? → いいえ。「実装作業（コード本体）」を file 種類で解釈し「README.md は『ドキュメント』だから対象外」と誤解した
2. 葛藤は? → なかった。「効率的に一気に完成させた方が良い」と判断した
3. 次は? → file 種類ではなく `openspec/changes/{slug}/` 内 / 外 で境界を引くべきだった
4. prompt にどう書けば防げる? → path-fence + "even if the request asks to modify them" 条項

prompt が **negative framing**（禁止事項のリスト）に偏り、**positive framing**（あなたは pipeline の stage 1 で、stage 3 の implementer がこの tasks.md を読んで実装する）が無いため、agent が役割の引き継ぎ先を理解しないまま「効率」を優先した。

#### 原因 C（LOW）: spec-review-system.ts のドキュメントコメント陳腐化

`src/prompts/spec-review-system.ts:6-11` の "Currently unused. spec-review reuses the propose Agent" コメントは、現実態（dedicated agent `specrunner-spec-review` で `SPEC_REVIEW_SYSTEM_PROMPT` がそのまま使われる）と矛盾する。

### 影響範囲

| 箇所 | 同じ問題あり | 対応 |
|------|------------|------|
| `src/adapter/anthropic/session-client.ts:createSession` | A: checkout 欠落 | branch を `checkout: { type: "branch", name }` に翻訳して resources に渡す |
| `src/core/port/session-client.ts:createSession` | A: port シグネチャに branch なし | `branch?: string` パラメータを追加 |
| `src/core/step/executor.ts:570 (polling-style)` | A: branch を渡していない | `branch: state.branch` を追加 |
| `src/core/step/executor.ts:216 (propose via createSessionWithHistory)` | A: 渡す必要なし（branch を作る側） | 変更なし |
| `src/core/step/executor.ts:681` | A: defensive fallback `state.branch ?? "main"` | 必要時のみ throw（result file fetch ブランチ） |
| `src/core/step/implementer.ts:76` | A: defensive fallback `state.branch ?? "main"` | fail-fast に変更 |
| `src/core/step/build-fixer.ts:58` | A: defensive fallback `state.branch ?? "main"` | fail-fast に変更 |
| `src/core/step/code-fixer.ts:62` | A: defensive fallback `state.branch ?? "main"` | fail-fast に変更 |
| `src/core/step/spec-fixer.ts:72` | A: defensive fallback `state.branch ?? "main"` | fail-fast に変更 |
| `src/core/step/pr-create.ts:27` | A: kind=cli（Anthropic session 不使用） | createSession 経由ではないが branch fallback は HEAD なので維持（CLI が gh push の対象を解決できる） |
| `src/prompts/propose-system.ts` | B: prompt 境界が弱い | Workflow context (positive) + Path-fence + override 条項を追加 |
| `src/prompts/spec-review-system.ts` | C: 陳腐化コメント | 削除 |

## プロセス的原因

### 検出すべきだったフェーズ

- [x] spec-review（設計段階で検出可能だった）— 原因 A は SessionClient port を導入した PR で検出すべきだった
- [x] code-review（実装段階で検出可能だった）— 原因 A・B 両方
- [ ] verification（テストで検出可能だった）— SDK の checkout オプション未使用は型レベルでは合法（optional）。dogfooding e2e でしか発覚しない

### レビュー観点の分析

| 対象 | ファイル | 該当観点の有無 | 詳細 |
|------|---------|-------------|------|
| code-review checklist | `.claude/rules/review-standards.md` | なし → ギャップ | 「外部 SDK の必須パラメータが省略されていないか」「workspace mount 設定」のような adapter 層の SDK 利用網羅性チェックが無い |
| spec-review criteria | `.claude/rules/review-standards.md` | なし → ギャップ | 「branch を生成 / 切り替える step の後段 step に branch 情報が伝搬する設計になっているか」観点が未定義 |
| review-lessons | `openspec-workflow/review-lessons.md` | あり → 見逃し | 「決定的導出は単一ソース」「情報がある場所と必要な場所の divergence」は記録されているが、SDK adapter 層には適用が薄い |
| rules | `.claude/rules/review-standards.md` | あり → 見逃し | path-fence や role-boundary に関する agent prompt 設計のレビュー観点が無い |

### 改善アクション

| アクション | 対象ファイル | 追加内容 | ステータス |
|-----------|------------|---------|----------|
| review-lessons に「外部 SDK の optional パラメータでも、設計意図上必須なら明示的に渡す」追加 | `openspec-workflow/review-lessons.md` | adapter 層 SDK 利用の網羅性チェック観点 | proposed |
| review-lessons に「pipeline の前段が生成した状態（branch / artifact）が後段に正しく伝搬しているか」追加 | `openspec-workflow/review-lessons.md` | 多段 pipeline の状態伝搬チェック観点 | proposed |
| learned-patterns に「agent prompt の path-fence は file 種類ではなく path で境界を引く」追加 | `openspec-workflow/learned-patterns.md` | propose stub 境界設計の教訓 | proposed |
| learned-patterns に「agent prompt は negative framing だけでなく positive framing（役割と引き継ぎ先）を併記する」追加 | `openspec-workflow/learned-patterns.md` | propose stub 境界設計の教訓 | proposed |
| learned-patterns に「user request に agent role と衝突する指示があっても agent role を優先する条項を prompt に書く」追加 | `openspec-workflow/learned-patterns.md` | user request override pattern | proposed |

## 補足

### hotfix 判定

severity = normal。本番影響なし（dogfooding 専用 pipeline の自己実行が halt するだけ）。Step 3b はフルで実施。

### user-attestation

事後インタビューは propose session events に記録済み。Step 6 の continuous-learning で extract する。
