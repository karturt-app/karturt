import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabasePool, isVerifiedNodeTlsSocket } from "@/db/pool";
import { officialMigrationCount, officialMigrationTags } from "@/db/migration-chain";
import { assertPreviewConnectionTarget, parsePreviewTargetIdentity } from "@/db/preview-target";
import { requireDatabaseEnvironment } from "@/lib/env";

const approvedTarget = {
  projectId: "quiet-credit-75135059",
  branchId: "br-weathered-base-aodwvapx",
  endpointId: "ep-tiny-base-aocoa7m9",
  database: "karturt_preview",
} as const;

const approvedProductionReference =
  "holy-term-22410117/br-jolly-bonus-azzd71cl/ep-empty-rain-azwe3eb3/karturt_production";

const runtimeRole = "karturt_preview_runtime_f4";
const migrationRole = "karturt_preview_migrator_f4";

type RoleEvidence = {
  database_name: string;
  role_name: string;
  session_role: string;
  server_version: number;
  postgres_tls_active: boolean;
  can_login: boolean;
  superuser: boolean;
  createdb: boolean;
  createrole: boolean;
  replication: boolean;
  bypassrls: boolean;
  inherit: boolean;
  memberships: number;
  database_owner: boolean;
  can_connect: boolean;
  can_create_database_objects: boolean;
  can_use_temp: boolean;
  public_usage: boolean;
  public_create: boolean;
  public_temp_granted: boolean;
  public_relations: number;
  public_routines: number;
  drizzle_schemas: number;
};

const roleQuery = [
  "SELECT current_database() AS database_name,",
  "  current_user AS role_name,",
  "  session_user AS session_role,",
  "  current_setting('server_version_num')::int AS server_version,",
  "  EXISTS (SELECT 1 FROM pg_catalog.pg_stat_ssl",
  "          WHERE pid = pg_catalog.pg_backend_pid() AND ssl) AS postgres_tls_active,",
  "  role.rolcanlogin AS can_login, role.rolsuper AS superuser,",
  "  role.rolcreatedb AS createdb, role.rolcreaterole AS createrole,",
  "  role.rolreplication AS replication, role.rolbypassrls AS bypassrls,",
  "  role.rolinherit AS inherit,",
  "  (SELECT count(*)::int FROM pg_catalog.pg_auth_members",
  "   WHERE member = role.oid) AS memberships,",
  "  EXISTS (SELECT 1 FROM pg_catalog.pg_database",
  "          WHERE datname = current_database() AND datdba = role.oid) AS database_owner,",
  "  pg_catalog.has_database_privilege(role.oid, current_database(), 'CONNECT') AS can_connect,",
  "  pg_catalog.has_database_privilege(role.oid, current_database(), 'CREATE') AS can_create_database_objects,",
  "  pg_catalog.has_database_privilege(role.oid, current_database(), 'TEMPORARY') AS can_use_temp,",
  "  pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE') AS public_usage,",
  "  pg_catalog.has_schema_privilege(role.oid, 'public', 'CREATE') AS public_create,",
  "  EXISTS (SELECT 1 FROM pg_catalog.pg_database AS db",
  "          CROSS JOIN LATERAL pg_catalog.aclexplode(",
  "            COALESCE(db.datacl, pg_catalog.acldefault('d', db.datdba))) AS acl",
  "          WHERE db.datname = current_database()",
  "            AND acl.grantee = 0 AND acl.privilege_type = 'TEMPORARY') AS public_temp_granted,",
  "  (SELECT count(*)::int FROM pg_catalog.pg_class AS c",
  "   JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace",
  "   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')) AS public_relations,",
  "  (SELECT count(*)::int FROM pg_catalog.pg_proc AS p",
  "   JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace",
  "   WHERE n.nspname = 'public') AS public_routines,",
  "  (SELECT count(*)::int FROM pg_catalog.pg_namespace",
  "   WHERE nspname = 'drizzle') AS drizzle_schemas",
  "FROM pg_catalog.pg_roles AS role WHERE role.rolname = current_user",
].join("\n");

