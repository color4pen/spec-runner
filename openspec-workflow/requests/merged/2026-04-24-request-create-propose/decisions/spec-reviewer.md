# Spec-Reviewer Decisions — spec-review iteration 1

request.md の 8 要件と 6 受け入れ基準に対する delta spec の網羅性を検証する :: 全要件が何らかの spec にマッピングされていることを確認する必要がある

database/spec.md delta の欠落を blocking finding と判定する :: 既存 spec の CHECK 制約定義（sessions.role, requests テーブル構造）と delta spec の変更が整合しない状態は実装を阻害する

slug 導出アルゴリズムの未定義を MEDIUM と判定する :: design.md の Open Questions に記載はあるが spec レベルでの定義が欠落。title-to-kebab-case の具体的な変換ルール（特殊文字、長さ制限、重複時の挙動）が未定義

enabled バリデーション値の spec 定義と request.md の一致を確認する :: 両方とも `test-case-generator, adr, module-architect, security-reviewer, pattern-reviewer` で一致

propose-actions.ts の 'use server' 方針を確認する :: startPropose() は Server Action（認証コンテキスト必要）、getChangeFolderFiles/getChangeFolderFileContent も Server Action（所有権検証必要）として設計されるべき。この方針が spec に明記されていない

createRequest() の引数拡張方針を MEDIUM と判定する :: 既存 4 引数に 5 番目の位置引数追加は fragile。options object パターンへの移行を推奨するが、既存呼び出し元との互換性を考慮し severity を HIGH にはしない
