# ADR: test-coverage 契約違反の自己修復ループ化と ID 列挙

- **date**: 2026-07-25
- **slug**: test-coverage-follow-up-repair-loop
- **status**: accepted

## Context

test-materialize step の `test-coverage` 出力契約（must TC の TC-ID がテストファイルに出現し assertion を伴うこと）は `policy: "halt"` で宣言されていた。

違反時の挙動に 2 つの問題があった:

1. **算出済みデータが捨てられる**: `evaluateTestCoverage` は違反した TC-ID を `missingTcIds` / `assertionlessTcIds` として区別して返し、local runtime は `[...missingTcIds, ...assertionlessTcIds]` を `OutputViolation.detail` に格納していた。ところが `makeOutputGateHalt` は `test-coverage` kind の violation で `detail` を無視し、`test-cases.md` の path しか halt メッセージに出力しなかった。

2. **自己修復不能ループ**: `policy: "halt"` であるため、step-context-builder の in-session 修復ループ（detect → `buildOutputFollowUpPrompt` → 再検証）の対象外だった。agent は「どの TC が欠けているか」を知らされないまま再走し、同一の TC を欠落させて同じ halt を繰り返す自己修復不能ループに陥った。

実運用（外部 repo、specrunner 0.4.x）で 65 TC 中 2 件（TC-064 / TC-065）を巡って実測された。operator が coverage 検査ロジックを手元で再現して欠落 TC を特定するまで脱出できなかった。

同種の `tasks-complete` 契約は (1) violation detail を halt メッセージに列挙し、(2) `policy: "follow-up"` で in-session 修復ループを持つ。`test-coverage` だけが「detail を捨てる + halt 直行」の組み合わせになっており、機械が答えを知っているのに誰にも伝えない状態だった。

## Decisions

### D1: `OutputViolation` に `coverage` 構造化フィールドを追加し、`detail` との二重表現とする

`OutputViolation`（`src/core/port/output-contract.ts`）に任意フィールドを追加した:

```ts
coverage?: { missingTcIds: string[]; assertionlessTcIds: string[] };
```

local runtime の `test-coverage` 違反産出箇所（単一箇所）で `coverage` と `detail` を同時に設定する。`detail` は従来どおり `[...missingTcIds, ...assertionlessTcIds]` の平坦な union を維持し、後方互換を保つ。halt メッセージ・follow-up prompt の描画器は `coverage` を読んでカテゴリ別に描画する。

**理由**: missing と assertionless で修復指示が異なるため、描画器は型で 2 カテゴリを区別できる必要がある。`detail` を tagged 文字列（`"missing:TC-064"`）にする方式は 2 描画器に文字列 parse を持ち込む fragile な規約になる。`ContentFormatCheck` を port DTO の任意フィールドとして保持する既存前例に倣い、`test-coverage` 専用の構造化フィールドを 1 つ差す方が型安全かつテストしやすい。

`coverage` と `detail` は同一の `TestCoverageResult` から単一箇所で同時に導出されるため、二重管理による drift は起きない。

**却下案**:
- `detail` を tagged 文字列にする: port DTO の既存意味を変え、2 描画器に文字列 parse を持ち込む → 却下。
- 同一契約から missing 用・assertionless 用の 2 violation を emit する: kind と path が同一で区別不能 → 却下。

### D2: halt メッセージに `test-coverage` の ID を描画する（tasks-complete と同型）

`makeOutputGateHalt`（`src/core/step/step-halt.ts`）の `violationPaths` map に `v.kind === "test-coverage"` の分岐を追加した。`v.coverage` から 2 カテゴリを別々に描画する:

```
specrunner/changes/<slug>/test-cases.md (missing TCs: TC-064, TC-065; assertionless TCs: TC-003)
```

`coverage` が undefined のとき（managed の best-effort skip 等）は `see file` に fall back する。既存の `tasks-complete` / `content-format` / `produced` の描画は無変更。

