import test from "node:test";
import assert from "node:assert/strict";

import { rangesOverlap as availabilityRangesOverlap } from "../functions/api/availability.js";
import { rangesOverlap as bookingRangesOverlap } from "../functions/api/bookings.js";

const implementations = [
  ["availability", availabilityRangesOverlap],
  ["booking submission", bookingRangesOverlap],
];

const range = (start, end) => ({
  start: new Date(start),
  end: new Date(end),
});

const manualEvent = {
  start: "2026-07-30T13:00:00-04:00",
  end: "2026-07-30T14:30:00-04:00",
};

implementations.forEach(([name, overlaps]) => {
  test(`${name} blocks every website window that overlaps a manual event`, () => {
    assert.equal(overlaps(range("2026-07-30T15:30:00Z", "2026-07-30T17:30:00Z"), manualEvent), true);
    assert.equal(overlaps(range("2026-07-30T16:00:00Z", "2026-07-30T18:00:00Z"), manualEvent), true);
    assert.equal(overlaps(range("2026-07-30T16:30:00Z", "2026-07-30T18:30:00Z"), manualEvent), true);
    assert.equal(overlaps(range("2026-07-30T17:00:00Z", "2026-07-30T19:00:00Z"), manualEvent), true);
    assert.equal(overlaps(range("2026-07-30T17:30:00Z", "2026-07-30T19:30:00Z"), manualEvent), true);
    assert.equal(overlaps(range("2026-07-30T18:00:00Z", "2026-07-30T20:00:00Z"), manualEvent), true);
  });

  test(`${name} keeps adjacent windows available`, () => {
    assert.equal(overlaps(range("2026-07-30T15:00:00Z", "2026-07-30T17:00:00Z"), manualEvent), false);
    assert.equal(overlaps(range("2026-07-30T18:30:00Z", "2026-07-30T20:30:00Z"), manualEvent), false);
  });
});
