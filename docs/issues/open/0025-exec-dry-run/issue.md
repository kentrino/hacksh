---
title: 変更操作だけを省略する dry-run と実行結果の区別がない
theme: process-execution
---

# Problem

chezmoi のラッパーは dry-run でコマンドを表示し、exitCode 0 と空の stdout を持つ成功に似た結果を返している。呼び出し側は外部プロセスが成功したのか、起動されなかったのかを結果から確実に区別できない。

rebase や create-branch では状態取得を実行し、その結果で組み立てた変更操作だけを省略する必要がある。invocation 全体のプロセス実行を一律に止める方式では対応できない。

# Rules

- 0023 の実行 API に呼び出し単位の dry-run を用意する。特定の CLI フラグ名や context.args から暗黙に有効化しない。
- dry-run ではプロセスを起動せず、子へ入力を書かない。0024 と同じ表示経路で実行予定を記録する。
- 省略結果を実際の成功・失敗と型で区別し、架空の終了コードや出力を返さない。
- オプションの矛盾は dry-run でも検証する。省略時には実行ファイルや cwd の存在・実行成功を保証しない。
- dry-run はこの API による一回の実行を省略する機能であり、作者による他の副作用を防ぐ機能ではない。

# Acceptance Criteria

- 同じ run 内で状態取得を実行し、後続の変更操作だけを省略できる。
- 省略時に子を起動せず、対象ファイルを変更しないことを fixture で確認する。
- 省略結果では stdout や exitCode を成功結果として読み取れず、分岐が必要なことを型テストで確認する。
- pretty と JSON で実行予定と実行済みが区別でき、非対話環境でも実行予定を表示できる。
- dry-run と reject・input・端末指定の組み合わせを定義し、同じ状態を結果と表示で示す。

# Open Decisions

- 結果の判別子の名前と、dryRun が boolean 変数の場合の戻り値型。
- 省略時に不要な対話条件の検証をどこまで省くか。実際に起動する場合の制限は0024に従う。

# Related Files

- `docs/issues/closed/0023-context-exec/issue.md`
- `docs/issues/open/0024-exec-output/issue.md`
- `~/.local/share/chezmoi/dot_local/bin/lib/execa.ts`
- `~/.local/share/chezmoi/dot_local/bin/executable_create-branch`
