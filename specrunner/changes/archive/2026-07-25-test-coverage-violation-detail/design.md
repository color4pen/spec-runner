# Design: test-coverage 契約違反で欠落 TC-ID を agent と operator に伝え、同一セッションで修復可能にする

## Context

test-materialize step は `outputContracts` に `test-coverage` 契約（`src/core/step/test-materialize.ts:87-97`）を
`policy: "halt"` で宣言する。契約検証は runtime の `validateStepOutputs` が担い、local runtime
（`src/core/runtime/local.ts:1317-1333`）は `evaluateTestCoverage`（`src/core/verification/test-coverage.ts`）を呼ぶ。
評価器は must TC の TC-ID がテストファイルに出現するか（missing）と、出現した TC-ID が assertion を伴うか
（assertionless）を **区別して** 返す（`TestCoverageResult.missingTcIds` / `assertionlessTcIds`）。
失敗時、local runtime は `[...missingTcIds, ...assertionlessTcIds]` を violation の `detail` に格納しており、
**欠落 TC-ID のデータは既に存在する**。

ところが、この算出済みデータは誰にも伝わらない:

- **halt メッセージ**: `makeOutputGateHalt`（`src/core/step/step-halt.ts:257-292`）は violation の kind が
  `tasks-complete` / `content-format` のときだけ `detail` を描画し、`test-coverage` は素の `v.path` に
  fall through する（`:263-269`）。よって halt メッセージには test-cases.md の path しか出ない。
- **follow-up prompt**: `buildOutputFollowUpPrompt`（`src/core/step/output-verify.ts:134-189`）は
  `tasks-complete` / `produced` / `content-format` の 3 節のみで、`test-coverage` の節が無い。
- **policy**: 契約は `policy: "halt"` なので、`step-context-builder`（`src/core/step/step-context-builder.ts:108-122`）が
  follow-up 契約から構築する in-session 修復ループ（detect → `buildOutputFollowUpPrompt` → 再検証、最大
  `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` 回）の対象にならない。違反すると即 `STEP_OUTPUT_MISSING` で halt する。

結果、materialize agent は「test-cases.md が契約不満足」としか知らされず、どの TC が欠けているか分からないまま
再走し、同じ TC を欠落させて同じ halt を繰り返す自己修復不能ループに陥る（外部 repo, specrunner 0.4.x で実測）。
operator が coverage 検査ロジックを手元で再現して欠落 TC を特定するまで脱出できなかった。

同種の契約である `tasks-complete`（未完チェックボックス）は、(1) violation の detail を halt メッセージに列挙し、
(2) `policy: "follow-up"` で同一セッション内の修復ループを持つ。`test-coverage` だけが
「detail を捨てる + halt 直行」の組み合わせになっており、機械が答えを知っているのに誰にも伝えない状態である。

## Goals / Non-Goals

**Goals**:

- `test-coverage` 契約の違反が検出されたとき、算出済みの欠落 TC-ID / assertionless TC-ID を
  **全経路（halt メッセージ・follow-up prompt）で ID を明示して** 伝える。
- `test-coverage` 契約を `policy: "halt"` から `policy: "follow-up"` に変更し、`tasks-complete` と同型の
  in-session 自己修復ループに載せる。違反時は同一セッションで ID 明示の修復指示を受けて再試行し、
  試行上限まで解消しない場合は従来どおり halt する（このとき halt メッセージにも ID が載る）。
- halt メッセージ・follow-up prompt の双方で、**missing（テストを書く）と assertionless（assertion を足す）を
  区別**し、それぞれ異なる修復指示を出す。

**Non-Goals**:

- coverage 判定ロジック（`extractMustTcIds` / `tcIdBoundaryRe` / assertion 判定）の変更。既に missing と
  assertionless を区別して返しており、本 request はその算出結果を伝えるだけである。
- `OUTPUT_FOLLOWUP_MAX_ATTEMPTS`（修復試行上限）の変更。既存機構をそのまま再利用する。
- 他 step の契約 policy の変更。
- Category: manual の must TC の集計上の扱い（別 request: test-materialize-existing-coverage）。
- managed runtime の `test-coverage` 検出。managed は local worktree を持たず現状 best-effort skip
  （`src/core/runtime/managed.ts:482-487`）であり、本変更でも violation を産出しない。挙動は不変。

