import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { count, getTableName } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { createDatabasePool, isVerifiedNodeTlsSocket } from "@/db/pool";
import { relationalSchema, schema } from "@/db/schema";
import type { AppDatabase } from "@/db/client";
import { officialMigrationCount, officialMigrationTags } from "@/db/migration-chain";
import { assertPreviewConnectionTarget, parsePreviewTargetIdentity } from "@/db/preview-target";
import { requireDatabaseEnvironment } from "@/lib/env";
import {
  bootstrapR2SyntheticFixture,
  canonicalR2SyntheticFixtureTableCounts,
  type R2StagingFixtureCredentials,
} from "@/lib/rt/r2-staging-fixture";

const target = {
  projectId: "quiet-credit-75135059",
  branchId: "br-weathered-base-aodwvapx",
  endpointId: "ep-tiny-base-aocoa7m9",
  database: "karturt_preview",
} as const;
const productionReference =
  "holy-term-22410117/br-jolly-bonus-azzd71cl/ep-empty-rain-azwe3eb3/karturt_production";
const appBaselineSha = "ff9b992bd3154d2cfb65dd14bcb0f1de452b29f1";
const fixtureBusinessDate = "2025-12-20"; // Creates billing year 2026 for current UAT.
const billingYear = 2026;
const runtimeRole = "karturt_preview_runtime_f4";

type RuntimeEvidence = {
  database_name: string;
  effective_role: string;
  session_role: string;
  postgres_version: number;
  can_login: boolean;
  is_superuser: boolean;
  can_create_db: boolean;
  can_create_role: boolean;
  can_replicate: boolean;
  bypass_rls: boolean;
  inherits: boolean;
  memberships: number;
  database_owner: boolean;
  can_connect: boolean;
  database_create: boolean;
  database_temp: boolean;
  schema_usage: boolean;
  schema_create: boolean;
  public_tables: number;
  drizzle_exists: boolean;
};

const sql = [
  "SELECT current_database() AS database_name, current_user AS effective_role,",
  "  session_user AS session_role, current_setting('server_version_num')::int AS postgres_version,",
  "  r.rolcanlogin AS can_login, r.rolsuper AS is_superuser,",
  "  r.rolcreatedb AS can_create_db, r.rolcreaterole AS can_create_role,",
  "  r.rolreplication AS can_replicate, r.rolbypassrls AS bypass_rls,",
  "  r.rolinherit AS inherits,",
  "  (SELECT count(*)::int FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS memberships,",
  "  EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname=current_database() AND datdba=r.oid) AS database_owner,",
  "  pg_catalog.has_database_privilege(r.oid,current_database(),'CONNECT') AS can_connect,",
  "  pg_catalog.has_database_privilege(r.oid,current_database(),'CREATE') AS database_create,",
  "  pg_catalog.has_database_privilege(r.oid,current_database(),'TEMPORARY') AS database_temp,",
  "  pg_catalog.has_schema_privilege(r.oid,'public','USAGE') AS schema_usage,",
  "  pg_catalog.has_schema_privilege(r.oid,'public','CREATE') AS schema_create,",
  "  (SELECT count(*)::int FROM pg_catalog.pg_tables WHERE schemaname='public') AS public_tables,",
  "  EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='drizzle') AS drizzle_exists",
  "FROM pg_catalog.pg_roles r WHERE r.rolname=current_user",
].join("\n");

function officialJournalMatchesSource() {
  const contents = readFileSync(resolve("drizzle/meta/_journal.json"), "utf8");
  const journal = JSON.parse(contents) as { entries?: Array<{ tag: string }> };
  return journal.entries?.length === officialMigrationCount &&
    journal.entries.every((entry, index) => entry.tag === officialMigrationTags[index]);
}

async function tableCounts(database: AppDatabase) {
  const entries = await Promise.all((Object.values(schema) as AnyPgTable[]).map(async (table) => {
    const [row] = await database.select({ value: count() }).from(table);
    return [getTableName(table), row?.value ?? -1] as const;
  }));
  return Object.fromEntries(entries) as Record<string, number>;
}

