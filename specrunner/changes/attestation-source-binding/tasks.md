# Tasks: fact-check attestation を source revision に束縛する

<!-- 実装は design.md の Decisions D1–D6 に従う。信号は「change folder を除外した最新
source commit の sha」。記録は request-review（agent 転記）、評価は design（CLI 決定論）。 -->

## T-01: source revision 取得ヘルパを追加する（D1 / D2）

- [ ] `src/git/source-revision.ts` を新規作成し、`readSourceRevision(cwd: string): Promise<string | null>` を export する。
- [ ] 実装は `gitExec(defaultSpawnFn, cwd, ["rev-list", "-1", "HEAD", "--", ".", ":(exclude)<changesDir>"])` を用いる。`<changesDir>` は `changesDirRel()`（`src/util/paths.ts`）から導出し、`:(exclude)` pathspec に埋め込む（ハードコードしない）。
- [ ] 成功時は trimmed sha を返す。git 失敗・空出力・非 git ディレクトリでは `null` を返す（never throw。`gitExec` の契約に従う）。
- [ ] `src/adapter/` へは import しない（`src/git/` の層制約）。import は `src/util/git-exec.js` と `src/util/paths.js` のみ。

**Acceptance Criteria**:
- git 履歴を持つ一時リポジトリで、source ファイル commit → change folder ファイル commit の順に積んだとき、`readSourceRevision` は **source commit の sha** を返す（change folder commit は無視される）。
- 非 git ディレクトリ / git 不在では `null` を返し、例外を投げない。
- 除外パスが `changesDirRel()` 由来で、文字列リテラルの重複が無い。

## T-02: `FactCheckAttestation` に `sourceRevision` を追加する（D3 / 後方互換）

- [ ] `src/core/factcheck-attestation.ts` の `FactCheckAttestation` に `sourceRevision?: string`（optional）を追加する。
- [ ] `buildFactCheckAttestation(requestContent, verifiedAssertions, sourceRevision?)` に第 3 引数（optional）を追加し、与えられたときのみ `sourceRevision` を出力に含める。
- [ ] `parseFactCheckAttestation` を拡張: `sourceRevision` が string のときのみ取り込む。**欠落・非 string では reject せず** `sourceRevision` を undefined として parse を成功させる（旧 attestation の後方互換）。
- [ ] 既存の requestHash / codeAssertionsVerified / verifiedAssertions の必須検証と coercion は不変。

**Acceptance Criteria**:
- `sourceRevision` を持つ JSON を parse すると値が取り込まれる。
- `sourceRevision` を持たない旧 JSON も parse に成功し、`sourceRevision` が undefined になる（null を返さない）。
- `sourceRevision` が非 string（数値等）のときは undefined として扱う（parse は成功）。
- `buildFactCheckAttestation` は第 3 引数省略時に `sourceRevision` を出力に含めない。

## T-03: `evaluateFactCheckAttestation` の stale 判定に source 束縛を加える（D4）

- [ ] シグネチャを `evaluateFactCheckAttestation(attestationRaw, currentRequestContent, currentSourceRevision: string | null)` に変更する。
- [ ] 判定順序を design D4 の通りに実装する:
  1. null / parse 失敗 → `absent`（不変）。
  2. `!codeAssertionsVerified` または `requestHash` 不一致 → `stale`（**既存挙動を保存**）。
  3. `parsed.sourceRevision === undefined` または `currentSourceRevision === null` または `parsed.sourceRevision !== currentSourceRevision` → `stale`。
  4. それ以外 → `valid`（`verifiedAssertions` を返す）。
- [ ] `AttestationEvaluation` の shape（`{ status, verifiedAssertions }`）は不変に保つ。

**Acceptance Criteria**:
- requestHash 一致・codeAssertionsVerified true・`sourceRevision === currentSourceRevision` → `valid`（受け入れ基準 1）。
- requestHash 一致だが `sourceRevision !== currentSourceRevision` → `stale`（受け入れ基準 2・核心）。
- attestation に `sourceRevision` が無い（旧）→ `stale`（受け入れ基準 3・fail-safe）。
- `currentSourceRevision === null`（取得不能）→ `stale`（fail-safe）。
- requestHash 不一致 → `stale` / codeAssertionsVerified false → `stale`（受け入れ基準 4・既存保存）。
- null / 非 JSON → `absent`（不変）。

## T-04: request-review が source revision を記録する（D3）