function assertOfficialMigrationJournal() {
  const journal = JSON.parse(readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as {
    entries?: Array<{ tag?: string }>;
  };
  const entries = journal.entries ?? [];
  if (
    entries.length !== officialMigrationCount ||
    entries.some((entry, index) => entry.tag !== officialMigrationTags[index])
  ) {
    throw new Error("UAT migration preflight rejected a non-official Drizzle journal.");
  }
}

async function inspectRole(
  url: string,
  purpose: "runtime" | "migration",
  expectedRole: string,
) {
  assertPreviewConnectionTarget(url, purpose, process.env);
  const pool = createDatabasePool(url, "preview", purpose, 1);
  try {
    const client = await pool.connect();
    try {
      const verifiedNodeTls = isVerifiedNodeTlsSocket(client.connection.stream);
      const result = await client.query<RoleEvidence>(roleQuery);
      const row = result.rows[0];
      const expectedCreate = purpose === "migration";
      if (
        !verifiedNodeTls ||
        !row ||
        row.database_name !== approvedTarget.database ||
        row.role_name !== expectedRole ||
        row.session_role !== expectedRole ||
        row.server_version < 180000 ||
        row.server_version >= 190000 ||
        !row.postgres_tls_active ||
        !row.can_login ||
        row.superuser ||
        row.createdb ||
        row.createrole ||
        row.replication ||
        row.bypassrls ||
        row.inherit ||
        row.memberships !== 0 ||
        row.database_owner ||
        !row.can_connect ||
        row.can_create_database_objects !== expectedCreate ||
        row.can_use_temp ||
        !row.public_usage ||
        row.public_create !== expectedCreate ||
        row.public_temp_granted ||
        row.public_relations !== 0 ||
        row.public_routines !== 0 ||
        row.drizzle_schemas !== 0
      ) {
        throw new Error("UAT Preview role, TLS, isolation, or empty-database preflight failed for " + purpose + ".");
      }
      console.info(JSON.stringify({
        event: "uat-preview.role-preflight.pass",
        purpose,
        database: row.database_name,
        role: expectedRole,
        pgMajor: 18,
        verifiedNodeTls: true,
        postgresTlsActive: true,
        scopedPrivileges: true,
        emptySyntheticDatabase: true,
      }));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

let diagnosticPhase: "configuration" | "runtime" | "migration" | "complete" = "configuration";

async function main() {
  const environment = requireDatabaseEnvironment();
  if (environment.appEnv !== "preview" || environment.databaseEnv !== "preview") {
    throw new Error("The UAT migration preflight accepts only Preview environment labels.");
  }
  const target = parsePreviewTargetIdentity(process.env);
  if (
    target.projectId !== approvedTarget.projectId ||
    target.branchId !== approvedTarget.branchId ||
    target.endpointId !== approvedTarget.endpointId ||
    target.database !== approvedTarget.database ||
    process.env.KARTURT_PRODUCTION_TARGET_ID !== approvedProductionReference
  ) {
    throw new Error("The UAT migration preflight rejects an unapproved Neon target.");
  }
  const migrationUrl = process.env.DATABASE_MIGRATION_URL;
  if (!migrationUrl) {
    throw new Error("A separate one-off Preview migration credential is required.");
  }
  assertOfficialMigrationJournal();
  diagnosticPhase = "runtime";
  console.info("UAT Preview role check: runtime connection (no password output).");
  await inspectRole(environment.databaseUrl, "runtime", runtimeRole);
  diagnosticPhase = "migration";
  console.info("UAT Preview role check: migrator connection (no password output).");
  await inspectRole(migrationUrl, "migration", migrationRole);
  diagnosticPhase = "complete";
  console.info(JSON.stringify({
    event: "uat-preview.migration-preflight.pass",
    projectId: target.projectId,
    branchId: target.branchId,
    endpointId: target.endpointId,
    database: target.database,
    officialMigrationCount,
    officialMigrationHeadTag: officialMigrationTags[officialMigrationCount - 1],
    databaseWritesStarted: false,
  }));
}

main().catch((error: unknown) => {
  // Log only whitelisted, nonsecret diagnostic fields. Driver messages may contain credentials.
  const code = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && /^[A-Z0-9_]{3,30}$/.test(error.code)
      ? error.code : "unspecified";
  console.error(JSON.stringify({
    event: "uat-preview.migration-preflight.failed",
    phase: diagnosticPhase,
    sqlOrTransportCode: code,
    privateCredentialValuesIncluded: false,
  }));
  process.exitCode = 1;
});
