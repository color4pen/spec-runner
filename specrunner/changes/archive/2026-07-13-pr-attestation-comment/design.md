# Design: PR ごとの attestation をコメント添付する

## Context

spec-runner の差別化の芯は「全 run が同じ保証群（G1、`docs/guarantees.md`）を通過する」ことである。この保証を「主張」から「run ごとの検証可能な成果物」へ変える第一歩として、各 run が実際に通過したゲート順・各ゲートの verdict・verdict 導出入力の要約・step 別 model・予算/コスト消費・journal hash を、機械可読な attestation として PR にコメント添付する。

### 現状コードの境界

- **pr-create** は CLI step（`kind: "cli"`、agent なし）。`deps.githubClient` / `deps.owner` / `deps.repo` / `deps.cwd` / `deps.slug` を持ち、`runPrCreate` から `result.number` / `result.url` を得る（`src/core/step/pr-create.ts`）。PR 作成成功後に `pr-create-result.md` を書く。
- **GitHubClient** に `createIssueComment(owner, repo, issueNumber, body)` が既にある（`src/adapter/github/github-client.ts`、POST /issues/{n}/comments、201 期待）。PR は issue なので PR コメントに使える。
- **journal**（events.jsonl）は step 実行・transition・verdict の truth。`fold()`（`src/store/event-journal.ts`、純関数）が raw 文字列から `steps: Record<step, StepRun[]>` / `history` を復元する。各 `StepRun.outcome` は `verdict`・`findingsPath`・`toolResult`（`{ ok, findings?, observations? }`）・`startedAt`・`endedAt` を持つ。verdict 導出入力の findings は `outcome.toolResult.findings` に journal 内へ保存される（`collectFindingsLedger` が同経路で読む）。
- **usage.json**（`src/core/usage/store.ts` / `types.ts`）は `CommandInvocation[]` を持ち、各 entry は `stepName` と `modelUsage: Record<model, ModelUsage> | null` を持つ。step 別 model と token 消費の canonical source はここ（modelUsage は journal の step-attempt record には含まれない）。
- **pricing**（`src/core/usage/pricing.ts`）に `computeCostUsd(model, usage): number | null` / `normalizeModelKey` があり、コスト算出は既存純関数を再利用できる。
- **verdict 導出**（`src/core/step/judge-verdict.ts`、G1-1）は findings からの機械導出で、これ自体は変更しない。

### タイミング上の事実

pr-create の `run()` 実行時点で、events.jsonl / usage.json には **pr-create より前の全 step** の記録が確定している（executor が step commit 前に append 済み）。pr-create 自身の step-attempt record は `run()` 完了後に append されるため、attestation が読む journal には含まれない。これは意図通り: attestation は「PR 作成の前提となった、通過済みゲート群」を証明する。

## Goals / Non-Goals

**Goals**:

- journal（events.jsonl）＋ usage.json を入力に、機械可読 attestation（ゲート順＋各ゲートの verdict、verdict 導出入力の findings 要約、step 別 model、予算/コスト消費、events.jsonl の hash）を組み立てる**副作用なし純関数**を新設し、単体テストで固定する。
- attestation を PR コメント本文へ整形する純関数を新設する。
- pr-create の PR 作成成功後に、attestation を PR コメントとして best-effort で添付する。
- 添付失敗が pr-create（PR 作成）自体を失敗させないことをテストで固定する。

**Non-Goals**:

- check-run 方式での添付（新規 GitHub write 能力は追加しない）。
- `specrunner verify <PR>`（journal 再 fold による第三者検証、backlog A-3）。
- attestation スキーマの版号付け・凍結（契約凍結フェーズで扱う。本 request の attestation object に version 番号フィールドは持たせない）。
- 既存 gate / verdict / judge-verdict 機構の変更。
- usage.json / events.jsonl の書き込み側の変更。

## Decisions

### D1: attestation 組立を新規純関数モジュール `src/core/attestation/` に分離する

pr-create への直書きを却下し、journal / usage → 機械可読サマリの導出を副作用なし純関数として `src/core/attestation/` に切り出す（判定系純粋性 B-5 と同型）。pr-create は「ファイル読み → 純関数呼び出し → コメント添付」の薄い integration に留める。

構成:

- `src/core/attestation/types.ts` — `Attestation` および構成型の宣言。
- `src/core/attestation/build-attestation.ts` — `buildAttestation(input): Attestation`（純関数）。
- `src/core/attestation/render-comment.ts` — `renderAttestationComment(attestation): string`（純関数、PR コメント本文を生成）。

**Rationale**: 重心（journal + usage → サマリ + hash）を副作用なしにして単体テストで固定できる。pr-create 直書きは I/O とロジックが絡み単体テスト困難。
**Alternatives**: (a) pr-create.ts に直書き → 却下（テスト困難・責務混在）。(b) `src/core/pr-create/` 配下に置く → attestation は run 全体の成果物であり pr-create 固有ではないため、独立ディレクトリの方が意味が正確。

### D2: `buildAttestation` の入力は「raw events.jsonl 文字列 ＋ 解析済み UsageFile」とする

```
export interface AttestationInput {
  journalContent: string;   // events.jsonl の生バイト列
  usage: UsageFile;         // 解析済み usage.json
}
export function buildAttestation(input: AttestationInput): Attestation;
```

内部で `fold(journalContent)`（既存純関数）を呼んで steps/history を得、`journalContent` から hash を計算する。