**理由**: 「tasks-complete の既存表示と同型」が要件。同じ map に 1 分岐を足すのが最小差分であり、既存の描画契約（`${path} (<detail>)` 形式）に一致する。

### D3: follow-up prompt に `test-coverage` 節を追加する（カテゴリ別 ID 明示）

`buildOutputFollowUpPrompt`（`src/core/step/output-verify.ts`）に `test-coverage` 節を追加した。`v.coverage` を集約し 2 カテゴリに分けて ID を明示する:

- **missing TC-ID**: テストを書き TC-ID をテストファイルに記載するよう指示
- **assertionless TC-ID**: assertion を最低 1 つ追加するよう指示

**理由**: missing と assertionless の修復指示が異なるため、カテゴリ別に節を分ければ agent が「テストを書く」対象と「assertion を足す」対象を取り違えない。

**却下案**: 単一節に全 ID を列挙し修復方法を 1 文で書く。agent が誤った修復（assertionless に新規テストを書く）をしうる → 却下。

### D4: `test-coverage` 契約を `policy: "follow-up"` に変更し既存修復ループへ載せる

`TestMaterializeStep.outputContracts`（`src/core/step/test-materialize.ts`）の `test-coverage` 契約の `policy` を `"halt"` から `"follow-up"` に変更した。

これにより step-context-builder が follow-up 契約を検出して `outputVerification` policy を構築し、adapter の outputVerification ループ（detect → D3 の follow-up prompt → 再検証）が session 内で最大 `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` 回実行される。解消しない場合は executor の最終出力ゲートが残存 follow-up violation を拾い、D2 で ID 付き halt メッセージを出して `STEP_OUTPUT_MISSING` で halt する。

新機構は作らない。`tasks-complete` / `content-format` が使う detect→repair→last-resort-halt の seam をそのまま再利用する。

**挙動保存の範囲**:
- **充足ケース**: detect が violation 0 件を返し即 break するため追加 turn は発火しない（tasks-complete と同一）。
- **違反 → 修復ケース**: 同一 session で ID 明示の修復指示を受けて再試行、充足後 commit へ進む。
- **修復上限超過ケース**: 従来（即 halt）より余裕を与えてから halt する。halt メッセージには D2 により ID が載る。

**却下案（architect 評価済み）**:
- halt メッセージの改善のみ（policy は halt のまま）: agent への情報伝達が operator の resume 操作経由の人手依存のままで、自己修復不能ループの根が残る → 却下。
- coverage 判定に LLM を関与させ agent に充足可否を判断させる: 機械検証を agent 判断に置き換えるのは検証可能性に逆行する → 却下。

## Alternatives Considered

### Alternative 1: halt メッセージの改善のみ（policy は halt のまま）

test-coverage 契約の `policy: "halt"` は変更せず、`makeOutputGateHalt` の描画だけ改善して欠落 TC-ID を表示する案。

- **Pros**: 実装が最小。policy 変更なし、test-materialize の session budget への影響ゼロ。adapter の outputVerification ループを変更しない。
- **Cons**: agent への情報伝達は halt 経由のため、operator が resume 操作（`specrunner job resume`）を実行してはじめて agent が再試行できる。自己修復不能ループの根（agent が欠落 TC を知らないまま再走する）は残る。halt → operator 介入 → resume の往復が必要で、同一 session 内での自動修復は不可能。
- **Why not**: 実測された問題の根本原因は「agent が欠落 TC-ID を知らない」ことではなく「知った上で同一 session 内で試行できない」こと。メッセージ改善は情報提供を改善するが、修復を依然 operator の手作業に依存させる。architect 評価で却下。

### Alternative 2: coverage 判定に LLM を関与させ、agent に充足可否を判断させる

`evaluateTestCoverage` の判定結果を agent に提示し、充足しているかどうかを agent が判断する案。

