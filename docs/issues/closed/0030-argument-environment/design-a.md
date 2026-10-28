# Design A: コマンド経路から環境変数名を決める

推奨案。名前付きオプションごとに、コマンドの経路とオプション名から環境変数名を1つ決める。スキーマの `.meta({ env })` で名前の差し替えと無効化ができる。

## Example

```ts
const deploy = defineCommand({
  args: z.object({
    target: z.string(),
    dryRun: z.boolean().default(false),
    token: z.string().meta({ env: "GITHUB_TOKEN" }),
    debug: z.boolean().optional().meta({ env: false }),
  }),
  run({ args }) {},
});

const main = defineCommand({
  name: "my-cli",
  args: z.object({ verbose: z.boolean().default(false) }),
  subCommands: { deploy },
});

await runMain(main);
```

| 入力                                                                  | 結果                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `MY_CLI_DEPLOY_TARGET=prod GITHUB_TOKEN=t my-cli deploy`              | `target: "prod"`, `token: "t"`                                              |
| `MY_CLI_DEPLOY_TARGET=prod GITHUB_TOKEN=t my-cli deploy --target=stg` | CLI 引数が優先され `target: "stg"`                                          |
| `MY_CLI_DEPLOY_DRY_RUN=true ... my-cli deploy --no-dry-run`           | `dryRun: false`                                                             |
| `MY_CLI_DEPLOY_DRY_RUN=yes ... my-cli deploy`                         | `MY_CLI_DEPLOY_DRY_RUN: expects true or false` で終了し、`run` は呼ばれない |
| `MY_CLI_DEPLOY_TOKEN=t ...`                                           | 読まれない。`token` の変数名は `GITHUB_TOKEN` に差し替えられている          |
| `MY_CLI_DEPLOY_DEBUG=true ...`                                        | 読まれない。`debug` は無効化されている                                      |
| `MY_CLI_VERBOSE=true my-cli deploy ...`                               | ルートの `verbose` が `true` として検証される                               |

ヘルプは既存の `(Required)`・`(Default: ...)` と同じ形で変数名を示す。

```text
OPTIONS

  --target=<target>  (Required) (Env: MY_CLI_DEPLOY_TARGET)
  --[no-]dry-run  (Default: false) (Env: MY_CLI_DEPLOY_DRY_RUN)
  --token=<token>  (Required) (Env: GITHUB_TOKEN)
  --[no-]debug
```

テストやライブラリ実行では、既存の `env` オプションで環境を注入する。`HACKSH_OUTPUT` の判定と同じ値を使う。

```ts
await runCommand(main, ["deploy"], {
  env: { MY_CLI_DEPLOY_TARGET: "prod", GITHUB_TOKEN: "t" },
});
```

## 命名規則

- 変数名は経路の各要素を大文字の snake case にして `_` で連結する。ルートは `name`、サブコマンドは `subCommands` のキー、最後がオプションのキーである。
- 変換は既存の `kebabCase` の後に英数字以外を `_` に置き換え、大文字にする。`my-cli` は `MY_CLI`、`dryRun` は `DRY_RUN`、`s3Bucket` は `S3_BUCKET` になる。
- サブコマンドは `child.name` ではなく `subCommands` のキー、つまり利用者が入力する名前を使う。現在の `namedChild` は `child.name` を優先するので、両者が異なる場合に表示名と変数名がずれる。別名（0002）を導入しても変数名は正規名から作る。
- ルートに `name` がなければ自動の変数名を作らない。プレフィックスなしの `TARGET` や `PATH` のような名前を読むと、無関係な環境変数でオプションが変わるためである。スキーマの `.meta({ env })` で明示した名前は読む。
- スキーマの `.meta({ env })` に文字列を書くと、自動の名前を置き換える。追加ではないので、1つのオプションに対応する変数は常に1つである。`false` を書くと無効化する。

## 元の方針からの変更

元の issue は「スキーマキーから環境変数名を自動推測しない」としていた。意図しない環境変数でオプションが変わる危険を避けるためである。この案では、変数名をルートの `name` で名前空間に入れ、ヘルプに必ず表示し、`env: false` で個別に外せるようにして、その危険を抑える。定義したオプションがそのまま環境変数でも使えるという利用側の利点を優先する。

## データの流れ

