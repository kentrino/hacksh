---
title: 環境変数からの引数補完を各 CLI が独自実装している
theme: reliable-invocation
---

# Problem

引数スキーマに対応する環境変数を宣言する仕組みがない。CI の認証情報や接続先を使う CLI は process.env の読み取り、優先順位、型変換を別々に実装する必要がある。

明示した項目だけを環境変数で補完し、同じスキーマで検証できるようにする。

# Rules

- CLI 指定 > 宣言された環境変数 > スキーマ既定値の順に解決する。明示的な false も CLI 指定として扱う。
- スキーマキーから環境変数名を自動推測しない。env を注入でき、process.env を書き換えない。
- 不正な env 値を既定値で隠さない。boolean・空文字・構造化値の変換を明示する。
- dotenv 自動読込、設定ファイル探索、多層設定マージは含めない。

# Acceptance Criteria

- CLI・env・defaultの優先順位と、未設定と空文字の違いをテストする。
- env の不正値を入力源が分かるエラーで示し、run を呼ばない。
- ヘルプ・機械可読定義に対応する変数名を示す。秘密値をhelpやエラーに露出しない契約を定義する。
- 親子コマンドと並行invocationでも注入した環境が混ざらない。

# Open Decisions

- env 宣言を argOptions とスキーマ metadata のどちらへ置くか。
- 機密項目の宣言と、Zod由来のエラーを含む値の秘匿範囲。

# Related Files

- `src/command.ts`
- `src/parser.ts`
- `src/usage.ts`
- `docs/issues/open/0008-machine-readable-definition/issue.md`
