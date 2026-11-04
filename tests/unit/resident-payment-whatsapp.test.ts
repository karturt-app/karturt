import { describe, expect, it } from "vitest";
import { buildResidentPaymentWhatsAppLink } from "@/lib/billing/resident-payment-whatsapp";

const request = {
  requestCode: "KRT-91A2B3C4D5E6ABCD",
  periods: ["2026-10", "2026-11"],
  totalAmount: 80000,
  createdAt: new Date("2026-11-04T02:00:00.000Z"),
};

describe("resident payment WhatsApp link", () => {
  it("targets the designated Bendahara contact with the existing pending request details", () => {
    const link = buildResidentPaymentWhatsAppLink("6281358114984", {
      houseNumber: "UJI-5",
      residentName: "Warga Sintetis",
      request,
    });
    expect(link).not.toBeNull();
    const url = new URL(link!);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/6281358114984");
    const message = url.searchParams.get("text");
    expect(message).toContain("Halo Bendahara");
    expect(message).toContain("Warga Sintetis");
    expect(message).toContain("UJI-5");
    expect(message).toContain("Oktober 2026, November 2026");
    expect(message).toContain("80.000");
    expect(message).toContain(request.requestCode);
  });

  it("rejects an invalid WhatsApp destination", () => {
    expect(buildResidentPaymentWhatsAppLink("not-a-phone", {
      houseNumber: "UJI-5", residentName: "Warga Sintetis", request,
    })).toBeNull();
  });
});
