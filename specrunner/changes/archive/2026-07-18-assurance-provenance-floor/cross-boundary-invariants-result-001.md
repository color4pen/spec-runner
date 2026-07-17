# Cross-Boundary Invariants Review — assurance-provenance-floor — Iteration 001

<!-- reviewer: cross-boundary-invariants -->

- **verdict**: approved
- **iteration**: 001

## 観点

変更が**触っていないコードの暗黙の前提（不変条件）**を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストが green でも、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | architecture | src/core/archive/achieved-assurance.ts | `core/archive → core/step/bite-evidence` のクロスモジュール import が暗黙の意味的結合を作る。`isExcludedPath` の除外ルールが `gate.ts` 側で変更（例: テストファイル自体を除外）されると、archive floor gate の「materialize 済み test 同定」が無警告で変化する。DSM 上は domain→domain で許可されるが、設計 Risks 節はこれを認識し「conformance が指摘した場合のみ中立モジュールへ move」と記している。本変更が新たに生んだ結合であり記録が必要。 | 設計 Risks 節の通り、`isExcludedPath` および `resolveBaseCandidateOids` を `src/core/step/bite-evidence/` から中立モジュール（例: `src/core/archive/provenance-helpers.ts` または `src/state/` 配下）へ behavior-preserving に move し、in-loop gate の import を追随させる。本 PR のスコープ外だが Phase 2 前に解消を推奨。 | no |
| 2 | low | correctness | src/core/archive/merge-then-archive.ts | Step 3.5（`protectedPaths` 無条件ブロック）と Step 3.6（`minimumAssurance` floor）が同一パターンで設定された場合の暗黙の制約。`config.archive.protectedPaths ∩ minimumAssurance.protectedPaths ≠ ∅` のとき、Step 3.5 が常に先に `exitCode:1` でブロックし、Step 3.6（floor を満たせば自動マージ可能）は到達不能になる。この制約は config スキーマにも docs にも記載がなく、「floor で保証を示せば自動マージ可」と期待するユーザーが両者を重複設定した場合に floor gate が黙って迂回される。 | config バリデーション（`src/config/schema/types.ts`）または README に、`protectedPaths` と `minimumAssurance.protectedPaths` は互いに素（disjoint）を推奨する旨を注記する。あるいは Step 3.5 通過後に Step 3.6 を評価する設計変更（Step 3.5 を「floor なし PATH の unconditional guard」に限定）を検討する。注: 本 PR がこの制約を新たに生んだわけではなく、Step 3.5 は本 PR 以前から存在する。 | no |
| 3 | low | correctness | src/core/archive/achieved-assurance.ts | P4 check（`config === undefined`）が `testDerivation` 導出まで落とす。`testDerivation` は `runTestsAtCommit` に `config` を必要としないが、early return で `biteEvidence` と連動して absent になる。実運用では `loadConfig()` 失敗時に `minimumAssurance` も `undefined` になり gate が no-op になるため、このパスは dead code。コードレビュー（findings #3）で既出。ただし将来 `config` と `minimumAssurance` が異なる経路で注入される場合は潜在的 fail-closed over-approximation になり得る。 | `config === undefined` を `biteEvidence` 導出の guard のみに適用し、`testDerivation`（freeze 検査まで）は `config` なしで継続する。または現行のコメント追加（コードレビュー提案）で意図を明文化する。本 PR の射程内だが影響範囲は小さい。 | no |
| 4 | info | correctness | src/core/runtime/local.ts | `runTestsAtCommit` の isolated worktree は `bun install` を実行しない。custom `verification.commands` 環境では `unavailable` → fail-closed（安全側）。しかしカスタムコマンド未設定（default bun test）環境でも `node_modules` がなく依存解決エラーになる恐れがある。本 PR 以前からの pre-existing 制限であり本変更で新たに生じたわけではない。Phase 2 の executor capability で解消予定。 | Phase 2 で `runTestsAtCommit` に `bun install`（またはロックファイル再現）を追加する。本 PR スコープ外。 | no |

---

## 詳細分析

### 不変条件 1: `satisfiesFloor` のセマンティクス変化なし ✓

`satisfiesFloor(achieved, floor)` は変更されておらず、`achieved` の absent フィールドが fail-closed で `false` を返すセマンティクスも維持される。新たな入力（`achieved`）は achieved-assurance モジュールが生成し、`getProfile(state).assurance`（宣言）から `deriveAchievedAssurance(...)` の結果（達成）に差し替えるのみ。`satisfiesFloor` の契約は保持される。

### 不変条件 2: Step 3.5（protected-paths gate）の挙動は無変更 ✓

Step 3.5 のコード（L295-354）は一切変更されていない。protected path match 時の無条件 `exitCode:1` 動作が保持される。

### 不変条件 3: CI-wait gate（Step 4）との役割分担が維持される ✓

設計方針「green@HEAD は既存 CI-wait gate（Step 4）に委譲する」が守られている。`deriveAchievedAssurance` は `runTestsAtCommit(baseOid, ...)` のみ実行し、`runTestsAtCommit(archiveSha, ...)` を呼ばない。CI-wait（Step 4）は `archiveSha` の CI が green になるまで待機する既存動作を維持する。

### 不変条件 4: `archiveSha` ↔ Step 4 の headSha 照合との整合 ✓

Step 3.6 が `archiveSha` を `finalHeadOid` として使用し、Step 4 が同じ `archiveSha` を headSha 照合に使用する。二つの gate が同一 OID を参照するため一貫性が保たれる。`archiveSha === undefined` の場合、Step 3.6 は biteEvidence/testDerivation absent（fail-closed）、Step 4 は headSha 照合スキップ（既存動作）。