## Decisions

### D1: missing / assertionless を `OutputViolation` の構造化フィールドで区別する

`OutputViolation`（`src/core/port/output-contract.ts`）に任意フィールドを追加する:

```ts
coverage?: { missingTcIds: string[]; assertionlessTcIds: string[] };
```

`test-coverage` 検出時、producer（local runtime）はこのフィールドに評価器の
`result.missingTcIds` / `result.assertionlessTcIds` をそのまま格納する。`detail` は従来どおり
`[...missingTcIds, ...assertionlessTcIds]` の平坦な union を維持する（後方互換：汎用描画・既存テスト）。
`coverage` と `detail` は同一の `TestCoverageResult` から **単一箇所（producer）で同時に導出** されるため、
二重管理による drift は起きない。halt メッセージ・follow-up prompt の 2 つの描画器は `coverage` を
読んでカテゴリ別に描画する。

**Rationale**: なぜ構造化フィールドで、prefix 付き文字列（例 `"missing:TC-064"`）を `detail` に詰める方式でないか。
修復指示が missing と assertionless で **異なる** ため、描画器は 2 つのカテゴリを型として区別できる必要がある。
prefix 文字列方式は 2 つの描画器それぞれで文字列を parse する fragile な規約になる。`ContentFormatCheck` を
`OutputContract` の任意フィールドとして持つ既存前例（port DTO にドメイン中立な任意フィールドを差す）に倣い、
`test-coverage` 専用の構造化フィールドを 1 つ差す方が型安全でテストしやすい。

**Alternatives considered**:
- `detail` を `["missing: TC-064", "assertionless: TC-003"]` の tagged 文字列にする。port DTO の shape 変更は
  避けられるが、`detail` の既存意味（生 TC-ID の union）を変え、2 描画器に文字列 parse を持ち込む。→ 却下。
- 同一契約から missing 用・assertionless 用の 2 violation を emit する。kind も path も同一で区別不能。→ 却下。

### D2: halt メッセージに test-coverage の detail を描画する（tasks-complete と同型）

`makeOutputGateHalt` の `violationPaths` map に `v.kind === "test-coverage"` の分岐を、既存の
`tasks-complete` / `content-format` 分岐と generic fall-through の間に追加する。`v.coverage` から
2 カテゴリを別々に描画する:

```
specrunner/changes/<slug>/test-cases.md (missing TCs: TC-064, TC-065; assertionless TCs: TC-003)
```

描画は純粋な module-local ヘルパで組み立てる:
- `missingTcIds` が非空なら `missing TCs: <ids>` を、`assertionlessTcIds` が非空なら
  `assertionless TCs: <ids>` を、それぞれ `; ` 連結する。
- 両方空、または `coverage` が undefined のとき（managed の `!branch` catch-all 等）は `see file` に fall back する。

`tasks-complete` / `content-format` / `produced` の既存描画は無変更。

**Rationale**: 要件 1 が「tasks-complete の既存表示と同型」を求める。同じ map に 1 分岐を足すのが最小差分で、
既存の描画契約（`${path} (<detail>)` 形式）に一致する。

**Alternatives considered**: halt メッセージ生成を全面的に再設計。blast radius が無用に広い。→ 却下。

### D3: follow-up prompt に test-coverage 節を追加する（カテゴリ別 ID 明示）

`buildOutputFollowUpPrompt` に `test-coverage` violation の節を追加する。`v.coverage` を集約し、
2 カテゴリに分けて ID を明示する:

- **missing TC-ID**: 「これらの must TC はどのテストファイルにも出現しない。各 TC のテストを書き、
  TC-ID をテストファイル（例: テストタイトル）に記載せよ」+ ID の箇条書き。
- **assertionless TC-ID**: 「これらの must TC はテストファイルに出現するが assertion が無い。
  各 TC を覆うテストに assertion（`expect(...)` / `assert(...)`）を最低 1 つ足せ」+ ID の箇条書き。

既存の共通末尾「After completing the work, commit and push your changes.」を踏襲する（test-materialize agent は
`gitWrite` 能力を持ち commit/push する）。既存の `tasks-complete` / `produced` / `content-format` 節は無変更。

