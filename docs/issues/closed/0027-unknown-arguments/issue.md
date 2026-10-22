---
title: 未知の引数を確認しなくても実行が進む
theme: reliable-invocation
---

# Problem

未知のオプションや余った位置引数は extraArgs に残るが、run が確認しなくても実行できる。--dry-rnu のような誤記は、期待したフラグが有効にならないまま副作用へ進む原因になる。

通常の CLI と引数転送用のラッパーで、未知の入力の扱いを明示できるようにする。

# Rules

- 拒否・保持の方針を明示する。通常の CLI では拒否を推奨し、既定値変更の互換性を検討する。
- -- 以降の passthrough と未知の入力を区別する。
- 候補は提示しても、自動補正・曖昧な省略一致で実行しない。
- 拒否は run と副作用のある setup より前に行う。

# Acceptance Criteria

- 未知の長短オプション、余剰位置引数、親子各段階の未知の入力を検証する。
- 拒否時に対象トークンを構造化エラーとして得られ、run が呼ばれない。
- 保持モードは順序を保ち、明示的な passthrough を壊さない。
- help/version と未知の入力が同時にある場合の優先順位を文書化する。

# Design

- `CommandDef.allowUnknownArgs?: boolean` を公開し、省略時は `false` とする。
- `true` は未知のオプションと余剰位置引数を元の順序で `extraArgs` に保持する。未知のオプションの直後の値は自動でその値と見なさず、位置引数スキーマに従う。
- 選択されたルートで親の設定を継承し、子で明示的に上書きできる。親の引数には親自身の設定を適用する。
- `--` 以降は設定によらず `passthrough` に保持する。
- 拒否時はスキーマ変換と `run` の前に `HackshValidationError` を送出し、`issues[].arg` に対象トークンを保持する。
- ルーティング成功後は help とルートの version が引数検証より優先する。未知のサブコマンドなどのルーティングエラーは引き続き失敗する。
- 従来 `extraArgs` を利用するコマンドは `allowUnknownArgs: true` を指定して移行する。

# Related Files

- `src/parser.ts`
- `src/run.ts`
- `docs/issues/open/0009-structured-cli-errors/issue.md`