function countsMatch(
  actual: Record<string, number>,
  expected: Readonly<Record<string, number>>,
) {
  return Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function readCredentials(): R2StagingFixtureCredentials {
  const residentPin = process.env.KARTURT_UAT_RESIDENT_PIN ?? "";
  const chairmanPassword = process.env.KARTURT_UAT_CHAIRMAN_PASSWORD ?? "";
  const treasurerPassword = process.env.KARTURT_UAT_TREASURER_PASSWORD ?? "";
  const systemAdminPassword = process.env.KARTURT_UAT_SYSTEM_ADMIN_PASSWORD ?? "";
  if (!/^\d{6}$/.test(residentPin)) {
    throw new Error("Invalid synthetic Resident PIN secret.");
  }
  const passwords = [chairmanPassword, treasurerPassword, systemAdminPassword];
  if (passwords.some(v => v.trim() !== v || v.length < 16 || v.length > 128) ||
      new Set(passwords).size !== 3) {
    throw new Error("Invalid distinct synthetic official password secrets.");
  }
  return { residentPin, chairmanPassword, treasurerPassword, systemAdminPassword };
}

async function main() {
  const mode = process.argv.length === 3 ? process.argv[2] : undefined;
  if (mode !== "--plan" && mode !== "--apply") {
    throw new Error("Only --plan or --apply is accepted.");
  }
  const env = requireDatabaseEnvironment();
  if (env.appEnv !== "preview" || env.databaseEnv !== "preview") {
    throw new Error("Fixture runner only accepts explicit Preview labels.");
  }
  const parsed = parsePreviewTargetIdentity(process.env);
  if (
    parsed.projectId !== target.projectId ||
    parsed.branchId !== target.branchId ||
    parsed.endpointId !== target.endpointId ||
    parsed.database !== target.database ||
    process.env.KARTURT_PRODUCTION_TARGET_ID !== productionReference ||
    process.env.KARTURT_UAT_APP_BASE_SHA !== appBaselineSha
  ) {
    throw new Error("Fixture runner rejects unapproved isolated Neon target or application baseline.");
  }
  assertPreviewConnectionTarget(env.databaseUrl, "runtime", process.env);
  if (!officialJournalMatchesSource()) {
    throw new Error("Fixture runner requires the exact 16 official migrations in the source.");
  }
  if (mode === "--apply" && process.env.KARTURT_UAT_FIXTURE_GO !== "CREATE_FOUR_SYNTHETIC_UAT_ACCOUNTS") {
    throw new Error("Fixture runner requires the exact one-time UAT GO.");
  }
  const credentials = readCredentials();
  const pool = createDatabasePool(env.databaseUrl, "preview", "runtime", 1);
  try {
    const client = await pool.connect();
    try {
      const tlsVerified = isVerifiedNodeTlsSocket(client.connection.stream);
      const result = await client.query<RuntimeEvidence>(sql);
      const r = result.rows[0];
      if (
        !tlsVerified || !r || r.database_name !== target.database ||
        r.effective_role !== runtimeRole || r.session_role !== runtimeRole ||
        Math.floor(r.postgres_version / 10000) !== 18 ||
        !r.can_login || r.is_superuser || r.can_create_db || r.can_create_role ||
        r.can_replicate || r.bypass_rls || r.inherits || r.memberships !== 0 ||
        r.database_owner || !r.can_connect || r.database_create || r.database_temp ||
        !r.schema_usage || r.schema_create || r.public_tables !== 29 || !r.drizzle_exists
      ) {
        throw new Error("Read-only runtime role / Node TLS / migrated-schema preflight failed.");
      }
      console.info(JSON.stringify({
        event: "uat-preview.fixture-runtime-preflight.pass",
        exactTarget: true, postgresMajor: 18, verifiedNodeTls: true,
        runtimeLeastPrivilege: true, publicTables: 29,
      }));
    } finally {
      client.release();
    }

    const database = drizzle({ client: pool, schema: relationalSchema });
    const before = await tableCounts(database as unknown as AppDatabase);
    const allEmpty = Object.values(before).every(n => n === 0);
    if (!allEmpty || Object.keys(before).length !== Object.keys(canonicalR2SyntheticFixtureTableCounts).length) {
      throw new Error("Fixture runner requires all 29 application tables empty; it will not overwrite existing rows.");
    }
    console.info(JSON.stringify({
      event: "uat-preview.fixture-plan.pass", target: parsed, businessDate: fixtureBusinessDate,
      syntheticBillingYear: billingYear, syntheticAccounts: 4, syntheticRtUnits: 1,
      syntheticHouseholds: 1, syntheticDues: 12, databaseWritesStarted: false,
    }));
    if (mode === "--plan") return;

    const output = await bootstrapR2SyntheticFixture(
      database as unknown as Parameters<typeof bootstrapR2SyntheticFixture>[0],
      credentials,
      fixtureBusinessDate,
    );
    if (output.status !== "created") {
      throw new Error("Fixture runner did not create a new canonical synthetic fixture.");
    }
    const after = await tableCounts(database as unknown as AppDatabase);
    if (!countsMatch(after, canonicalR2SyntheticFixtureTableCounts)) {
      throw new Error("Post-bootstrap synthetic fixture totals differ from the frozen ledger.");
    }
    console.info(JSON.stringify({
      event: "uat-preview.fixture.created-and-verified",
      target: parsed,
      syntheticBillingYear: billingYear,
      accountsCreated: 4,
      syntheticRtUnits: 1,
      syntheticHouseholds: 1,
      syntheticDues: 12,
      applicationTableCountsVerified: true,
      credentialValuesLogged: false,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Never emit raw driver messages, URL, password or the synthetic PIN in CI logs.
  const code = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && /^[A-Z0-9_]{3,30}$/.test(error.code)
    ? error.code : "unspecified";
  console.error(JSON.stringify({
    event: "uat-preview.fixture.failed",
    code,
    credentialValuesLogged: false,
  }));
  process.exitCode = 1;
});
