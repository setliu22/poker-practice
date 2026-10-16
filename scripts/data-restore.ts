import { parseArgs } from "node:util";
import { restoreDataBackup } from "../apps/api/src/data-backup";
const { values } = parseArgs({
  options: { source: { type: "string" }, output: { type: "string" } },
});
if (!values.source || !values.output)
  throw new Error(
    "Usage: npm run data:restore -- --source /private/backups/poker.sqlite --output data/restored.sqlite (new destination only)",
  );
console.log(
  JSON.stringify(
    await restoreDataBackup(values.source, values.output),
    null,
    2,
  ),
);
