---
title: 使用方法のエラーを安定した理由と対象で識別できない
theme: ai-native
---

# Current State

terminal-output の実装により、CLI でも JSON の error イベントを出力できる。kind は usage・validation などを区別し、検証エラーには引数名、Zod由来のcode・path・detailsがある。出力形式の選択と例外の構造化は既に実装済みである。

# Problem

Unknown command と No command specified はどちらも usage に分類され、失敗理由や入力されたコマンド名を識別する専用の項目がない。利用者はメッセージを解析するか、ライブラリ内部の形に依存して分岐する必要がある。

残課題は、新たな JSON 出力経路ではなく、エラーの安定した理由・対象・関連情報の契約である。

# Rules

- 既存の error イベントと summary を拡張し、別のエラー表示経路を作らない。
- 文言や Error.name で分岐せずに済む識別子を定義する。
- 内部の Zod スキーマや実行可能な command オブジェクトを公開 JSON に出さない。
- 0027の未知の引数、0030の環境変数入力と整合させる。入力の秘密値を不要に含めない。

# Acceptance Criteria

- 未知のコマンドとコマンド未指定を、message を解析せず区別できる。
- 失敗したコマンドパスや引数など、修正に必要な対象を構造化して参照できる。
- pretty と JSON が同じ原因を示し、既存の検証エラー情報を失わない。
- 安定性を保証する独自フィールドと、Zod由来の詳細の扱いを文書化する。

# Open Decisions

- 理由コードの名前、対象と候補を表す最小フィールド。
- 既存エラー型・コンストラクタとの互換性、終了コード0028との対応。

# Related Files

- `src/errors.ts` — エラー型と summarizeError
- `src/run.ts` — ルーティングとエラー表示
- `docs/issues/open/0027-unknown-arguments/issue.md`
- `docs/issues/open/0028-invocation-cancellation/issue.md`
- `docs/issues/open/0033-public-compatibility/issue.md`
