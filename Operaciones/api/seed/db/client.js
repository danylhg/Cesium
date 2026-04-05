// seed/db/client.js
import pkg from "pg";
import { requireEnv } from "../helpers/env.js";

const { Client } = pkg;

export async function createClient() {
  const client = new Client({
    host: requireEnv("PGHOST"),
    port: Number(process.env.PGPORT || 5432),
    user: requireEnv("PGUSER"),
    password: requireEnv("PGPASSWORD"),
    database: requireEnv("PGDATABASE"),
  });

  await client.connect();
  return client;
}