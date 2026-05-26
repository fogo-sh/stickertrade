import { execSync } from "child_process";
import { unlinkSync } from "fs";
import { installGlobals } from "@remix-run/node/globals";
import "@testing-library/jest-dom/extend-expect";

const testDbPath = "file:../data/test.db";

process.env.DATABASE_URL = testDbPath;

try {
  unlinkSync(testDbPath);
} catch (err) {}

execSync("prisma migrate deploy");

installGlobals();
