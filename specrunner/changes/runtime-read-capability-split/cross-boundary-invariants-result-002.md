# Cross-Boundary Invariants Review — runtime-read-capability-split — iteration 2

## 調査範囲

read-only capability へ型境界を縮小した 8 consumer について、変更されていない production 呼び出し元と concrete runtime の接続を追跡した。新しい runtime 分岐、状態遷移、呼び出し順、永続化処理は追加されていない。

## 境界ごとの確認結果

| 境界 | 変更されていない側の前提 | 確認結果 |
|---|---|---|
| `PipelineRunCommand` → `assertRuntimeSupportsScope` | composition root の full runtime を渡し、scope がある場合だけ `canDeriveChangedFiles === false` を拒否する | 引数型の参照元だけが narrow capability に変わった。optional predicate と short-circuit の実装は不変。 |
| `StepExecutor` → `detectNoOp` | `deps.runtimeStrategy` は `listChangedFiles` を持ち、結果の順序と `unavailable` の扱いは consumer が決める | 呼び出しと関数本体は不変。`RuntimeStrategy` は `ChangedFilesCapability` に構造的に代入可能。 |
| `deriveStepCompletion` → `computeExtraScopeFindings` | checkpoint 一致時だけ changed files を取得し、非導出時は UNKNOWN finding を生成する | guard、呼び出し順、fail-closed 分岐は不変。`PipelineDeps` の必要フィールドは narrow deps を満たす。 |
| `SpecReviewStep` → `derivePriorRoundContext` | runtime/method/OID/diff が欠ける場合は `null` へ all-or-nothing degrade する | optional method guard と result DU 判定は不変。 |
| `AdrGenStep` → `derivePostFixContext` | fixer commit の一つでも inspection 不能なら全体を `null` にする | 呼び出し元は従来どおり full runtime を渡し、consumer のループと fail-closed 処理は不変。 |
| custom reviewer `prepareRoundContext` → `deriveCustomReviewerPriorRound` | iteration 2 以降だけ prior context を導出し、inspection 不能時は adjudication context のみ継続可能 | `unknown` cast が型安全な capability 引数へ置換されたのみ。iteration、fixer round 選択、union 順序、null degrade は不変。 |
| `CommitOrchestrator` → finding recency | spec-review iteration 2 以降、scope finding を除外し、失敗は best-effort で吸収する | `recordFindingRecency` の引数型だけが縮小。gate、prior OID 選択、catch 境界、判定不能への degrade は不変。 |
| archive → `deriveAchievedAssurance` | commit blob を読めない runtime では assurance を fail-closed にする | `Pick<RuntimeStrategy, "readFileAtCommit">` と同じ optional signature の explicit interface に置換。実行分岐は不変。 |

## Concrete runtime との接続

- `RuntimeStrategy` の既存メソッド宣言および Local/Managed 実装は変更されていない。
- compile-time contract test で Local/Managed の双方を `ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability`、`AssuranceProvenanceRuntime` に代入している。
- consumer contract test は full facade を持たない minimal fake で各 leaf を呼び出し、optional method 不在、`unavailable`、`canDeriveChangedFiles === false` の既存 fallback を固定している。
- capability は値 wrapper や adapter を導入していないため、`this` binding、結果配列の順序、DU の値、例外境界を変える runtime 経路はない。

## 検証証跡

- `git diff main...HEAD --stat` と production diff を確認。
- `design.md`、`tasks.md` を確認。
- 全対象 consumer の production 呼び出し元を `rg` で列挙して追跡。
- `bun run typecheck`: pass。
- 既存 `verification-result.md` は build / typecheck / lint / full test / smoke の成功を記録している。

## Findings

Finding なし。変更されていないコードの不変条件を破る具体的な実行列は確認されなかった。

## Evidence summary

- Checked: 8
- Skipped: 0
- Unverified: 0
