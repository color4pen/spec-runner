# Cross-Boundary Invariants Review — strip-test-authority

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Scope**: 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかの検出

---

## 観点と判定基準

diff が触っていないコードが持つ「このコンテキストでは常に真」な前提を列挙し、新しい挙動がその前提を静かに破っていないかを確認する。実装が正しくテストが green であっても、既存機構との相互作用にだけ宿るクラスのバグを対象とする。

---

## 調査対象（実際に読んだファイル）

| ファイル | 役割 |
|---|---|
| `src/prompts/test-materialize-system.ts` | Δ: red 強制の撤回 |
| `src/core/step/implementer.ts` | Δ: testsMaterialized=true 分岐の書き換え |
| `src/core/step/bite-evidence/oids.ts` | Δ: `detectBaseImplementationContamination` 追加 |
| `src/core/step/bite-evidence/gate.ts` | Δ: 汚染検知の組み込み(step 3.5) |
| `src/core/archive/achieved-assurance.ts` | 変更なし: archive floor の biteEvidence 評価 |
| `src/core/pipeline/types.ts` | 変更なし: `strategy-deferred → verification` 遷移 |
| `src/state/schema/types.ts` | 変更なし: StepRun.startedAt は ISO 8601 必須 |
| `src/core/step/write-scope.ts` | 変更なし: GUARDED_WRITE_STEPS |
| `.specrunner/config.json` | プロジェクト設定: `minimumAssurance` 無設定 |
| `src/core/step/executor.ts` | 変更なし: `startedAt = new Date().toISOString()` 確認 |

---

## 前提のカタログと確認結果

### 前提 A: gate が `strategy-deferred` を返したら pipeline は verification に進む

`types.ts:259` に `{ BITE_EVIDENCE, on: "strategy-deferred", to: VERIFICATION }` が存在する。汚染検知の新しい deferral も同じ合流先を使う。TC-007 の第 2 アサーション `STANDARD_TRANSITIONS` 確認と一致。**前提は維持される。** ✓

### 前提 B: `resolveBaseCandidateOids` の署名は変わらない

archive floor (`achieved-assurance.ts:222`) が `resolveBaseCandidateOids` を呼んでいる。今回の diff では `oids.ts` に新関数を追加したのみで、既存関数の署名は不変。`achieved-assurance.ts` への波及なし。**前提は維持される。** ✓

### 前提 C: `implementer` の write-scope は GUARDED（テストファイル変更を許可）

`write-scope.ts:33-38` — "implementer" は `GUARDED_WRITE_STEPS` に含まれる。テストファイルへの書き込みは禁止リスト(`protectedCanonPaths`)に入っておらず、実質的に許可済み。新モード（canon 整合）でテストを変更しても write-scope 違反にならない。**前提は維持される。** ✓

### 前提 D: `startedAt` は UTC ISO 8601 かつ string 比較で全順序が成立する

`executor.ts:339` — `const startedAt = new Date().toISOString()` で常に UTC（末尾 `Z`）の ISO 8601 文字列が生成される。UTC 文字列の辞書順比較は時系列順と一致する。`detectBaseImplementationContamination` の `run.startedAt < latestBase.startedAt` の文字列比較は正しく機能する。**前提は維持される。** ✓

### 前提 E: `tamperStatus === "mismatch"` の fail-closed 判定は汚染検知より優先される

`gate.ts:92` の tamper check は step 2、汚染検知は step 3.5。tamper mismatch は必ず先に `"failed"` を返し、汚染検知コードに到達しない。優先順序は正しい。**前提は維持される。** ✓

### 前提 F: 非 forward type は step 1 で `strategy-deferred` になり、汚染検知に到達しない

`gate.ts:83-89` — step 1 の non-forward type check が先行する。TC-007/008 のテストが `bug-fix` (forward type) を使っているのもこの理由。汚染検知が非 forward type に誤作動することはない。**前提は維持される。** ✓

---

## 発見された境界跨ぎの懸念

### Finding 1 [MEDIUM]: `achieved-assurance.ts` が汚染ベースラインを受け取る経路が新規に開通する

