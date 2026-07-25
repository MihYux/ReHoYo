export type GraphLabelRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type GraphLabelPlacement = {
  x: number;
  y: number;
  rect: GraphLabelRect;
  detached: boolean;
};

type Direction = { x: number; y: number };

type PlaceGraphLabelInput = {
  nodeX: number;
  nodeY: number;
  nodeRadius: number;
  width: number;
  height: number;
  gap: number;
  padding: number;
  preferredDirection: Direction;
  occupied: GraphLabelRect[];
  obstacles: GraphLabelRect[];
};

function normalize(direction: Direction): Direction {
  const length = Math.hypot(direction.x, direction.y);
  return length > 0.001
    ? { x: direction.x / length, y: direction.y / length }
    : { x: 0, y: 1 };
}

function rotate(direction: Direction, angle: number): Direction {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: direction.x * cosine - direction.y * sine,
    y: direction.x * sine + direction.y * cosine,
  };
}

export function graphLabelRectsOverlap(left: GraphLabelRect, right: GraphLabelRect) {
  return !(
    left.right <= right.left
    || left.left >= right.right
    || left.bottom <= right.top
    || left.top >= right.bottom
  );
}

function overlapArea(left: GraphLabelRect, right: GraphLabelRect) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

export function placeGraphLabel({
  nodeX,
  nodeY,
  nodeRadius,
  width,
  height,
  gap,
  padding,
  preferredDirection,
  occupied,
  obstacles,
}: PlaceGraphLabelInput): GraphLabelPlacement {
  const preferred = normalize(preferredDirection);
  const angleOffsets = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI, 3 * Math.PI / 4, -3 * Math.PI / 4];
  const rings = [1, 1.65, 2.4, 3.25, 4.25];
  let best: { placement: GraphLabelPlacement; penalty: number } | undefined;

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    for (const angle of angleOffsets) {
      const direction = normalize(rotate(preferred, angle));
      const radialHalfExtent = Math.abs(direction.x) * width / 2 + Math.abs(direction.y) * height / 2;
      const extraDistance = (ring - 1) * (height + gap * 1.5);
      const distance = nodeRadius + gap + radialHalfExtent + extraDistance;
      const x = nodeX + direction.x * distance;
      const y = nodeY + direction.y * distance;
      const rect = {
        left: x - width / 2 - padding,
        right: x + width / 2 + padding,
        top: y - height / 2 - padding,
        bottom: y + height / 2 + padding,
      };
      const collidesWithLabel = occupied.some((item) => graphLabelRectsOverlap(rect, item));
      const collidesWithNode = obstacles.some((item) => graphLabelRectsOverlap(rect, item));
      const placement = { x, y, rect, detached: ringIndex > 0 };
      if (!collidesWithLabel && !collidesWithNode) return placement;

      const penalty = occupied.reduce((sum, item) => sum + overlapArea(rect, item) * 12, 0)
        + obstacles.reduce((sum, item) => sum + overlapArea(rect, item) * 5, 0)
        + distance * 0.01;
      if (!best || penalty < best.penalty) best = { placement, penalty };
    }
  }

  return best?.placement || {
    x: nodeX,
    y: nodeY + nodeRadius + gap + height / 2,
    rect: {
      left: nodeX - width / 2 - padding,
      right: nodeX + width / 2 + padding,
      top: nodeY + nodeRadius + gap - padding,
      bottom: nodeY + nodeRadius + gap + height + padding,
    },
    detached: true,
  };
}
