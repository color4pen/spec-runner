# Test Cases: CLI ログレベル体系の整備

## 凡例

- **Priority**: must / should / could
- **Source**: AC = 受け入れ基準, Task N = tasks.md Task N, Design DX = design.md DX

---

## Category: resolveLogLevel — CLI フラグ優先順位

### TC-01 `-vv` フラグで debug レベルが解決される
- **Priority**: must
- **Source**: AC, Task 4, Task 5, Design D2

```
GIVEN: CLI フラグで debug=true, verbose=false, quiet=false が渡される
WHEN: resolveLogLevel({ debug: true }) を呼ぶ
THEN: "debug" が返る
```

### TC-02 `-v` フラグで verbose レベルが解決される
- **Priority**: must
- **Source**: AC, Task 4, Task 5, Design D2

```
GIVEN: CLI フラグで verbose=true, quiet=false が渡される
WHEN: resolveLogLevel({ verbose: true }) を呼ぶ
THEN: "verbose" が返る
```

### TC-03 `-q` フラグで quiet レベルが解決される
- **Priority**: must
- **Source**: AC, Task 4, Task 5, Design D2

```
GIVEN: CLI フラグで quiet=true が渡される
WHEN: resolveLogLevel({ quiet: true }) を呼ぶ
THEN: "quiet" が返る
```

### TC-04 フラグなし・環境変数なしで default レベルが解決される
- **Priority**: must
- **Source**: Task 1, Design D2

```
GIVEN: CLI フラグがすべて false/undefined
AND: SPECRUNNER_LOG_LEVEL, DEBUG 環境変数が未設定
WHEN: resolveLogLevel({}) を呼ぶ
THEN: "default" が返る
```

### TC-05 debug フラグが verbose・quiet より優先される
- **Priority**: must
- **Source**: Design D2

```
GIVEN: CLI フラグで debug=true, verbose=true, quiet=true が同時に渡される
WHEN: resolveLogLevel({ debug: true, verbose: true, quiet: true }) を呼ぶ
THEN: "debug" が返る（最高優先）
```

### TC-06 verbose フラグが quiet より優先される
- **Priority**: should
- **Source**: Design D2

```
GIVEN: CLI フラグで verbose=true, quiet=true が渡される
WHEN: resolveLogLevel({ verbose: true, quiet: true }) を呼ぶ
THEN: "verbose" が返る
```

---

## Category: resolveLogLevel — 環境変数フォールバック

### TC-07 SPECRUNNER_LOG_LEVEL=quiet が解決される
- **Priority**: must
- **Source**: AC, Design D2

```
GIVEN: CLI フラグがすべて false/undefined
AND: SPECRUNNER_LOG_LEVEL="quiet" が設定されている
WHEN: resolveLogLevel({}) を呼ぶ
THEN: "quiet" が返る
```

### TC-08 SPECRUNNER_LOG_LEVEL=verbose が解決される
- **Priority**: must
- **Source**: AC, Design D2

```
GIVEN: CLI フラグがすべて false/undefined
AND: SPECRUNNER_LOG_LEVEL="verbose" が設定されている
WHEN: resolveLogLevel({}) を呼ぶ
THEN: "verbose" が返る
```

### TC-09 SPECRUNNER_LOG_LEVEL=debug が解決される
- **Priority**: must
- **Source**: AC, Design D2

```
GIVEN: CLI フラグがすべて false/undefined
AND: SPECRUNNER_LOG_LEVEL="debug" が設定されている
WHEN: resolveLogLevel({}) を呼ぶ
THEN: "debug" が返る
```

### TC-10 DEBUG 環境変数が設定されている場合 debug レベルに昇格する
- **Priority**: must
- **Source**: AC, Design D2

```
GIVEN: CLI フラグがすべて false/undefined
AND: SPECRUNNER_LOG_LEVEL が未設定
AND: DEBUG="*" が設定されている
WHEN: resolveLogLevel({}) を呼ぶ
THEN: "debug" が返る
```

