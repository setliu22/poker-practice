import { openDatabase } from "./database";
const db = openDatabase();
db.close();
console.log("Poker Practice database initialized (migration 001).");
