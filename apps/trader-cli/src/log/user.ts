import chalk from "chalk";

export const user = {
  title: (t: string) => console.log(chalk.bold.green(`\n${t}`)),

  section: (t: string) => console.log(chalk.cyan(`\n${t}`)),

  line: (t: string) => console.log(`  ${t}`),

  say: (t: string) => console.log(t),

  /** 覆盖当前终端行，用于 Thinking 实时展示 */
  thinkingLine: (text: string) => {
    process.stdout.write(`\x1b[2K\r${text}`);
  },

  clearThinkingLine: () => {
    process.stdout.write("\x1b[2K\r");
  },

  json: (label: string, data: unknown) => {
    console.log(chalk.cyan(`\n${label}`));
    console.log(JSON.stringify(data, null, 2));
  },

  warn: (msg: string) => console.error(chalk.yellow(msg)),

  die: (msg: string): never => {
    console.error(chalk.red(msg));
    process.exit(1);
  },
};