**Rationale**: request の枠組み「journal（events.jsonl）＋ usage.json → サマリ ＋ events.jsonl の hash」に忠実。hash は添付対象そのもの（生バイト列）から導くため、fold 済み構造ではなく raw 文字列を単一 source とするのが正しい。テストは jsonl 文字列 fixture ＋ usage object を渡すだけで完結し、完全な `JobState` を組む必要がない。
**Alternatives**: fold 済み `state.steps` / `state.history` を渡す案 → hash 導出が呼び出し側に漏れ、テスト setup が重くなるため却下。

### D3: journal hash は events.jsonl 生バイト列の sha256 hex とする

`node:crypto` の `createHash("sha256")` で `journalContent` を hash する（決定的・副作用なし・I/O なし。B-12 が制限するのは `node:child_process` であり crypto は対象外）。

**Rationale**: 同一 journal に対し常に同一 digest。第三者が同じ events.jsonl を hash すれば一致を確認できる（将来の A-3 verify の布石）。
**Alternatives**: hash を呼び出し側で計算して渡す → 入力が増え、D2 の「単一 source」利点を損なうため却下。

### D4: ゲート実行順は fold 済み全 StepRun を `startedAt` で整列して導く

`fold()` は step 名でグルーピングし step 間の時系列順を保持しないため、全 step の全 StepRun を平坦化し `(startedAt, endedAt, step, attempt)` の辞書順で安定ソートしてゲート実行順を再構成する。各ゲートは `{ step, attempt, verdict, startedAt, endedAt, findings? }`。`findings` は `outcome.toolResult.findings` が存在する場合のみ、severity（critical/high/medium/low）と resolution（fixable/decision-needed）の件数要約として持たせる（finding 本文は載せない）。

**Rationale**: ISO timestamp による整列は決定的。finding を件数要約に落とすことでコメント肥大を防ぎつつ「verdict 導出入力の要約」を満たす。
**Alternatives**: history transition 列で順序を取る → transition と step-attempt の対応付けが曖昧。startedAt 整列が最も直接的。

### D5: step 別 model と cost は usage.json から導き、コスト算出は既存 `computeCostUsd` を再利用する

step 別 model = 各 stepName の `modelUsage` のキー集合（distinct・ソート）。cost = 各 invocation の `computeCostUsd(model, modelUsage[model])` の合算。pricing 表に無い model は `costUsd: null` とし、`unpricedModels` に列挙して null の理由を可観測にする。`modelUsage === null`（managed 等）の step は model 空・cost null。

**Rationale**: modelUsage は usage.json にのみ存在（journal step-attempt record には無い）。pricing は既存純関数を再利用し二重実装を避ける。null は「不明 ≠ ゼロ」を保つ既存 `computeCostUsd` 規約に合わせる。

### D6: `Attestation` object に版号フィールドを持たせない

スコープ外「attestation スキーマの版号付け・凍結」に従い、version 番号を持たせない。フィールドは additive に扱い、凍結フェーズで版号を導入する。

### D7: pr-create は PR 作成成功後に best-effort で attestation を添付する

`runPrCreate` が `created` / `existing-open` を返し `pr-create-result.md` を書いた後に、以下を **単一の try/catch で囲んで** 実行する（`result.number` が数値のときのみ）:

1. `path.join(cwd, slugEventsPath(slug))` から events.jsonl を読む。存在しない/空なら添付を skip（`logWarn`）。
2. `path.join(cwd, usageJsonPath(slug))` を `readUsageFile` で読む（欠落は空構造で許容、cost 不明扱い）。
3. `buildAttestation` → `renderAttestationComment` → `deps.githubClient.createIssueComment(deps.owner, deps.repo, result.number, body)`。

例外は全て catch し `logWarn` に留め、re-throw しない。PR 作成の成否・`pr-create-result.md`・parseResult の verdict には一切影響させない。

**Rationale**: attestation は補助成果物。添付失敗で PR 作成という主目的を巻き込まない（既存の usage append / lineage append の best-effort パターンと同型）。`logWarn` により失敗を可観測にしつつパイプラインは前進させる。
**Alternatives**: 添付失敗で escalation → 却下（主目的を補助失敗で巻き込む）。

### D8: コメント本文は「人間可読サマリ ＋ fenced JSON ブロック」の複合とする

`renderAttestationComment` は (a) 見出し・ゲート表・model・cost・hash の人間可読サマリと、(b) attestation object 全体を ` ```json ` フェンスで囲んだ機械可読ブロックを併記する。

**Rationale**: 「機械可読サマリ」を満たしつつ、PR 上で人間も読める。JSON ブロックは第三者ツールが抽出・parse できる。

## Risks / Trade-offs

| Risk | 影響度 | Mitigation |
|------|--------|-----------|
| managed runtime では journal / usage が `.specrunner/local/<slug>/` に在り、`cwd` 基点の解決とパスが異なり読めない | 中 | best-effort（D7）で missing 時は skip + warn。local / worktree runtime（主経路）は `<cwd>/specrunner/changes/<slug>/` で正しく解決する。managed 添付の完全対応は後続とし、本 request では主目的（PR 作成）を壊さないことを最優先にする |
| attestation は pr-create 前までの journal を反映（pr-create 自身の record を含まない） | 低 | 意図通り。「PR 作成の前提として通過したゲート群」を証明する。design に明記済み |
| findings 多数時にコメントが GitHub の 65536 文字上限を超える | 低 | findings は件数要約（severity/resolution カウント）に落とし本文を持たないため肥大しない |
| best-effort が実バグを握り潰す | 低 | catch 節で `logWarn` にエラーメッセージを出し可観測化。best-effort 挙動を単体テストで固定 |

## Open Questions

なし。managed runtime のパス差異は best-effort で吸収し、完全対応は後続 request（A-3 verify と併せて再検討）に委ねる。
