# Test Cases: resume --prompt 使用時に CLI 警告を表示する

## TC-01: --prompt 指定時に警告が stderr に表示される

- **Category**: 警告出力
- **Priority**: must
- **Source**: request.md 受け入れ基準 / delta-spec Scenario 1

**GIVEN** 有効な job slug が存在する  
**WHEN** `specrunner job resume <slug> --prompt "任意のテキスト"` を実行する  
**THEN** stderr に「--prompt の内容は agent prompt に直接注入」を含む文字列が出力される

---

## TC-02: --prompt-file 指定時に警告が stderr に表示される

- **Category**: 警告出力
- **Priority**: must
- **Source**: request.md 受け入れ基準 / delta-spec Scenario 2

**GIVEN** 有効な job slug が存在し、`./notes.md` ファイルが存在する  
**WHEN** `specrunner job resume <slug> --prompt-file ./notes.md` を実行する  
**THEN** stderr に「--prompt の内容は agent prompt に直接注入」を含む文字列が出力される

---

## TC-03: --quiet モードでも警告が表示される

- **Category**: 警告出力（ログレベル非依存）
- **Priority**: must
- **Source**: request.md 受け入れ基準 / design.md stderrWrite 選択理由 / delta-spec Scenario 3

**GIVEN** 有効な job slug が存在する  
**WHEN** `specrunner job resume <slug> --prompt "text" --quiet` を実行する  
**THEN** stderr に警告メッセージが出力される（`--quiet` によって抑制されない）

---

## TC-04: --prompt 未指定時は警告が表示されない

- **Category**: 警告出力（否定ケース）
- **Priority**: must
- **Source**: request.md 受け入れ基準 / delta-spec Scenario 4

**GIVEN** 有効な job slug が存在する  
**WHEN** `specrunner job resume <slug>` を `--prompt` / `--prompt-file` なしで実行する  
**THEN** stderr に「--prompt の内容は agent prompt に直接注入」を含む文字列は出力されない

---

## TC-05: 警告は stdout ではなく stderr に出力される

- **Category**: 出力先
- **Priority**: must
- **Source**: design.md 「stderrWrite() を使う理由」

**GIVEN** 有効な job slug が存在する  
**WHEN** `specrunner job resume <slug> --prompt "text"` を実行する  
**THEN** 警告メッセージは stdout には出力されない  
**AND** stderr に出力される

---

## TC-06: 警告後も resume 処理が正常に続行する

- **Category**: 処理継続性
- **Priority**: should
- **Source**: delta-spec Scenario 1 "AND resume 処理は警告後も正常に続行する"

**GIVEN** 有効な job slug が存在する  
**WHEN** `specrunner job resume <slug> --prompt "任意のテキスト"` を実行する  
**THEN** stderr に警告が出力される  
**AND** その後 resume 処理が中断せずに続行される（警告によって exit しない）

---

## TC-07: --prompt と --prompt-file の両方が指定された場合の警告

- **Category**: 警告出力（エッジケース）
- **Priority**: could
- **Source**: tasks.md T3 / command-registry.ts の resolvedPrompt 解決ロジック

**GIVEN** 有効な job slug が存在し、`./notes.md` ファイルが存在する  
**WHEN** `specrunner job resume <slug> --prompt "text" --prompt-file ./notes.md` を実行する（CLI がエラーにしない前提）  
**THEN** stderr に警告メッセージが出力される

---

## TC-08: 空文字列の --prompt でも警告が表示される

- **Category**: 警告出力（エッジケース）
- **Priority**: could
- **Source**: design.md「resolvedPrompt !== undefined の場合に出力」

**GIVEN** 有効な job slug が存在する  
**WHEN** `specrunner job resume <slug> --prompt ""` を実行する  
**THEN** `resolvedPrompt` が空文字列（`undefined` ではない）なら警告が出力される  
**OR** CLI がエラーを返す場合は警告なしでエラーメッセージが表示される

---

## TC-09: 警告メッセージの内容が仕様通りであること

- **Category**: 警告メッセージ内容
- **Priority**: should
- **Source**: design.md 実装コード例 / request.md 受け入れ基準

**GIVEN** 有効な job slug が存在する  
**WHEN** `specrunner job resume <slug> --prompt "text"` を実行する  
**THEN** stderr の警告メッセージが `Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください。` と一致する
