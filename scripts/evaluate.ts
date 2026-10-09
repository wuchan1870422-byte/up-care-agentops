import { mkdirSync, writeFileSync } from "node:fs";
import '../src/lib/db';
import { evaluate } from "../src/lib/evaluation";
const report = evaluate();
mkdirSync("output", { recursive: true });
writeFileSync("output/evaluation.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    total: report.total,
    passed: report.passed,
    durationMs: report.durationMs,
  }),
);
if (report.passed !== report.total) process.exitCode = 1;
