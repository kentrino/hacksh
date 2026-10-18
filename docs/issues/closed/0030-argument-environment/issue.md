---
title: 名前付きオプションを環境変数から指定できない
theme: reliable-invocation
---

# Problem

名前付きオプションは CLI 引数からしか受け取れない。CI の認証情報や接続先を環境変数で渡したい CLI は、`process.env` の読み取り、CLI 引数との優先順位、文字列からの変換、ヘルプへの記載をコマンドごとに実装している。その値は `args` の Zod スキーマを通らず、不正値のエラーも hacksh の形式にならない。

解決後は、名前付きオプションを定義するだけで、コマンドの経路から決まる環境変数（`mycli deploy --dry-run` なら `MYCLI_DEPLOY_DRY_RUN`）でも指定でき、`argOptions` で変数名の変更や無効化ができる。値は CLI 引数と同じスキーマで検証され、ヘルプに変数名が示される。

[Design](./design-a.md)

# Rules

- CLI 引数 > 環境変数 > スキーマの既定値の順に解決する。`--no-x` などの明示的な false も CLI 引数として扱う。
- 環境は呼び出しごとに注入でき、既定は `process.env` とする。`process.env` を書き換えない。
- 不正な環境変数の値を既定値で隠さず、変数名を示す検証エラーにして `run` を呼ばない。
- 1つの経路で同じ環境変数名が複数のオプションに対応する定義は、推測で選ばずエラーにする。
- 環境変数の値をヘルプ・機械可読定義・hacksh が組み立てるエラーに含めない。
- dotenv の自動読込、設定ファイル探索、多層設定のマージは含めない。

# Acceptance Criteria

- ルートとサブコマンド（入れ子を含む）のオプションが、規約どおりの変数名で指定できる。
- CLI 引数・環境変数・既定値の優先順位、未設定と空文字の違い、boolean の変換をテストする。
- `argOptions` の変数名の指定と無効化、名前の衝突のエラーをテストする。
- ヘルプと `UsageSummary` が、実際に読まれる変数名を示す。
- 親子のコマンドと並行する呼び出しで、注入した環境が混ざらない。

# Related Files

- `src/command.ts` — `ArgOptions` と `defineCommand` の検査
- `src/parser.ts` — CLI 引数から Zod への入力の組み立て
- `src/run.ts` — `resolveCommand` の経路解決と `env` オプション
- `src/printer.ts` — 既存の `HACKSH_OUTPUT` の読み取り
- `src/usage.ts` — `summarizeUsage` と OPTIONS の表示
- `src/options.ts` — `kebabCase`
- `docs/issues/open/0007-structured-named-options/issue.md` — 配列オプションの CLI 表現
- `docs/issues/open/0008-machine-readable-definition/issue.md`
