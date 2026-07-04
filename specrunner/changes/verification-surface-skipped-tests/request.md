# verification が silent-skip されたテストを surface する

## Meta

- **type**: spec-change
- **slug**: verification-surface-skipped-tests
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

verification の phase fallback path は test script を実行し exitCode 0 を「passed」とする。test suite が service 依存（DB 等）の欠如で integration test を skip する設計（例: `describe.skipIf(!hasDb)`）だと、DB が無い verification 環境では exit 0 で「passed」になり、core 機能（DB 制約・認証・投稿など）が未検証のまま通過する（偽 green）。

「typecheck && test green」を形式的には満たすが実質未検証で、verification の verdict 自体は clean pass を主張してしまう。後段の code-review が拾えることはあるが、verification が「どれだけ skip されたか」を一切記録しないため、保証（attestation）の観点で「passed」の意味が曖昧になる。本 request は **skip を可視化して「passed」の質を検証可能にする**（pass/fail の判定自体は変えない）。

## 現状コードの前提

- `src/core/verification/runner.ts` の phase loop（script phase）: `spawnScript(runCmd, runArgs, cwd)` で exitCode/stdout/stderr を捕捉し、`status = exitCode === 0 ? "passed" : "failed"`。skip 数は参照も記録もしない。
- `src/core/verification/runner.ts:320-333`: `allSkipped`（全 phase が skipped）のとき `VERIFICATION_NO_RUNNABLE_PHASES` で failed にする。ただし phase 内部で**一部 test が skip される partial skip**は検出しない。
- `PhaseResult` は `stdout` を保持するが、skip 数は verdict にも result 出力にも反映されない。

## 要件

1. **skip の検出と記録**: test phase の出力（stdout）から skip されたテスト数を best-effort に検出し、検出数を verification-result に記録して surface する（downstream の code-review / conformance、および人が視認できる形）。
2. **clean pass との区別**: skip が検出された場合、verification-result 上で「skip 無しの clean pass」と区別できる注記（warning / passed-with-skips 相当）を付す。pass/fail の verdict 自体は exitCode ベースのまま変えない。
3. **best-effort・非ブロッキング**: skip 検出は framework 依存の出力を pattern で拾う best-effort とし、検出漏れを許容する。誤検出があっても pass/fail をブロックしない。

## スコープ外

- service 依存（DB 等）の provision（container 起動・サービス lifecycle 管理）。minimal-deps 原則によりスコープ外。必要なら既存の `verification.commands` に `docker compose up -d db && …` を書く手段で対応する。
- skip 検出時の hard-fail / verdict 降格。platform 固有の正当な skip を誤ブロックしないため、本 request は可視化（surface）に留め、pass/fail の変更はしない。
- `verification.commands` path の skip 検出（本 request は phase fallback path が対象。commands path は将来別途）。
- 特定 test runner の JSON reporter 強制（侵襲的なためスコープ外）。

## 受け入れ基準

- [ ] test phase の出力に skip 表示（例 `N skipped` / `N pending`）が含まれる場合、その数が verification-result に記録・surface されることをテストで固定する。
- [ ] skip が検出されても verdict（passed / failed）は従来通り exitCode で決まることをテストで固定する。
- [ ] skip 表示が無い（全 test 実行）場合は skip 注記が付かず、clean pass のままであることをテストで固定する。
- [ ] 既存の `VERIFICATION_NO_RUNNABLE_PHASES`（全 phase skipped → failed）の挙動は不変（既存テスト無変更 green）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- `PhaseResult`（または verification-result の出力）に skip 検出数を持たせ、test phase の `stdout` を framework 非依存の pattern（例: `/(\d+)\s+(skipped|pending|todo)/i`）で best-effort 解析する。skip > 0 のとき verification-result に注記を付す。verdict は不変。
- 目的は「passed の質を検証可能にする」こと。gate 化（hard-fail）はせず、まず可視化に留める。

**却下**

- service provision（DB 等の起動）: orchestration 面が重く minimal-deps 北極星と相反。既存 `verification.commands` で代替可能なため spec-runner 本体に持たせない。
- skip 検出での hard-fail / verdict 降格: platform 固有の正当な skip を誤ブロックする。skip の意味づけ（意図的 skip か環境欠如か）を判別する設計が固まるまでは可視化に留める。
- JSON reporter 強制: test runner に特定 reporter を要求するのは侵襲的で、言語非依存性を損なう。
