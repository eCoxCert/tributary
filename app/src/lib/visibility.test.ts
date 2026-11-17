import { describe, expect, it } from "vitest";
import { isListedVerdict, listState, plural } from "./visibility";

const base = { scanning: false, error: false, anyPending: false, visible: 0, shown: 0, rawCount: 0 };

describe("isListedVerdict", () => {
  it("lists verified and unverifiable, hides mismatch", () => {
    expect(isListedVerdict(true, { status: "verified" }, false)).toBe(true);
    expect(isListedVerdict(true, { status: "unverifiable", reasons: [] }, false)).toBe(true);
    expect(isListedVerdict(true, { status: "mismatch", problems: [] }, false)).toBe(false);
  });
  it("never lists a launch without Tributary metadata, except in the debug view", () => {
    expect(isListedVerdict(false, null, false)).toBe(false);
    expect(isListedVerdict(false, null, true)).toBe(true);
    expect(isListedVerdict(false, { status: "verified" }, false)).toBe(false);
  });
});

describe("listState", () => {
  it("raw list full but nothing visible (all mismatch) is EMPTY, not 'no match'", () => {
    expect(listState({ ...base, rawCount: 3, visible: 0, shown: 0 })).toBe("empty");
  });
  it("no-match only when visible launches exist and search/filter hides all of them", () => {
    expect(listState({ ...base, rawCount: 3, visible: 2, shown: 0 })).toBe("no-match");
  });
  it("stays loading while cards are still being read, never flashes empty", () => {
    expect(listState({ ...base, rawCount: 2, anyPending: true })).toBe("loading");
    expect(listState({ ...base, scanning: true })).toBe("loading");
  });
  it("shows the list when rows are shown", () => {
    expect(listState({ ...base, rawCount: 2, visible: 2, shown: 2 })).toBe("list");
  });
});

describe("plural", () => {
  it("1 launch / N launches", () => {
    expect(plural(1, "launch")).toBe("1 launch");
    expect(plural(0, "launch")).toBe("0 launches");
    expect(plural(12, "launch")).toBe("12 launches");
  });
});
