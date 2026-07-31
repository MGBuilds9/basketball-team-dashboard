import { describe, expect, it } from "vitest"

import {
  buildReleaseManifest,
  parseReleaseManifest,
  releaseMatches,
} from "../scripts/release-manifest"

const expected = {
  codeRevision: "a".repeat(40),
  dataRevision: "b".repeat(40),
  snapshotContentHash: "c".repeat(64),
}

describe("exact deployed release reconciliation", () => {
  it("builds and parses a deterministic public release manifest", () => {
    const manifest = buildReleaseManifest(expected)

    expect(manifest).toEqual({
      schemaVersion: 1,
      releaseContract: "basketball-team-dashboard.release.v1",
      ...expected,
    })
    expect(parseReleaseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it("requires both the tested code and data revisions to match production", () => {
    const manifest = buildReleaseManifest(expected)

    expect(releaseMatches(manifest, expected)).toBe(true)
    expect(
      releaseMatches(manifest, {
        ...expected,
        dataRevision: "d".repeat(40),
      })
    ).toBe(false)
    expect(
      releaseMatches(manifest, {
        ...expected,
        codeRevision: "e".repeat(40),
      })
    ).toBe(false)
  })

  it.each([
    ["unknown fields", { ...buildReleaseManifest(expected), injected: true }],
    [
      "short revisions",
      { ...buildReleaseManifest(expected), codeRevision: "deadbeef" },
    ],
    [
      "unsafe hashes",
      {
        ...buildReleaseManifest(expected),
        snapshotContentHash: "<script>alert(1)</script>",
      },
    ],
  ])("rejects %s", (_label, manifest) => {
    expect(() => parseReleaseManifest(JSON.stringify(manifest))).toThrow()
  })
})
