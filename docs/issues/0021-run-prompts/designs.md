# Designs

対話できるかどうかは 0019 の `OutputMode.interactive` で決まる。どの案も、入力欄の描画は printer（0022）に `prompt` の表示として渡し、キー入力の読み取りは `node:readline` で自前に書く。

## A. ロガーに対話メソッドを足す（明示的に失敗）

`logger` に @clack/prompts と同じ形の入力メソッドを持たせる（API の形だけを借り、依存はしない）。対話できなければ常にエラーにする。

```ts
interface Prompter {
  select<T extends string>(options: {
    message: string;
    options: readonly { value: T; label?: string; hint?: string }[];
    initialValue?: T;
  }): Promise<T>;
  confirm(options: { message: string; initialValue?: boolean }): Promise<boolean>;
  text(options: {
    message: string;
    placeholder?: string;
    validate?(value: string): string | undefined;
  }): Promise<string>;
}

interface CommandContext<S> {
  logger: Logger & Prompter;
}

class HackshPromptError extends Error {
  readonly reason: "non-interactive" | "cancelled";
  readonly prompt: {
    kind: "select" | "confirm" | "text";
    message: string;
    choices?: readonly string[];
  };
}
```

- 利点: 対話できない環境で何が必要だったかが、JSON のエラーとして必ず残る。
- 欠点: CI でも使うコマンドは、作者が自分で引数と対話を分岐させる必要がある。

## B. 引数の補完として対話する（スキーマ駆動）

未指定の引数を対話で埋める。選択肢や説明は Zod スキーマ（`z.enum`、`.describe()`）から作る。対話できない環境では、通常の検証エラーになる。

```ts
const main = defineCommand({
  args: z.object({
    env: z.enum(["staging", "prod"]).describe("Target environment"),
    yes: z.boolean().default(false).describe("Skip confirmation"),
  }),
  argOptions: { env: { prompt: true } }, // 未指定なら select で尋ねる
  async run({ args, prompt }) {
    if (!args.yes && !(await prompt.confirm({ message: `Deploy to ${args.env}?` }))) return;
  },
});
```

- 利点: 対話と引数指定が同じ値に揃い、AI エージェントは `--env prod` と書けば対話を避けられる。失敗の形は既存の `ZittyValidationError` と同じ。
- 欠点: 解析と検証の流れに対話が入り、`parseCommandArgs` の責務が広がる。

## C. 既定値で続行する

対話できない環境では `initialValue` を使い、なければ A と同じエラーにする。取り消しは clack と同じく特別な値で返す。

```ts
const cancelled: unique symbol;

interface Prompter {
  select<T extends string>(options: SelectOptions<T>): Promise<T | typeof cancelled>;
}

const env = await prompt.select({ message: "Environment", options, initialValue: "staging" });
if (env === cancelled) return;
```

- 利点: 既定値のある質問は CI でも止まらずに進む。
- 欠点: 対話できない環境で暗黙に値が選ばれ、`ai-native` の「別の挙動へ流さない」と衝突しうる。取り消しの確認を毎回書く必要がある。
