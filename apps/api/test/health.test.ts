import { describe, it, expect } from "vitest";
import { buildServer } from "../src/index.js";

describe("Health Check", () => {
  it("should return 200 OK", async () => {
    const app = await buildServer();
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
