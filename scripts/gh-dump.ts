/**
 * Dump raw Google Health responses (last 3 days) to data/raw/*.json so the mappers in
 * lib/googleHealth.ts can be checked against real field names.
 *
 *   npm run google:dump
 */
import fs from "node:fs";
import path from "node:path";
import { accessToken, filtersFor, listPoints } from "../lib/googleHealth";

async function main() {
  const token = await accessToken();
  const dir = path.join(process.cwd(), "data", "raw");
  fs.mkdirSync(dir, { recursive: true });

  const identity = await fetch("https://health.googleapis.com/v4/users/me/identity", {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("identity:", identity.status, await identity.text());

  for (const [type, filter] of Object.entries(filtersFor(3))) {
    try {
      const points = await listPoints(token, type, filter, { maxPages: 1 });
      fs.writeFileSync(path.join(dir, `${type}.json`), JSON.stringify(points, null, 2));
      console.log(`${type}: ${points.length} points → data/raw/${type}.json`);
    } catch (err) {
      console.error(`${type}: FAILED`, err instanceof Error ? err.message : err);
    }
  }
}

main();
