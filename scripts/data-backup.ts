import Database from "better-sqlite3";
import { parseArgs } from "node:util";
import { createDataBackup } from "../apps/api/src/data-backup";
const { values } = parseArgs({
  options: { source: { type: "string" }, output: { type: "string" } },
});
if (!values.source || !values.output)
  throw new Error(
    "Usage: npm run data:backup -- --source data/poker.sqlite --output /private/backups/poker.sqlite",
  );
// No migrations or writes to the source. SQLite reads its committed WAL too.
const db = new Database(values.source, { readonly: true, fileMustExist: true });
try {
  console.log(
    JSON.stringify(await createDataBackup(db, values.output), null, 2),
  );
} finally {
  db.close();
}
