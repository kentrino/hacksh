# zitty: zod で引数を定義する CLI フレームワーク

zitty は、引数を [zod](https://zod.dev/) 4 の `z.object` で定義する CLI フレームワーク。1 つのスキーマから、引数のパース、バリデーション、`run` に渡す値の型推論、ヘルプ生成を行う。

最初のリリースは機能を絞る。`/Users/dev/misc/chezmoi/dot_local/bin` 以下の CLI スクリプトを zitty で書けることを目標にし、それに必要な機能だけを実装する。

## 方針

- **zod 4 に依存する**。Standard Schema だけではスキーマの中身を調べられず、値を取るオプションかフラグか、必須かどうかを読み取れないため。
- **引数は `z.object` で定義する**。名前付きオプションは各キー、positional はキー `_` で表す。
- **positional は 1 つだけ認める**。chezmoi のスクリプトはどれも positional が 0 か 1 個。2 個目以降の位置引数は `rawArgs` から読む。
- **alias は `defineCommand` の `alias` オプションで指定する**。zod の meta や registry には載せない。キーは `args` のスキーマのキーで型チェックする。
- **スキーマから読み取る情報は 4 つに限る**。値を取るか（`z.boolean()` か、それ以外か）、必須かどうか、デフォルト値、説明文。zod の内部構造に依存する箇所を、この読み取り層に閉じ込める。

## API のイメージ

```ts
import { z } from "zod";
import { defineCommand, runMain } from "zitty";

const main = defineCommand({
  meta: {
    name: "gh-pr-commits",
    version: "0.0.1",
    description: "List commits in a GitHub pull request",
  },
  args: z.object({
    _: z.coerce
      .number()
      .int()
      .optional()
      .describe("Pull request number (defaults to PR for current branch)"),
    repo: z.string().optional().describe("Repository in OWNER/REPO format"),
  }),
  alias: { repo: "R" },
  async run({ args, rawArgs }) {
    args._; // number | undefined
    args.repo; // string | undefined
  },
});

runMain(main);
```

`run` が受け取る `args` の型は `z.output<typeof schema>`。

### スキーマからの読み取り規則

各キーのスキーマについて、`optional` / `default` / `nullable` / `pipe` などのラッパーを剥がしながら次の情報を集める。

| 読み取る情報 | 規則                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| 値を取るか   | 中身が `z.boolean()` ならフラグ（値を取らない）。それ以外は値を取るオプションとして扱う   |
| 必須かどうか | `optional` / `default` が付いていなければ必須（ヘルプの `(Required)` 表示に使う）         |
| デフォルト値 | `default` の値（ヘルプの `(Default: x)` 表示に使う）                                      |
| 説明文       | `.describe()` / `.meta({ description })` の値。ラッパーの外側と内側のどちらに付いても拾う |

実際の必須チェックとデフォルト値の適用は zod に任せる。パーサは CLI の文字列を `string | boolean | undefined` に変換するだけで、数値などへの変換はスキーマ側（`z.coerce.number()` など）で行う。

## 機能一覧

CLI フレームワークとして考えられる機能の候補。チェックは、chezmoi のスクリプトを書くのに必要な機能（最初のリリースの対象）。「暗黙」は、コード上の記述はないが利用者の操作や挙動として必要になる機能。

調べたのは、chezmoi の CLI ライブラリを使っている 17 本のスクリプト。

`c`, `cdx`, `cp-preserve-directory`, `create-branch`, `externalize-kentrino`, `falsify`, `g-auth`, `gcm`, `gh-pr-commits`, `gh-transfer-repos`, `git-worktree`, `kenpoch`, `npm-workspace-packages`, `rebase`, `safe-rm`, `sanitize-branch`, `apply-timestamp-to-dirname`

`node:util` の `parseArgs` を直接使うスクリプト（`move-files`, `clean-empty-directory` など）は対象外とする。

### API

- [x] `defineCommand`: コマンドを定義する
- [x] `runMain`: `process.argv` からコマンドを実行し、ヘルプとエラーを処理して終了する
- [x] `runCommand`: 引数の配列を渡してコマンドを実行する。`git-worktree` が、対話選択したサブコマンドを引数なしで実行するのに使う
- [ ] `runMain` への引数配列の注入と、ヘルプ表示関数の差し替え
- [ ] `createMain`: `runMain` を呼ぶ関数を作る
- [ ] `runCommand` に任意のデータを渡す、`run` の戻り値を受け取る
- [ ] `parseArgs` の単体公開
- [ ] `renderUsage` / `showUsage` の単体公開
- [ ] `definePlugin`: 複数のコマンドで共有する前処理と後処理

### コマンド定義

- [x] `meta.name` / `meta.version` / `meta.description`: `cdx` は複数行の説明文を持つ
- [ ] `meta.hidden`: ヘルプに出さないサブコマンド
- [ ] `meta.alias`: サブコマンドの別名
- [x] 静的な `subCommands`: `git-worktree`
- [ ] `subCommands` の遅延読み込み
- [ ] `meta` / `args` / `subCommands` を関数や Promise で渡す
- [ ] デフォルトのサブコマンド
- [x] `run`
- [ ] `setup` / `cleanup`
- [x] サブコマンドがないときの親の `run` 実行（暗黙）: `git-worktree` は、サブコマンドなしで起動されると対話メニューを出す
- [x] サブコマンドを実行したら親の `run` を呼ばない: `git-worktree` は親の `run` の先頭で、サブコマンドが実行済みなら何もせず抜けようとしている

### `run` のコンテキスト

- [x] `args`
- [x] `rawArgs`: `cdx` は `--` 以降と未知の引数を Codex に渡すために使う
- [ ] `cmd`（実行中のコマンド定義）
- [ ] 任意のデータ

### 引数

- [x] 値を取る名前付きオプション
- [x] フラグ（boolean）
- [x] positional（1 個）
- [ ] 複数の positional、可変長の positional
- [ ] 列挙値のオプションと、ヘルプへの選択肢の表示
- [x] 説明文、必須、デフォルト値
- [x] 1 文字の alias: `-a`, `-b`, `-p`, `-R`
- [ ] 複数の alias
- [ ] ヘルプでの値の表示名（`--name=<host>`）
- [ ] 否定フラグの説明文

### パース

- [x] `--no-<name>` によるフラグの否定: `sanitize-branch` の `remove-empty` / `remove-coauthor` は既定で有効で、無効にするには `--no-` を付ける
- [x] kebab-case での指定: `create-branch` / `rebase` はキー `dryRun` を `--dry-run` で受け付ける。`sanitize-branch` はキー `"remove-empty"` を `args.removeEmpty` で読む
- [x] パース結果への代入: `git-worktree` が `args.name = name` と書き換える
- [x] 未知のオプションを許容する（暗黙）: `cdx` が `rawArgs` から拾って Codex に渡す
- [x] `--` 以降を `rawArgs` にそのまま残す: `cdx`
- [ ] `--name=value` 形式（`node:util` の `parseArgs` で自然に対応できる）
- [ ] フラグの `--flag=false` を `false` として扱う
- [ ] 値を取るオプションに値がないとき `""` にする

### ヘルプとエラー

- [x] 組み込みの `--help` / `-h`（暗黙）
- [x] 組み込みの `--version` / `-v`（暗黙、ほとんどのスクリプトに `meta.version` がある）
- [x] ヘルプの自動生成（暗黙）
- [ ] サブコマンドの一覧と、`<command> --help`: `git-worktree` で暗黙に使う可能性がある
- [x] 検証エラーのときに usage を表示して exit 1（暗黙）
- [ ] 未知のサブコマンドのエラー
- [ ] `NO_COLOR` / `CI` による色の無効化

## 最初のリリースの範囲

- `defineCommand` / `runMain` / `runCommand`
- `meta`（`name` / `version` / `description`）。値だけを受け付ける
- 静的な `subCommands`。サブコマンドがなければ親の `run` を実行し、あれば親の `run` は呼ばない
- `run({ args, rawArgs })`。`args` は `z.output` の型
- `z.object` による引数定義。positional はキー `_`（1 個だけ）
- スキーマからの読み取り（値を取るか、必須、デフォルト値、説明文）
- `defineCommand` の `alias`（1 文字）
- `--no-` によるフラグの否定、kebab-case での指定、未知オプションの許容、`--` の扱い
- `--help` / `--version`、ヘルプ生成
- zod の検証エラーを引数名に対応付けて表示し、usage を表示して exit 1

対象外: 列挙値の選択肢表示（`z.enum` は値を取るオプションとして検証だけ効く）, `setup` / `cleanup` / `definePlugin`, 遅延読み込み, デフォルトのサブコマンド, `meta.alias` / `meta.hidden`, 値の表示名と否定フラグの説明文, `createMain` / `parseArgs` / `renderUsage` / `showUsage` の公開, 任意データと戻り値, 配列やオブジェクトを値に持つオプション

## 未決事項

それぞれ推奨案を書いておく。

### camelCase / kebab-case の扱い

chezmoi には、camelCase のキーを kebab-case で指定するケース（`create-branch` / `rebase`）と、kebab-case のキーを camelCase で読むケース（`sanitize-branch`）の両方がある。

推奨: CLI 側では、スキーマのキーそのものと kebab-case の両方を受け付ける（キー `dryRun` なら `--dryRun` と `--dry-run`）。`args` はスキーマのキーだけで読み、Proxy などで別名を生やさない。型と実体を一致させるためで、`sanitize-branch` はキーを `removeEmpty` にすれば済む。

### `no` で始まるキーと否定の衝突

`--no-<name>` を否定として扱うと、`no-focus` のような名前のフラグとの区別がつかない。`--no-focus` が「`no-focus` を有効にする」のか「`focus` を無効にする」のかが曖昧になる。chezmoi の `cdx` は `no-focus` というフラグを定義している。

推奨: `/^no[-A-Z]/` に当たるキーは `defineCommand` の時点でエラーにする。`cdx` は `focus: z.boolean().default(true)` にして、`--no-focus` で無効にする。

### positional のヘルプでの表示名

キーが `_` なので、ヘルプに `<PR>` のような名前を出せない。

推奨: 最初は `<ARG>` 固定にする。必要になったら `defineCommand` に表示名のオプションを足す（alias と同じく zod の外に置く）。

### `_` に使えるスキーマ

positional の値は常に文字列なので、`_` の中身が `z.boolean()` だと意味をなさない。

推奨: `_` の中身が `z.boolean()` なら `defineCommand` の時点でエラーにする。それ以外は値を取るオプションと同じ扱いにする。

### `runMain` のエラー処理

chezmoi の複数のスクリプトは `runMain(main).catch(...)` で独自のエラー表示をしようとしている。`runMain` がエラーを処理して終了する設計だと、この `catch` には到達しない。

推奨: `runMain` は検証エラー（usage を出すもの）だけを処理し、それ以外の例外は `Error: <message>` を表示して exit 1 にする。独自の表示が必要なら `runCommand` を使ってもらう。

### zod と zod/mini の両対応

zod 4 には、通常の `zod` と、メソッドチェーンを使わない `zod/mini` がある。読み取り層を `zod/v4/core` の共通構造（`_zod.def`）だけで書けば両方で動く。ただし `.describe()` の説明文は `globalRegistry` に入るため、zod が二重にインストールされていると読めない可能性がある。

推奨: 読み取り層は `zod/v4/core` だけに依存させる。`zod` は peerDependency（`^4`）にする。

## 気になるところ

- **ラッパーの剥がし方**: `optional` / `default` / `nullable` / `pipe`（`transform` を含む）/ `catch` などを剥がして中身を判定する。`z.union([z.boolean(), z.string()])` のように判定できない形は、値を取るオプションとして扱う。対応表はテストで固める。
- **バリデーションは非同期にする**: `refine` に async 関数を使えるように、`safeParseAsync` で検証する。
- **エラーの表示**: zod の issue の `path[0]` を `--repo` や `<ARG>` に対応付けて表示する。issue が複数あるときは全部表示する。
- **未知のキー**: `z.object` は定義にないキーを出力から落とすので、未知オプションを許容しても `args` には入らない。残りの引数が必要なら `rawArgs` から読む。
- **パース結果への代入**: `args` は zod の出力をそのまま渡すので、書き換えはできる。readonly にはしない。
- **`process.exit` とテストのしやすさ**: `process.exit` は `runMain` の最外周だけに置き、`runCommand` は例外を投げるだけにしてテストの対象にする。
- **実行環境**: chezmoi のスクリプトは Deno から `npm:` 指定で読み込む。ESM と `node:util` だけで動くようにしておく。

## 進め方

1. 未決事項を確定する
2. スキーマの読み取り層（ラッパーの剥がしと 4 つの情報の取得）を実装し、zod と zod/mini の両方でテストする
3. パーサ（`node:util` の `parseArgs` ベース、kebab-case、`--no-`、alias）と、`safeParseAsync` による検証、エラー表示を実装する
4. `defineCommand` / `runCommand` / `runMain`、サブコマンド、ヘルプ生成を実装する
5. chezmoi の `sanitize-branch`, `cdx`, `git-worktree`, `gh-pr-commits` 相当のケースをテストにする

# Features

各機能のキーインターフェース。型は設計段階の案で、`S` は引数の `z.object` スキーマを表す。最初のリリースの対象外の機能には「対象外」と付けている。

## defineCommand

```ts
import type { $ZodObject, output } from "zod/v4/core";

type ArgsSchema = $ZodObject;

interface CommandDef<S extends ArgsSchema = ArgsSchema> {
  meta?: CommandMeta;
  args?: S;
  alias?: AliasMap<S>;
  subCommands?: Record<string, CommandDef<any>>;
  run?: (context: CommandContext<S>) => unknown | Promise<unknown>;
}

declare function defineCommand<S extends ArgsSchema>(def: CommandDef<S>): CommandDef<S>;
```

## meta

```ts
interface CommandMeta {
  name?: string;
  version?: string;
  description?: string;
}
```

## 引数の定義（名前付きオプション）

```ts
defineCommand({
  args: z.object({
    target: z.string().describe("Target directory"),
    prefix: z.string().default("").describe("Prefix to add to the directory name"),
    depth: z.coerce.number().int().optional(),
  }),
});
```

```ts
type CommandArgs<S extends ArgsSchema> = output<S>;
```

## フラグと否定

```ts
args: z.object({
  execute: z.boolean().default(false).describe("Execute the changes"),
  removeEmpty: z.boolean().default(true).describe("Remove empty commits"),
});
```

```sh
cmd --execute
cmd --no-remove-empty
```

## positional

```ts
args: z.object({
  _: z.string().describe("The commit message"),
});
```

```sh
cmd "fix: typo"   # args._ === "fix: typo"
```

## 必須・デフォルト値・説明文

```ts
z.string(); // 必須
z.string().optional(); // 任意
z.string().default("."); // 任意、ヘルプに (Default: .)
z.string().describe("..."); // ヘルプの説明文
```

## alias

```ts
type AliasMap<S extends ArgsSchema> = Partial<Record<Exclude<keyof S["shape"], "_">, string>>;

defineCommand({
  args: z.object({ repo: z.string().optional() }),
  alias: { repo: "R" },
});
```

```sh
cmd -R owner/repo
```

## camelCase / kebab-case

```ts
args: z.object({ dryRun: z.boolean().default(false) });
```

```sh
cmd --dry-run   # args.dryRun === true
cmd --dryRun    # 同じ
```

## run のコンテキスト

```ts
interface CommandContext<S extends ArgsSchema> {
  args: output<S>;
  rawArgs: string[];
}
```

## rawArgs と `--`

```ts
defineCommand({
  args: z.object({ path: z.string().optional() }),
  run({ rawArgs }) {
    const extra = rawArgs.slice(rawArgs.indexOf("--") + 1);
  },
});
```

```sh
cdx --path . -- --model o3   # rawArgs === ["--path", ".", "--", "--model", "o3"]
```

## subCommands

```ts
const main = defineCommand({
  meta: { name: "git-worktree" },
  subCommands: { new: newCommand, select: selectCommand },
  async run() {
    // サブコマンドが指定されなかったときだけ呼ばれる
  },
});
```

## runMain

```ts
declare function runMain<S extends ArgsSchema>(cmd: CommandDef<S>): Promise<void>;
```

`process.argv.slice(2)` を引数として実行する。`--help` / `--version` を処理し、検証エラーなら usage を表示して exit 1 にする。

## runCommand

```ts
interface RunCommandOptions {
  rawArgs: string[];
}

declare function runCommand<S extends ArgsSchema>(
  cmd: CommandDef<S>,
  options: RunCommandOptions,
): Promise<void>;
```

`process.exit` を呼ばず、検証エラーは例外として投げる。

## ヘルプと version

```sh
cmd --help      # cmd -h
cmd --version   # cmd -v、meta.version を表示
```

```text
List commits in a GitHub pull request (gh-pr-commits v0.0.1)

USAGE gh-pr-commits [OPTIONS] [ARG]

ARGUMENTS

  ARG  Pull request number (defaults to PR for current branch)

OPTIONS

  -R, --repo=<repo>  Repository in OWNER/REPO format
```

## 検証エラー

```ts
class ZittyValidationError extends Error {
  readonly issues: ReadonlyArray<{ arg: string; message: string }>;
}
```

```text
Invalid arguments:
  --repo: Invalid string: must match pattern /^[^/]+\/[^/]+$/
```

## setup / cleanup（対象外）

```ts
interface CommandDef<S extends ArgsSchema> {
  setup?: (context: CommandContext<S>) => unknown | Promise<unknown>;
  cleanup?: (context: CommandContext<S>) => unknown | Promise<unknown>;
}
```

## definePlugin（対象外）

```ts
interface Plugin {
  name: string;
  setup?: (context: CommandContext<any>) => void | Promise<void>;
  cleanup?: (context: CommandContext<any>) => void | Promise<void>;
}

declare function definePlugin(plugin: Plugin): Plugin;
```

## 遅延読み込み（対象外）

```ts
type Lazy<T> = T | Promise<T> | (() => T | Promise<T>);

subCommands: {
  sub: () => import("./sub.ts").then((m) => m.default),
}
```

## デフォルトのサブコマンド（対象外）

```ts
interface CommandDef<S extends ArgsSchema> {
  default?: string;
}
```

## サブコマンドの別名と非表示（対象外）

```ts
interface CommandMeta {
  alias?: string[];
  hidden?: boolean;
}
```

## 列挙値の選択肢表示（対象外）

```ts
args: z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
});
```

```text
--level=<debug|info|warn|error>
```

## createMain（対象外）

```ts
declare function createMain<S extends ArgsSchema>(cmd: CommandDef<S>): () => Promise<void>;
```

## parseArgs / renderUsage の公開（対象外）

```ts
declare function parseArgs<S extends ArgsSchema>(
  rawArgs: string[],
  cmd: CommandDef<S>,
): Promise<output<S>>;

declare function renderUsage<S extends ArgsSchema>(cmd: CommandDef<S>): string;
```