### TC-11 CLI フラグが SPECRUNNER_LOG_LEVEL より優先される
- **Priority**: must
- **Source**: Design D2

```
GIVEN: CLI フラグで quiet=true が渡される
AND: SPECRUNNER_LOG_LEVEL="verbose" が設定されている
WHEN: resolveLogLevel({ quiet: true }) を呼ぶ
THEN: "quiet" が返る（CLI フラグが環境変数より優先）
```

### TC-12 CLI フラグが DEBUG 環境変数より優先される
- **Priority**: must
- **Source**: Design D2

```
GIVEN: CLI フラグで quiet=true が渡される
AND: DEBUG="*" が設定されている
WHEN: resolveLogLevel({ quiet: true }) を呼ぶ
THEN: "quiet" が返る
```

### TC-13 SPECRUNNER_LOG_LEVEL に未知の値が設定された場合 default にフォールバックする
- **Priority**: should
- **Source**: Design D2

```
GIVEN: CLI フラグがすべて false/undefined
AND: SPECRUNNER_LOG_LEVEL="info"（未定義値）が設定されている
AND: DEBUG が未設定
WHEN: resolveLogLevel({}) を呼ぶ
THEN: "default" が返る
```

---

## Category: isLevelEnabled / ゲート条件

### TC-14 logError は quiet レベルでも出力される
- **Priority**: must
- **Source**: Design（表）, Task 2

```
GIVEN: currentLevel が "quiet" に設定されている
WHEN: logError("fatal error") を呼ぶ
THEN: stderr に "fatal error" が出力される
```

### TC-15 logWarn は default レベルで出力される（挙動変更）
- **Priority**: must
- **Source**: AC, Task 2, Design（表）

```
GIVEN: currentLevel が "default" に設定されている（フラグなし）
WHEN: logWarn("something deprecated") を呼ぶ
THEN: stderr に "something deprecated" が出力される
```

### TC-16 logWarn は quiet レベルで抑制される
- **Priority**: must
- **Source**: Task 2, Design D9

```
GIVEN: currentLevel が "quiet" に設定されている
WHEN: logWarn("warning") を呼ぶ
THEN: stderr に出力されない
```

### TC-17 logInfo は default レベルで出力される
- **Priority**: must
- **Source**: Task 2, Design（表）

```
GIVEN: currentLevel が "default" に設定されている
WHEN: logInfo("processing...") を呼ぶ
THEN: stderr に "processing..." が出力される
```

### TC-18 logInfo は quiet レベルで抑制される
- **Priority**: must
- **Source**: AC（-q で error のみ）, Task 2

```
GIVEN: currentLevel が "quiet" に設定されている
WHEN: logInfo("step info") を呼ぶ
THEN: 出力されない
```

### TC-19 logStep は quiet レベルで抑制される
- **Priority**: must
- **Source**: Task 2, Task 9

```
GIVEN: currentLevel が "quiet" に設定されている
WHEN: logStep("compiling") を呼ぶ
THEN: 出力されない
```

### TC-20 logSuccess は quiet レベルで抑制される
- **Priority**: must
- **Source**: Task 2

```
GIVEN: currentLevel が "quiet" に設定されている
WHEN: logSuccess("done") を呼ぶ
THEN: 出力されない
```

### TC-21 logDebug は debug レベルでのみ出力される
- **Priority**: must
- **Source**: AC（`-vv` で debug）, Task 2, Task 9

```
GIVEN: currentLevel が "debug" に設定されている
WHEN: logDebug("internal state") を呼ぶ
THEN: stderr に "internal state" が出力される
```

### TC-22 logDebug は verbose レベルでは出力されない
- **Priority**: must
- **Source**: Design（表）, Task 2

```
GIVEN: currentLevel が "verbose" に設定されている
WHEN: logDebug("internal state") を呼ぶ
THEN: 出力されない
```

