propose-session delta spec から RENAMED ブロックを全削除する :: FROM = TO の no-op rename が openspec validate error の唯一の原因。実際の rename は発生していないため不要
step-execution-architecture delta spec に CodeReviewStep / CodeFixerStep の MODIFIED Requirements を追加する :: 既存 Requirement の model リテラル値 (`claude-sonnet-4-5`) を opusplan パターンに合わせて更新。CodeReviewStep → `claude-opus-4-6[1m]`、CodeFixerStep → `claude-sonnet-4-6`。Scenario のリテラル値も同期
MEDIUM finding #3（buildProposeMessage / buildInitialMessage 名称不統一）は修正しない :: main spec 側の名称変更は本 request のスコープ外。実装時にコード側の名称に合わせて tasks.md で指示すれば十分
MEDIUM finding #4（openspec CLI 解決方法の design decision 昇格）は修正しない :: propose agent の system prompt で具体的なコマンド名を指示すれば十分。npx vs PATH の切り替えは実装時の判断で対応可能
