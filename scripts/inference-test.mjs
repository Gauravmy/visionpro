// Runs the inference service's pytest suite with its virtualenv.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const serviceDir = path.resolve("inference");
const venvPython = process.platform === "win32" ? path.join(serviceDir, ".venv", "Scripts", "python.exe") : path.join(serviceDir, ".venv", "bin", "python");
const python = existsSync(venvPython) ? venvPython : "python";
const r = spawnSync(python, ["-m", "pytest", "-q"], { cwd: serviceDir, stdio: "inherit" });
process.exit(r.status ?? 1);
