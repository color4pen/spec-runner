# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Spec gap | tasks.md T-07 | `strategy-deferred` は `Verdict` union（`src/state/schema/types.ts:57`）に含まれていない。`ParsedStepResult.verdict: Verdict \| null` に `strategy-deferred` を返すと `typecheck`（T-11）がコンパイルエラーになる。タスクは型解決を明示していない。 | T-07 に「`src/state/schema/types.ts` の `Verdict` union に `"strategy-deferred"` を追加する」を明記する。`as` キャストや `Verdict \| string \| null` への拡張は型安全性を損なうため避ける。 |
| 2 | MEDIUM | Reliability | tasks.md T-04 | `runTestsAtCommit` が作成する隔離 worktree の一時パスが固定・予測可能な場合、前の実行でクリーンアップが失敗したパスと衝突し `git worktree add` が失敗する。crash 後に再実行するとゲートが常に `unavailable` を返す。 | T-04 に「一時パスは `fs.mkdtemp(path.join(os.tmpdir(), 'bite-ev-'))` 等でランダムサフィックスを持つディレクトリとして生成すること」を明記する。 |
| 3 | LOW | Security | tasks.md T-04 | `runTestsAtCommit` がテストファイルパスをシェル文字列結合でテストコマンドに追加する場合、`git diff --name-only` 由来のパスにスペースや特殊文字が含まれると意図しない挙動が発生しうる。 | T-04 に「テストプロセスの起動は `spawn([cmd, ...testFiles])` などの配列 argv 形式を使い、シェル文字列結合を避けること」を明記する。 |

## 全体評価

### アーキテクチャ

設計は健全。D1〜D8 の判断はそれぞれ根拠が明確で、却下理由も記録されている。

- **OID 捕捉（D1）**: `captureHeadSha` を `finalizeStepArtifacts` 直後に呼ぶ位置は正確。`StepAttemptRecord` への書き込みと `fold` での読み返しで resume 安全を担保する設計は、`modelUsage` が fold を生き残らない（`state.json` 依存）という実装事実を踏まえた正しい判断。
- **CLI ステップとして配置（D2）**: 決定論的な worktree/実行ロジックをエージェントでなく CLI step に置く判断は正しい。`implementer → bite-evidence → verification` のエッジ配置により、conformance re-loop でも gate が再実行される（候補 OID が最新追跡される）。build-fixer ループが bite-evidence を迂回するのは Non-Goal として明示されており、MVP としての範囲設定は妥当。
- **RuntimeStrategy port 設計（D3）**: `listWorktreeChanges` / `commitRoundArtifacts` と同パターン（port で optional、RealRuntimeStrategy で required）により、テストフェイクへの影響ゼロと本番 runtime のコンパイル時強制を両立。純粋なゲート判断ロジックとランタイム I/O の分離も正しい。
- **fail-closed 設計（D5）**: hollow test（base-green）の拒否と escalate routing は「歯のない test を通さない」ADR D3 の機械的な実現として正確。自動修正ループがない（fixerに回さない）判断も合理的（決定論的修正が存在しない）。
- **tamper check（D6）**: 凍結 hash が lineage に無い場合 skip（inconclusive）という選択は、best-effort lineage のギャップで正当な job をブロックしないための合理的な妥協。リスクとして明記済み。
- **状態反映（D7）**: `pullRequest` の reflection パターンを正確に踏襲している。top-level フィールドは `stateToStateJson` が `steps`/`history` を除く全フィールドをスプレッドするため state.json に保存され、resume 安全。

### スコープ

- FAST_DESCRIPTOR を変更しない判断は正しい（test-materialize を持たない）。
- spec-change/refactoring/chore の `strategy-deferred` 素通りにより既存挙動が保全される。
- R4-follow-up（refactoring mutation / security / config strategy）への明示的な非対象化が境界を保護している。

### 受け入れ基準とテスト

request.md の受け入れ基準 8 項目が spec.md のシナリオと tasks.md の T-10 に全てマッピングされている。OID capture + resume、forward pass、hollow 拒否、candidate-red 拒否、tamper 拒否、非 forward defer、scoped 実行アサーション、挙動保存の各テストケースが網羅されている。

### セキュリティ考察

- OID はパイプライン自身の git 操作から取得され（`captureHeadSha` after `finalizeStepArtifacts`）、信頼境界は branch write 権限と同一。外部入力からの OID 注入経路はない。
- `runTestsAtCommit` が実行する test suite は pipeline の implementer が作成したコードを実行するものであり、攻撃面の追加は限定的。
- tamper check により test-cases.md の事後改変を検出できる。frozen hash が lineage に不在のケースは fail-open だが、base-red / candidate-green の歯自体は常に評価される。
- 主な指摘事項（finding #2, #3）は developer tool としての reliability と shell injection 予防であり、いずれも実装仕様レベルで対処可能。

### 結論

設計・仕様は機能要件を満たし、既存挙動の保全も正確に設計されている。上記 MEDIUM 2 件は tasks.md への具体的な追記で解消できるレベルであり、設計の修正を要する HIGH/CRITICAL 問題は存在しない。