- **Pros**: agent の contextual 判断を活用できる可能性がある。テストファイルの内容を agent が読んで「実質的に assertion がある」と判断できるかもしれない。
- **Cons**: `evaluateTestCoverage` が決定論的に算出できる結果（TC-ID の正規表現マッチ・assertion 有無）を LLM の確率的判断に置き換える。同じ入力で判定結果がセッションごとに変わりうる。機械検証ゲートの「再現性・監査可能性」が失われる。
- **Why not**: 機械が決定論的に答えられる問いに LLM を関与させることは検証可能性に逆行する。`evaluateTestCoverage` の判定ロジック（`extractMustTcIds` / `tcIdBoundaryRe` / assertion 判定）を維持することが本 request のスコープ確認事項（スコープ外）でもある。architect 評価で却下。

### Alternative 3: `detail` を tagged 文字列にする（`"missing:TC-064"` 形式）

`OutputViolation.detail` の各要素を `"missing:TC-064"` / `"assertionless:TC-003"` の prefix 付き文字列にし、新フィールドを追加しない案。

- **Pros**: `OutputViolation` port DTO の shape を変更しない。既存の `detail` フィールドを再利用できる。
- **Cons**: `detail` の既存意味（生 TC-ID の文字列 union）を変える。halt メッセージと follow-up prompt の 2 描画器それぞれが prefix を parse する必要が生じ、fragile な文字列規約を 2 箇所で維持することになる。既存の `detail` 検査テスト（例: TC-TMB-13）の期待値が変わり、後方互換が崩れる。
- **Why not**: 描画器に文字列 parse を持ち込むのは型安全性に逆行する。`ContentFormatCheck` を port DTO の任意フィールドとして持つ既存前例があり、構造化フィールドの追加は確立されたパターン。D1 の構造化フィールド案を採用。

### Alternative 4: 同一契約から missing 用・assertionless 用の 2 violation を emit する

`test-coverage` 違反を 1 件ではなく、missing TC 用と assertionless TC 用に 2 件の `OutputViolation` として emit する案。

- **Pros**: `OutputViolation` DTO を変更しない。kind で区別できれば既存描画器がそのまま使える可能性がある。
- **Cons**: missing と assertionless はいずれも同一ファイル（`test-cases.md`）に対する同一 kind（`test-coverage`）の violation となる。2 件 emit しても kind・path が同一であり、消費者がどちらが missing でどちらが assertionless かを区別できない。violation を「2 件来たら最初が missing、次が assertionless」のような順序規約にすると fragile。
- **Why not**: 区別するための情報が violation 間に存在しない。D1 の構造化フィールドで producer が分類情報を明示する方が型安全で、消費者側に順序規約を持ち込まない。

## Consequences

- `test-coverage` 違反時に agent が欠落 TC-ID を知った上で同一 session 内で修復を試みるようになり、自己修復不能ループを根絶する。
- halt に至る場合でも ID が列挙されるため、operator が coverage 検査ロジックを手元で再現する必要がなくなる。
- `OutputViolation` ポート DTO に `coverage` フィールドが追加されたが、`optional` であり既存の描画・テストは無変更で通る。
- test-materialize の session が follow-up turn を最大 `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` 回追加消費しうるが、充足済みケースでは追加 turn は発火しない。
- managed runtime は `test-coverage` を best-effort skip（`src/core/runtime/managed.ts`）のままであり、follow-up 化の恩恵は local runtime に限る（既存の非対称を踏襲）。

## 関連 ADR

- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — in-session 修復ループ（detect → follow-up prompt → 再検証）の原型。本 ADR はそのループに `test-coverage` を載せる。
- [2026-06-02-test-coverage-assertion-faithfulness-gate](./2026-06-02-test-coverage-assertion-faithfulness-gate.md) — `test-coverage` 判定ロジック（`extractMustTcIds` / assertion 判定）の設計。本 ADR はその算出結果を伝達するだけで判定ロジックは変更しない。
- [2026-06-04-step-io-contracts](./2026-06-04-step-io-contracts.md) — step 出力契約の枠組み。本 ADR の `outputContracts` / `policy` フィールドはこの枠組みを使う。
