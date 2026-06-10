import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const DEFAULT_CONTEXT_PACK_PATH = ".runtime/context/context_pack.md";

export async function writeContextPackFile(
  outputPath: string,
  markdown: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const absolutePath = resolve(cwd, outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, markdown, "utf8");
  return absolutePath;
}