### TC-23 logDebug は default レベルでは出力されない
- **Priority**: must
- **Source**: Task 2

```
GIVEN: currentLevel が "default" に設定されている
AND: DEBUG 環境変数が未設定
WHEN: logDebug("internal state") を呼ぶ
THEN: 出力されない
```

---

## Category: SPECRUNNER_DEBUG サブシステムフィルタ

### TC-24 debug レベル + SPECRUNNER_DEBUG=pipeline で logPipelineDiag が出力される
- **Priority**: must
- **Source**: AC, Task 3

```
GIVEN: currentLevel が "debug" に設定されている
AND: SPECRUNNER_DEBUG="pipeline" が設定されている
WHEN: logPipelineDiag("step:start", "detail") を呼ぶ
THEN: stderr に diagnostic ログが出力される
```

### TC-25 debug レベル未設定時は SPECRUNNER_DEBUG=pipeline があっても logPipelineDiag が出力されない
- **Priority**: must
- **Source**: AC, Task 3, Task 9

```
GIVEN: currentLevel が "default"（または "verbose"）に設定されている
AND: SPECRUNNER_DEBUG="pipeline" が設定されている
WHEN: logPipelineDiag("step:start", "detail") を呼ぶ
THEN: 出力されない
```

### TC-26 debug レベル有効でも SPECRUNNER_DEBUG に pipeline が含まれなければ出力されない
- **Priority**: should
- **Source**: Task 3, Design D6

```
GIVEN: currentLevel が "debug" に設定されている
AND: SPECRUNNER_DEBUG="session" が設定されている（pipeline は含まない）
WHEN: logPipelineDiag("step:start", "detail") を呼ぶ
THEN: 出力されない
```

### TC-27 SPECRUNNER_DEBUG=pipeline,session でカンマ区切り複数サブシステムが機能する
- **Priority**: should
- **Source**: Design D6

```
GIVEN: currentLevel が "debug" に設定されている
AND: SPECRUNNER_DEBUG="pipeline,session" が設定されている
WHEN: logPipelineDiag("step:start") を呼ぶ
THEN: 出力される
```

---

## Category: flag-parser — 短縮フラグ

### TC-28 `-q` が quiet フラグにパースされる
- **Priority**: must
- **Source**: AC, Task 4

```
GIVEN: CLI 引数に "-q" が含まれる
WHEN: flag-parser でパースする
THEN: flags["quiet"] === true になる
```

### TC-29 `-v` が verbose フラグにパースされる
- **Priority**: must
- **Source**: AC, Task 4

```
GIVEN: CLI 引数に "-v" が含まれる
WHEN: flag-parser でパースする
THEN: flags["verbose"] === true になる
```

### TC-30 `-vv` が debug フラグにパースされる
- **Priority**: must
- **Source**: AC, Task 4

```
GIVEN: CLI 引数に "-vv" が含まれる
WHEN: flag-parser でパースする
THEN: flags["debug"] === true になる
```

### TC-31 `-vv` が `-v` より先に判定される（前置一致の衝突回避）
- **Priority**: must
- **Source**: Task 4（注意書き）

```
GIVEN: CLI 引数に "-vv" が含まれる
WHEN: flag-parser でパースする
THEN: flags["debug"] === true かつ flags["verbose"] !== true になる
```

### TC-32 `-v -v`（2 トークン）は verbose のまま（debug にならない）
- **Priority**: should
- **Source**: Task 4（注意書き）

```
GIVEN: CLI 引数に ["-v", "-v"] が含まれる
WHEN: flag-parser でパースする
THEN: flags["verbose"] === true かつ flags["debug"] !== true になる
```

### TC-33 `--verbose` 既存フラグが引き続きパースされる（後方互換）
- **Priority**: must
- **Source**: Design D4, Task 5

```
GIVEN: CLI 引数に "--verbose" が含まれる
WHEN: flag-parser でパースする
THEN: flags["verbose"] === true になる
```