1. `resolveCommand` が経路を辿るとき、各セグメントに経路（`["my-cli", "deploy"]`）を持たせる。現在 `namedChild` で名前を補っている位置と同じである。
2. セグメントごとに、オプションのキーから変数名への対応 `ReadonlyMap<string, string>` を作る。同じ経路のセグメント間で同じ変数名が現れたら、定義エラーの `TypeError` にする。例えばルートの `deployTarget` と `deploy` の `target` はどちらも `MY_CLI_DEPLOY_TARGET` になる。セグメント内の衝突（`dry-run` と `dryRun` など）も同じエラーにする。
3. `parseCommandArgs` は CLI のトークンから入力を組み立てた後、CLI で値が決まらなかったキーについて、注入された環境から値を読む。値を読んだキーには入力源として変数名を記録する。
4. Zod の検証エラーと変換エラーでは、入力源が環境変数のキーについて `arg` を `--target` ではなく `MY_CLI_DEPLOY_TARGET` にする。
5. `summarizeUsage` は同じ対応から `UsageOptionSummary.env` を埋め、テキストのヘルプは `(Env: ...)` を出す。

経路はコマンド定義ではなく呼び出しから決まるので、手順 1 で作った対応をヘルプ表示と `HackshUsageError` の usage 表示まで運ぶ必要がある。`resolveCommand` が作る子の定義に内部の WeakMap で経路を結び付けるか、`summarizeUsage` に経路を渡す引数を追加する。単独で `renderUsage(deploy)` を呼んだ場合は、`deploy` をルートとして扱う。

## 値の変換

- 値を取るオプションには、文字列をそのまま渡す。数値などへの変換は CLI 引数と同じく Zod スキーマ（`z.coerce.number()` など）が行う。
- boolean のオプションは、CLI の `--flag=true|false` と同じく `true` と `false` だけを受け付ける。それ以外は `expects true or false` の検証エラーにする。
- 空文字は設定済みとして扱う。値を取るオプションでは `--name=` と同じく `""` を Zod に渡し、boolean では検証エラーにする。未設定（`undefined`）だけが既定値へ進む。
- 配列やオブジェクトのオプションは、CLI 上の表現が 0007 で決まるまで自動の変数名を作らない。スキーマの `.meta({ env })` を指定した場合は `defineCommand` が `TypeError` にする。
- 位置引数とパススルー引数は対象外である。

## 秘匿

hacksh はヘルプ・`UsageSummary`・自分で組み立てるエラー（`expects true or false` など）に変数名だけを含め、値を含めない。zod 4.6.7 の標準メッセージは入力値を含まない（`z.coerce.number()`・`z.enum()`・`z.string().min()` の不正値で確認済み）。作者が `refine` などで値を含むメッセージを書いた場合は作者の責任とし、hacksh は加工しない。機密項目を宣言する `secret` メタデータ は、この契約で足りない事例が出るまで作らない。

## 互換性

追加の機能だが、既存の CLI で `name` を持つものは、環境変数を読み始める。`MY_CLI_VERBOSE` のような名前を別の用途で使っていた環境では動作が変わる。リリースノートで明示する。

## 比較: 明示した項目だけを読む案

元の issue の方針で、スキーマの `.meta({ env })` に名前を書いたオプションだけを環境変数から読む。

- 利点: 定義を読めば読む変数がすべて分かる。既存の CLI の動作は変わらない。衝突の検査も単純になる。
- 欠点: 環境変数で指定したいオプションごとに名前を書く必要がある。名前の付け方が CLI ごとにばらつき、今回の要望である「オプションを定義すれば環境変数でも指定できる」を満たさない。

Design A でも `env: false` と名前の差し替えにより、この案と同じ定義を書ける。逆はできないので、A を採用する。

## 検証

- `src/parser.test.ts` と `src/run.test.ts` で、Example の表の各行と、入れ子のサブコマンド・衝突・空文字を確かめる。
- `src/usage.ts` のテストで、ヘルプの `(Env: ...)` と `UsageSummary.env` を確かめる。
- 並行する `runCommand` に異なる `env` を渡し、結果が混ざらないことを確かめる。
- verify-hacksh の手順で利用側の CLI を作り、実際のプロセスに環境変数を与えて、終了コード・標準出力・標準エラーを確かめる。

## 決定事項

- 経路は内部の WeakMap でコマンド定義に結び付ける。`resolveCommand` は子の定義を呼び出しごとに複製して経路を登録するので、同じ子を複数の親で使っても、並行する呼び出しでも混ざらない。`summarizeUsage` などの公開シグネチャは変えない。0008 でツリー全体を出すときは、同じ経路の計算を使う。
- 衝突は呼び出し時に、解決した経路の全セグメントについて検査する。0004 の遅延定義と両立させるためである。呼ばれない経路の衝突は、その経路を呼ぶまで見つからない。
- boolean は `true` と `false` だけを受け付ける。CLI の `--flag=true|false` と同じ規則にするためである。
- `envPrefix` は作らない。ルートの `name` を変えると変数名も変わる。
- 先頭が数字になる名前もそのまま読む。シェルで `export` できない名前になる場合は、スキーマの `.meta({ env })` で差し替える。
- 1つのオプションに対応する変数名は1つに限る。
- `parseArgs` は第3引数の `env` を渡したときだけ環境変数を読み、ルート名に `command.name` を使う。
