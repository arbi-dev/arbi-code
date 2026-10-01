import { describe, expect, it } from "vitest";
import { shouldShowCloudSandboxOption } from "./RuntimeModeSelector";

describe("shouldShowCloudSandboxOption", () => {
  it("hides cloud sandbox when the experiment is off and cloud is not active", () => {
    expect(
      shouldShowCloudSandboxOption({
        runtimeMode: "host",
        cloudSandboxExperimentEnabled: false,
      }),
    ).toBe(false);
  });

  it("shows cloud sandbox when the experiment is enabled", () => {
    expect(
      shouldShowCloudSandboxOption({
        runtimeMode: "host",
        cloudSandboxExperimentEnabled: true,
      }),
    ).toBe(true);
  });

  it("keeps cloud sandbox visible when cloud mode is already active", () => {
    expect(
      shouldShowCloudSandboxOption({
        runtimeMode: "cloud",
        cloudSandboxExperimentEnabled: false,
      }),
    ).toBe(true);
  });

  it("hides cloud sandbox in ARBI mode even if the experiment is enabled", () => {
    expect(
      shouldShowCloudSandboxOption({
        runtimeMode: "host",
        cloudSandboxExperimentEnabled: true,
        arbiMode: true,
      }),
    ).toBe(false);
  });

  it("hides cloud sandbox in ARBI mode even if cloud mode is active", () => {
    expect(
      shouldShowCloudSandboxOption({
        runtimeMode: "cloud",
        cloudSandboxExperimentEnabled: false,
        arbiMode: true,
      }),
    ).toBe(false);
  });
});
