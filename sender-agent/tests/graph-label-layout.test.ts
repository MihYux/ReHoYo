import { describe, expect, it } from "vitest";
import { graphLabelRectsOverlap, placeGraphLabel, type GraphLabelRect } from "@/lib/graph-label-layout";

describe("graph label layout", () => {
  it("places dense labels without overlapping earlier labels", () => {
    const occupied: GraphLabelRect[] = [];
    const directions = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
    ];

    for (const direction of directions) {
      const placement = placeGraphLabel({
        nodeX: direction.x * 4,
        nodeY: direction.y * 4,
        nodeRadius: 5.2,
        width: 34,
        height: 11,
        gap: 4,
        padding: 2,
        preferredDirection: direction,
        occupied,
        obstacles: [],
      });
      expect(occupied.some((rect) => graphLabelRectsOverlap(rect, placement.rect))).toBe(false);
      occupied.push(placement.rect);
    }
  });

  it("avoids node obstacles when another label position is available", () => {
    const obstacle = { left: -18, right: 18, top: 8, bottom: 24 };
    const placement = placeGraphLabel({
      nodeX: 0,
      nodeY: 0,
      nodeRadius: 5,
      width: 28,
      height: 10,
      gap: 4,
      padding: 2,
      preferredDirection: { x: 0, y: 1 },
      occupied: [],
      obstacles: [obstacle],
    });

    expect(graphLabelRectsOverlap(placement.rect, obstacle)).toBe(false);
  });

  it("is deterministic for identical graph state", () => {
    const input = {
      nodeX: 12,
      nodeY: -8,
      nodeRadius: 5,
      width: 42,
      height: 11,
      gap: 4,
      padding: 2,
      preferredDirection: { x: -1, y: 0.25 },
      occupied: [{ left: -10, right: 10, top: -10, bottom: 10 }],
      obstacles: [{ left: 10, right: 20, top: -5, bottom: 5 }],
    };

    expect(placeGraphLabel(input)).toEqual(placeGraphLabel(input));
  });
});