**概要**  
今回の変更前: 汚染再走(implementer-1 → test-materialize-2 → implementer-2)は `gate.ts` が `verdict: "failed" → escalate` で処理し、archive に到達しなかった。  
今回の変更後: `gate.ts` が `verdict: "strategy-deferred" → verification` を返すため、汚染再走が正常に archive まで進む。

`achieved-assurance.ts` は archive floor で独立して `biteEvidence` を再評価する。この関数は `resolveBaseCandidateOids` で baseOid（= 汚染済み test-materialize の commitOid）を取得し、`runTestsAtCommit(baseOid)` で base-red を確認する。汚染検知ロジックは組み込まれていない。

**潜在的なシナリオ**  
汚染再走において:
- impl-1 が一部の機能を実装済み → test-materialize-2 の新規テストが baseOid で **green** → archive floor の base-red 不成立 → `biteEvidence` absent（fail-closed で正常）
- impl-1 が未対応の機能を test-materialize-2 が新たにテスト → baseOid でテストが **red** → impl-2 が green に → archive floor が `biteEvidence = "required"` を付与する可能性

後者の場合、汚染ベースラインに対して `biteEvidence = "required"` が誤付与される。

**影響の評価**  
このプロジェクトの `.specrunner/config.json` は `minimumAssurance` を設定していない。archive floor の `biteEvidence` 制約は現状 no-op であり、本プロジェクトでは実害なし。ただし `minimumAssurance.biteEvidence` を有効化したユーザーが再走シナリオを踏んだ場合は偽陽性が発生する。

**設計判断との関係**  
design D3 に「「materialize commit = base」の意味付け自体はまだ消さない。本 request は前提破れ時の誤作動だけを止め、意味付けの削除は baseline 再設計の request で置換と同時に行う」と明記されており、archive floor の修正は次期 request のスコープ。ただし「汚染再走が archive まで到達する経路が新規開通する」という副作用については design に明示的な言及がない。

**推奨**  
`achieved-assurance.ts` に `detectBaseImplementationContamination` を呼ぶ同等の検査を追加し、汚染時は `biteEvidence` を absent とすることで archive floor も保護できる。ただし design の「意味付け自体はまだ消さない」方針との整合を要確認。Evidence Base 再設計の request と同時に対応する判断も合理的。

---

## 観察事項（action 不要、記録のみ）

### Obs-1 [LOW]: `detectBaseImplementationContamination` の docstring と実装の細部

docstring に「Returns the commitOid of the earliest offending implementer run」とある。実装は配列の先頭から線形スキャンして最初にマッチした run を返す。StepRun 配列は追記順（= 時系列順）であるため「first found = earliest」が成立し、正確。ただしこの一致は state の配列が時系列順に保持されるという暗黙前提に依存している。現状の executor 実装はこれを保証している。

### Obs-2 [LOW]: `testsMaterialized` 判定に conformance 再入り経路が含まれる

`implementer.ts:199` — `testsMaterialized = Boolean(state.steps?.[TEST_MATERIALIZE]?.length)` は conformance → implementer 再入り時も `true` になる。この経路では以前「production code only」だったが、今回から「canon 整合・テスト変更可」になる。これは意図された変更であり cross-boundary 違反ではないが、conformance 由来の findings に対してテストを変更できるようになったことを code-review / conformance が適切に評価する責任を持つ。prompt に明示的な変更はなく、それで十分という設計判断（D2）に一致する。

---

## 確認済み前提のサマリー

| ID | 前提 | 確認結果 |
|----|------|----------|
| A | strategy-deferred → verification 遷移が存在する | ✓ 維持 |
| B | resolveBaseCandidateOids 署名不変 | ✓ 維持 |
| C | implementer の write-scope はテスト変更を許可 | ✓ 維持 |
| D | startedAt は UTC ISO 8601、string 比較で全順序成立 | ✓ 維持 |
| E | tamper check は汚染検知より優先 | ✓ 維持 |
| F | 非 forward type は step 1 で deferral | ✓ 維持 |
| — | achieved-assurance.ts: 汚染再走が archive に到達する経路 | **新規開通 → Finding 1** |
