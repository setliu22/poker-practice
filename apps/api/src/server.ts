import { createApp } from "./app";
import { openDatabase } from "./database";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const db = openDatabase(),
  app = createApp(db);
if (existsSync(resolve("dist/web/index.html"))) {
  const { default: express } = await import("express");
  app.use(express.static(resolve("dist/web")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/web/index.html")),
  );
}
const server = app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () =>
  console.log(
    "Poker Practice API at http://127.0.0.1:" + (process.env.PORT ?? 3001),
  ),
);
function stop() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