### TC-34 `--debug` は Unknown flag エラーになる（-vv のみサポート）
- **Priority**: should
- **Source**: Task 5（注意書き）

```
GIVEN: CLI 引数に "--debug" が含まれる
WHEN: flag-parser でパースする
THEN: Unknown flag エラーが返る
```

---

## Category: initVerboseLog の起動条件

### TC-35 verbose レベルで initVerboseLog が有効化される
- **Priority**: must
- **Source**: AC（verbose レベル以上で initVerboseLog が有効化）, Task 2, Task 7

```
GIVEN: currentLevel が "verbose" に設定されている
WHEN: runner が initVerboseLog を呼ぶ
THEN: verbose ログファイルへの書き込みが開始される
```

### TC-36 debug レベルで initVerboseLog が有効化される
- **Priority**: must
- **Source**: AC, Task 7, Design D7

```
GIVEN: currentLevel が "debug" に設定されている
WHEN: runner が initVerboseLog を呼ぶ
THEN: verbose ログファイルへの書き込みが開始される
```

### TC-37 default レベルでは initVerboseLog が起動しない
- **Priority**: must
- **Source**: Task 7, Design D7

```
GIVEN: currentLevel が "default" に設定されている
WHEN: runner が initVerboseLog を呼ぶ
THEN: verbose ログファイルへの書き込みは開始されない
```

---

## Category: ProgressDisplay の quiet 挙動

### TC-38 quiet レベルで onStepStart が抑制される
- **Priority**: should
- **Source**: Task 8, Design D9

```
GIVEN: ProgressDisplay が logLevel="quiet" で初期化されている
WHEN: onStepStart イベントが発火する
THEN: stderr に step 開始メッセージが出力されない
```

### TC-39 quiet レベルで onPipelineComplete は出力される
- **Priority**: should
- **Source**: Task 8（最終結果は quiet でも通知）

```
GIVEN: ProgressDisplay が logLevel="quiet" で初期化されている
WHEN: onPipelineComplete イベントが発火する
THEN: stderr に最終結果メッセージが出力される
```

### TC-40 verbose/debug レベルで heartbeat が行単位出力になる
- **Priority**: could
- **Source**: Task 8, Design D8

```
GIVEN: ProgressDisplay が logLevel="verbose" で初期化されている
AND: TTY 環境である
WHEN: heartbeat が発火する
THEN: \r（キャリッジリターン）で上書きせず改行出力する
```

---

## Category: 型チェック・テスト green

### TC-41 bun run typecheck が green になる
- **Priority**: must
- **Source**: AC, Task 10

```
GIVEN: 全ファイルの変更が完了している
WHEN: bun run typecheck を実行する
THEN: 型エラー 0 件で終了する
```

### TC-42 bun run test が green になる
- **Priority**: must
- **Source**: AC, Task 10

```
GIVEN: 全ファイルの変更が完了している
WHEN: bun run test を実行する
THEN: 全テストが PASS する
```

---

## Category: E2E / 手動確認

### TC-43 SPECRUNNER_LOG_LEVEL=quiet で error のみ出力される
- **Priority**: must
- **Source**: AC, Task 10（手動確認）

```
GIVEN: SPECRUNNER_LOG_LEVEL=quiet が設定されている
WHEN: specrunner doctor を実行する
THEN: stderr に error メッセージのみ出力される（warn/info/step は出力されない）
```

### TC-44 -v フラグで verbose 相当のログが出力される
- **Priority**: must
- **Source**: AC

```
GIVEN: specrunner run -v <request> を実行する
WHEN: コマンドが実行される
THEN: 詳細ログ（verbose レベル）が出力される
AND: initVerboseLog によるファイル書き込みが開始される
```

### TC-45 -vv フラグで全 diagnostic ログが出力される
- **Priority**: must
- **Source**: AC

```
GIVEN: specrunner run -vv <request> を実行する
WHEN: コマンドが実行される
THEN: diagnostic ログを含む全ログが出力される
```