### 不変条件 5: `BiteEvidenceRecord` の後方互換 ✓

新規フィールド（`baseOid?`, `candidateOid?`, `testHash?`）は optional 追加であり、validation（`operations.ts`）は present 時のみ string 型強制する。旧形式（フィールド欠落）は valid のまま。既存テストが record を field 個別 assert するため、optional field 追加で壊れない。

### 不変条件 6: fail-closed の網羅性 ✓

`deriveAchievedAssurance` は Never throws 契約を持ち、すべての I/O 失敗（unavailable / 例外 / 前提欠如）を `try-catch` で捕捉して診断メッセージ付きで absent を返す。P1（finalHeadOid undefined）→ P2（baseOid null）→ P3（runtime 欠如）→ P4（config undefined）→ (a) listCommitChangedFiles unavailable → (b) diffPaths unavailable → (b) 凍結破れ → (c) runTestsAtCommit unavailable → (c) 空洞 の各経路がすべて fail-closed に倒れることがテスト（TC-001, TC-004〜TC-011）で固定されている。

### 不変条件 7: `resolveBaseCandidateOids` の共有ロジック ✓

archive floor gate と in-loop bite gate が同一の `resolveBaseCandidateOids` を呼ぶことで、「test-materialize 境界」の解釈が一致する。ただし in-loop gate は `candidateOid === null` で strategy-deferred 返し、archive gate は `baseOid` のみを使用（`candidateOid` は参照しない）という asymmetry がある。これは設計上の差異であって矛盾ではない（archive gate は base-red 再測のみ行い、candidate-green は CI-wait に委ねる）。

### 不変条件 8: `jobStateForFloor` の非 null 前提 ✓

`jobStateForFloor!` の non-null assertion は Step 1 の try block が成功した場合のみ Step 3.6 に到達するという制御フロー不変条件によって保護されている。Step 1 が失敗した場合（state ロード失敗）は早期 return で Step 3.6 に到達しない。コード上は `let jobStateForFloor: JobState | undefined` として型付けされており、`!` は必要だが安全。

### Finding 1（重要度 low）: `core/archive → core/step/bite-evidence` cross-module 結合

`achieved-assurance.ts` が `../step/bite-evidence/gate.ts` から `isExcludedPath` を、`../step/bite-evidence/oids.ts` から `resolveBaseCandidateOids` を import する。DSM 上は同一 domain 層内（core）の横断 import であり B-1〜B-16 に違反しない。しかし：

- `isExcludedPath` が `gate.ts` 内の implementation detail として定義されており、単一 source の維持という設計意図は正しいが、`gate.ts` の責務（in-loop bite 判定）とは別の観点（archive floor の test 同定）に使われている
- 将来 `gate.ts` が `isExcludedPath` を変更・削除した場合、archive floor の挙動が無警告で変化する
- 設計の Risks 節（design.md L129）がこれを認識し「conformance が抵触を指摘した場合のみ中立モジュールへ move」と予め記している

**判定**: 本レビューがその指摘の機会。現時点では動作は正しいが、Phase 2 実装前に helper を中立モジュールへ move することで fragility を除去することを推奨する。本 PR では no-fix。

### Finding 2（重要度 low）: Step 3.5 / Step 3.6 のパス重複時の暗黙の無効化

ユーザーが `config.archive.protectedPaths = ["architecture/**"]` と `minimumAssurance.protectedPaths = ["architecture/**"]` を同時に設定した場合：

1. Step 3.5: `evaluateProtectedPaths({ patterns: ["architecture/**"] })` → `blocked: true, reason: "match"` → `exitCode:1` で return
2. Step 3.6: **到達しない**

この場合 "floor を満たせば自動マージ" という期待は黙って無効化される。config スキーマバリデーションや docs にこの制約は記載がない。

ただし Step 3.5 の挙動は本 PR 以前から存在し、本 PR はその挙動を変更していない。本 PR で追加した Step 3.6 は Step 3.5 の後に走る新機構であり、Step 3.5 の挙動を引き継ぐことは設計上意図された sequential guard チェーンの一部。

**判定**: 本 PR が新たに生んだ invariant 破壊ではなく、設計上の sequential guard 順序の帰結。ただし config ドキュメントに注記することを低優先度で推奨。

---

## Verdict

| 基準 | 評価 |
|------|------|
| `satisfiesFloor` の fail-closed 契約が新挙動で維持されるか | ✓ |
| Step 3.5 → Step 3.6 → Step 4 の sequential gate 順序が崩れていないか | ✓ |
| `archiveSha` の二重使用（floor gate + CI-wait headSha）が一貫しているか | ✓ |
| `BiteEvidenceRecord` 後方互換が保たれているか | ✓ |
| `resolveBaseCandidateOids` / `isExcludedPath` の共有セマンティクスが archive と in-loop で一致するか | ✓（意味的に一致するが結合は fragile） |
| fail-closed 経路の網羅性（T6 相当）に欠落がないか | ✓ |
| `config === undefined` の dead code パスが実運用で安全か | ✓（gate no-op と対称） |

すべての既存 B-x 不変条件（B-1〜B-16）は維持されている。発見した findings はいずれも low / info であり、動作の正しさに影響しない。TC-001〜TC-011 の歯が核心的なクロスバウンダリ不変条件を機械的に固定している。

- **verdict**: approved