- [ ] `src/git/dynamic-context.ts` の `DynamicContext` に `sourceRevision?: string` を追加する（JSDoc に「request-review が記録する source commit sha。design の source 束縛評価に使う」旨を記す）。
- [ ] `src/core/step/request-review.ts` の `enrichContext` で `readSourceRevision(cwd)` を呼び、非 null のときのみ `sourceRevision` を返却 context に載せる（request.md 読取失敗時は従来通り context 無改変で縮退）。
- [ ] `src/prompts/request-review-system.ts` の `RequestReviewInitialMessageInput` に `sourceRevision?: string` を追加し、`buildRequestReviewInitialMessage` の attestation JSON テンプレートに、値があるときのみ `"sourceRevision": "<value>"` 行を追加する（agent は verbatim 転記。requestHash と同じ扱い）。
- [ ] `request-review.ts` の `buildMessage` から `deps.dynamicContext?.sourceRevision` を渡す。
- [ ] `REQUEST_REVIEW_SYSTEM_PROMPT` の「Fact-Check Attestation Output」節の JSON shape に `sourceRevision` を追記し、「user message から verbatim で転記。再計算しない。指示が無ければ省略」と明記する。

**Acceptance Criteria**:
- git リポジトリ上で `RequestReviewStep.enrichContext` が `sourceRevision` を `readSourceRevision` の値に設定する。
- request.md 不在時は `sourceRevision`・`requestContentHash` とも付与されず context 無改変（既存の縮退テストが green のまま）。
- `sourceRevision` 付きで `buildRequestReviewInitialMessage` を呼ぶと、生成 message の attestation JSON に `sourceRevision` と其の値が含まれる。`sourceRevision` 無しでは含まれない。
- `REQUEST_REVIEW_SYSTEM_PROMPT` が `sourceRevision` を含む。

## T-05: design が current source revision を評価に渡す（D4 / D6）

- [ ] `src/core/step/design.ts` の `enrichContext` で、request.md 読取後に `readSourceRevision(cwd)` を呼び、`evaluateFactCheckAttestation(attestationRaw, requestContent, currentSourceRevision)` の第 3 引数として渡す。
- [ ] request.md 読取失敗時は従来通り context 無改変で縮退（`factCheckAttestation` 未設定 → design は verify-all）。git 取得不能（`readSourceRevision` が null）でも request.md が読めれば評価は走り、D4-3 で stale に倒れる。
- [ ] `buildMessage` / `buildFactCheckDirective` / `design-system.ts` は変更しない（評価結果の shape 不変）。

**Acceptance Criteria**:
- git リポジトリ上で、attestation の `sourceRevision` が current と一致・hash 一致・verified true のとき `DesignStep.enrichContext` が `factCheckAttestation.status === "valid"` を返す。
- attestation の `sourceRevision` が current と異なるとき `status === "stale"`。
- 旧 attestation（`sourceRevision` 無し）で `status === "stale"`。
- request.md 不在時は `factCheckAttestation` 未設定（既存の縮退挙動を保存）。

## T-06: stale directive の理由文を source 変化にも言及させる（D4・任意改善）

- [ ] `src/core/factcheck-attestation.ts` の `buildFactCheckDirective` の stale 理由文を、request.md 変化・source revision 変化・codeAssertionsVerified false の 3 因を含む表現に更新する。
- [ ] 既存テストの不変条件（stale 文が `"stale"` と `"ALL"` を含む、stale と absent が異なる）は保つ。

**Acceptance Criteria**:
- stale directive が source revision への言及を含みつつ、`"stale"` / `"ALL"` を引き続き含む。

## T-07: 呼び出し側とテストを新契約へ更新する（D4 の trade-off）

- [ ] `tests/unit/step/factcheck-attestation.test.ts` の既存 `evaluateFactCheckAttestation` 呼び出し（2 引数）を新シグネチャに更新する。
- [ ] TC-FCA-04 の「valid」ケースを、attestation に `sourceRevision` を含め第 3 引数に一致する値を渡す形へ更新する（source 束縛により旧 valid 前提は stale になるため）。
- [ ] TC-FCA-09（`DesignStep.enrichContext` valid ケース）は git 履歴を持つ一時リポジトリを用意し、attestation の `sourceRevision` を実 `readSourceRevision` の値に一致させて valid を固定する。stale / absent / 縮退ケースも新契約で維持する。
- [ ] `readSourceRevision`（T-01）と source 束縛の valid/stale（T-03/T-05）を検証する新規テストを追加する。
- [ ] request-review / design の prompt・step テストが green であることを確認する。

**Acceptance Criteria**:
- `bun run typecheck` が green。
- `bun run test` が green（受け入れ基準 5）。
- 受け入れ基準 1–4 に対応するテストが存在し pass する。
