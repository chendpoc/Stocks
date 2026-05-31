import chalk from "chalk";

export function printJson(label: string, data: unknown) {
  console.log(chalk.cyan(`\n${label}`));
  console.log(JSON.stringify(data, null, 2));
}

export function printLines(title: string, lines: string[]) {
  console.log(chalk.bold.green(`\n${title}`));
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}
