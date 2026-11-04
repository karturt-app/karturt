import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), query: vi.fn() }));
vi.mock("@/db/client", () => ({ getConnection: mocks.connection }));
import { checkSystemHealth } from "@/lib/system-health";

describe("read-only System Admin health probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockReturnValue({ pool: { query: mocks.query } });
  });

  it("executes only a bounded SELECT 1 and reports healthy connection", async () => {
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const result = await checkSystemHealth();
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith({ text: "SELECT 1", query_timeout: 2500 });
    expect(result).toMatchObject({
      app: "responding", database: "connected", category: "none",
    });
    expect(Number.isFinite(Date.parse(result.checkedAt))).toBe(true);
  });

  it("maps driver failures to safe broad categories, never returning private diagnostics", async () => {
    mocks.query.mockRejectedValue(new Error("postgresql://secret-password@private-host", {
      cause: { code: "53300", detail: "sensitive internal information" },
    }));
    const result = await checkSystemHealth();
    expect(result).toMatchObject({ app: "responding", database: "unavailable", category: "capacity" });
    expect(JSON.stringify(result)).not.toMatch(/secret|postgresql|private-host|53300|detail/);
  });

  it("handles connection initialization errors with an unknown safe category", async () => {
    mocks.connection.mockImplementation(() => { throw new Error("private database URL"); });
    const result = await checkSystemHealth();
    expect(result).toMatchObject({ database: "unavailable", category: "unknown" });
    expect(JSON.stringify(result)).not.toContain("private database URL");
  });

  it("classifies timeout without returning raw exception data", async () => {
    mocks.query.mockRejectedValue({ code: "ETIMEDOUT", message: "secret details" });
    const result = await checkSystemHealth();
    expect(result.category).toBe("timeout");
    expect(JSON.stringify(result)).not.toContain("secret details");
  });
});