**Rationale**: 要件 2 が missing と assertionless で異なる修復指示を ID 明示で出すことを求める。カテゴリ別に
節を分ければ、agent は「テストを書く」対象と「assertion を足す」対象を取り違えない。

**Alternatives considered**: 単一節に全 ID を列挙し修復方法を 1 文で書く。missing と assertionless の修復が
異なるため、agent が誤った修復（例: assertionless に新規テストを書く）をしうる。→ 却下。

### D4: test-coverage 契約を `policy: "follow-up"` に変更し既存修復ループへ載せる

`TestMaterializeStep.outputContracts`（`src/core/step/test-materialize.ts:87-97`）の `test-coverage` 契約の
`policy` を `"halt"` から `"follow-up"` に変更する。これにより:

1. `step-context-builder`（`:108-122`）が follow-up 契約を検出し `outputVerification` policy を構築する
   （現状 test-materialize は follow-up 契約ゼロのため未構築）。
2. adapter の outputVerification ループ（`src/adapter/claude-code/agent-runner.ts:938-989`）が session 内で
   detect（`validateStepOutputs`）→ `buildOutputFollowUpPrompt`（D3 の test-coverage 節）→ 再検証を
   最大 `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` 回試みる。
3. 予算内に解消すれば violation 0 件で step は commit へ進む。
4. 解消しなければ、executor の最終出力ゲート（`src/core/step/executor.ts:406-422`）が残存 follow-up violation を
   `partitionByPolicy` の follow-up 側で拾い、`allViolations` として `makeOutputGateHalt`（D2 で ID 描画）に渡して
   `STEP_OUTPUT_MISSING` で halt する。

新機構は作らない。`tasks-complete` / `content-format` が使う detect→repair→last-resort-halt の seam を
そのまま再利用する。

**挙動保存の範囲**:
- **通常ケース（充足、または違反 → 修復）**: base OID commit はテストを含むという保証は不変。修復ループは
  commit より前（adapter の `runner.run` 内）で走り、agent が追加テストを書いてから executor が commit する。
- **病的ケース（agent が予算内に充足できない）**: 従来は即 halt だったが、移設後は同一 session の修復を
  予算回数試みてから halt する。halt に至る場合でも D2 により ID がメッセージに載る。これは選んだ seam に
  内在する強化であり、新たな安全制約の追加ではない。

**Rationale**: architect 評価で採用済み。「機械が算出済みの答えを agent に渡して修復させ、無理なら halt」という
段階制は `tasks-complete` と一貫し、実測された自己修復不能ループ（operator の resume 操作依存）の根を断つ。

**Alternatives considered**:
- halt メッセージの改善のみ（policy は halt のまま）。agent への情報伝達が operator の resume 経由の人手依存の
  ままで、自己修復不能ループの根が残る。→ 却下（architect 評価）。
- coverage 判定に LLM を関与させ agent に充足可否を判断させる。機械検証を agent 判断へ置換するのは
  検証可能性に逆行する。→ 却下（architect 評価）。

## Risks / Trade-offs

- [Risk] policy 変更で test-materialize の session が follow-up turn を最大 2 回追加消費しうる →
  Mitigation: 充足済みの通常ケースでは detect が violation 0 件を返し即 break するため追加 turn は発火しない
  （`tasks-complete` と同一）。追加消費は違反時のみ。
- [Risk] `OutputViolation` に任意フィールドを足すことで既存の generic 消費者に影響 → Mitigation: `coverage` は
  optional。`detail` は union のまま維持し、既存の描画・テスト（例 TC-TMB-13 の `detail` 検査）は無変更で通る。
- [Risk] executor 最終ゲートに残る follow-up violation は従来 halt violation として扱われていた test-coverage を
  follow-up 側に移す。ゲートは `haltViolations.length > 0 || followUp.length > 0` で halt するため、残存すれば
  従来どおり halt する → Mitigation: halt 条件は不変（follow-up 残存でも halt）。差分は D2 の ID 描画のみ。
- [Trade-off] managed runtime では `test-coverage` は依然 best-effort skip で違反を産出しない。follow-up 化の
  恩恵は local runtime に限る → 既存の非対称（managed は coverage 非強制）を踏襲する意図的判断で、本 request の
  スコープ外。

## Open Questions

なし。設計判断は D1–D4 で確定。
