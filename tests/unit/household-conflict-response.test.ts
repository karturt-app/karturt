import { describe, expect, it } from "vitest";
import { HouseholdConflictError } from "@/lib/households/lifecycle";
import {
  householdConflictCodes,
  householdConflictMessage,
  householdConflictMessageFromResponse,
} from "@/lib/households/conflicts";
import { householdErrorResponse } from "@/app/api/chairman/households/response";

describe("Chairman household conflict responses", () => {
  it.each(householdConflictCodes)("returns the safe allowlisted response for %s", async (code) => {
    const response = await householdErrorResponse(new HouseholdConflictError("internal database detail", code));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ code, message: householdConflictMessage(code) });
  });

  it("falls back to GENERIC_CONFLICT for an unknown code", async () => {
    const error = new HouseholdConflictError("internal database detail") as HouseholdConflictError & { code: string };
    Object.defineProperty(error, "code", { value: "UNKNOWN_INTERNAL_CODE" });
    const response = await householdErrorResponse(error);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "GENERIC_CONFLICT",
      message: householdConflictMessage("GENERIC_CONFLICT"),
    });
  });

  it("does not include database or account details in the response", async () => {
    const error = new HouseholdConflictError(
      "SELECT * FROM app_accounts; SQLSTATE 23505; constraint houses_rt_number_uq; internal account marker",
      "DUPLICATE_HOUSE_NUMBER",
    );
    const response = await householdErrorResponse(error);
    const body = await response.text();

    expect(body).toContain("DUPLICATE_HOUSE_NUMBER");
    expect(body).not.toMatch(/SELECT|SQLSTATE|23505|houses_rt_number_uq|internal account marker/i);
  });

  it("uses only a recognized response code in the UI and falls back for unknown or malformed bodies", async () => {
    const specific = await householdConflictMessageFromResponse(new Response(JSON.stringify({
      code: "DUPLICATE_HOUSE_NUMBER",
      message: "private server detail",
    })));
    const unknown = await householdConflictMessageFromResponse(new Response(JSON.stringify({
      code: "UNKNOWN_INTERNAL_CODE",
      message: "private server detail",
    })));
    const malformed = await householdConflictMessageFromResponse(new Response("not-json"));

    expect(specific).toBe(householdConflictMessage("DUPLICATE_HOUSE_NUMBER"));
    expect(specific).not.toContain("private server detail");
    expect(unknown).toBe(householdConflictMessage("GENERIC_CONFLICT"));
    expect(malformed).toBe(householdConflictMessage("GENERIC_CONFLICT"));
  });
});
