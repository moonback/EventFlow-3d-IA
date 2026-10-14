/** Journal du processus principal : terminal + userData/logs/main.log (rotation simple à 5 Mo). */
import fs from "node:fs";
import path from "node:path";

let file: string | null = null;

export function initLogger(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, "main.log");
  rotate(file);
}

export function rotate(target: string, maxBytes = 5 * 1024 * 1024) {
  try {
    if (fs.statSync(target).size > maxBytes) fs.renameSync(target, `${target}.1`);
  } catch {
    /* fichier absent */
  }
}

function write(level: string, args: unknown[]) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
  if (level === "error") console.error(line);
  else console.log(line);
  if (file) {
    try {
      fs.appendFileSync(file, line + "\n");
    } catch {
      /* disque plein ou droits : le terminal reste disponible */
    }
  }
}

export const log = {
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};
