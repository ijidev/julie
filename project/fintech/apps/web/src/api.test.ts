import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "./api";

describe("resolveApiUrl", () => {
  it("keeps API calls inside Julie's project subpath", () => {
    expect(resolveApiUrl("health", "https://host.example/project/fintech/"))
      .toBe("https://host.example/project/fintech/api/health");
  });

  it("uses root API when the application is opened on its bound port", () => {
    expect(resolveApiUrl("/capabilities", "http://127.0.0.1:4100/"))
      .toBe("http://127.0.0.1:4100/api/capabilities");
  });
});
