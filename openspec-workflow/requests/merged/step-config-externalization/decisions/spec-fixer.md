# Spec-Fixer Decisions — step-config-externalization (iteration 1)

## HIGH #1: steps config validation

cli-config-store delta に validation Requirement を追加する :: 既存 validateConfig() が pipeline.maxRetries で number/range check を行うパターンに合わせる。maxTurns は number (>=1) | null、model は non-empty string、timeoutMs は number (>=1) | null とする。0 は実用上無意味なため >=1 とする

## MEDIUM #2: managed runtime + steps

NOTE として managed runtime での挙動を明記する :: warning 出力ではなく NOTE レベルの明記を選択する。理由: managed runtime で steps を書くユーザーは稀であり、warning は noise になる。design.md D5 で明文化済みの方針を spec に降ろすだけで十分
