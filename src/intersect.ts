/* tslint:disable:trailing-whitespace */
/* tslint:disable:cyclomatic-complexity */

import { pointInCircle, pointInPolygon as pointInConvexPolygon } from "sat";
import { Body, BodyGroup, SATPolygon, SATVector, Vector } from "./model";
import { every, forEach, map, some } from "./optimized";

import { Circle } from "./bodies/circle";
import { Line } from "./bodies/line";
import { Point } from "./bodies/point";
import { Polygon } from "./bodies/polygon";

/**
 * replace body with array of related convex polygons
 */
export function ensureConvex<TBody extends Body = Circle | Point | Polygon>(
  body: TBody,
): (TBody | SATPolygon)[] {
  if (body.isConvex || body.typeGroup !== BodyGroup.Polygon) {
    return [body];
  }

  return body.convexPolygons;
}

/**
 * @param polygon
 * @param circle
 */
export function polygonInCircle(
  polygon: Polygon,
  circle: Pick<Circle, "pos" | "r">,
): boolean {
  return every(polygon.calcPoints,p => {
    const point = {
      x: p.x + polygon.pos.x,
      y: p.y + polygon.pos.y,
    } as SATVector;

    return pointInCircle(point, circle);
  });
}

export function pointInPolygon(point: Vector, polygon: Polygon): boolean {
  return some(ensureConvex(polygon),convex =>
    pointInConvexPolygon(point as SATVector, convex),
  );
}

export function polygonInPolygon(
  polygonA: Polygon,
  polygonB: Polygon,
): boolean {
  return every(polygonA.calcPoints,point =>
    pointInPolygon(
      { x: point.x + polygonA.pos.x, y: point.y + polygonA.pos.y },
      polygonB,
    ),
  );
}

/**
 * https://stackoverflow.com/a/68197894/1749528
 *
 * @param point
 * @param circle
 */
export function pointOnCircle(
  point: Vector,
  circle: Pick<Circle, "pos" | "r">,
): boolean {
  return (
    (point.x - circle.pos.x) * (point.x - circle.pos.x) +
      (point.y - circle.pos.y) * (point.y - circle.pos.y) ===
    circle.r * circle.r
  );
}

/**
 * https://stackoverflow.com/a/68197894/1749528
 *
 * @param circle1
 * @param circle2
 */
export function circleInCircle(
  circle1: Pick<Circle, "pos" | "r">,
  circle2: Pick<Circle, "pos" | "r">,
) {
  const x1 = circle1.pos.x;
  const y1 = circle1.pos.y;
  const x2 = circle2.pos.x;
  const y2 = circle2.pos.y;
  const r1 = circle1.r;
  const r2 = circle2.r;
  const distSq = Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));

  return distSq + r2 === r1 || distSq + r2 < r1;
}

/**
 * https://stackoverflow.com/a/68197894/1749528
 *
 * @param circle
 * @param polygon
 */
export function circleInPolygon(
  circle: Pick<Circle, "pos" | "r">,
  polygon: Polygon,
): boolean {
  // Circle with radius 0 isn't a circle
  if (circle.r === 0) {
    return false;
  }

  // If the center of the circle is not within the polygon,
  // then the circle may overlap, but it'll never be "contained"
  // so return false
  if (!pointInPolygon(circle.pos, polygon)) {
    return false;
  }

  // Necessary add polygon pos to points
  const points = map(polygon.calcPoints, ({ x, y }: SATVector) => ({
    x: x + polygon.pos.x,
    y: y + polygon.pos.y,
  })) as SATVector[];

  // If the center of the circle is within the polygon,
  // the circle is not outside of the polygon completely.
  // so return false.
  if (some(points,point => pointInCircle(point, circle))) {
    return false;
  }

  // If any line-segment of the polygon intersects the circle,
  // the circle is not "contained"
  // so return false
  if (
    some(points, (end, index) => {
      const start: Vector = index
        ? points[index - 1]
        : points[points.length - 1];

      return intersectLineCircle({ start, end }, circle).length > 0;
    })
  ) {
    return false;
  }

  return true;
}

/**
 * https://stackoverflow.com/a/68197894/1749528
 *
 * @param circle
 * @param polygon
 */
export function circleOutsidePolygon(
  circle: Pick<Circle, "pos" | "r">,
  polygon: Polygon,
): boolean {
  // Circle with radius 0 isn't a circle
  if (circle.r === 0) {
    return false;
  }

  // If the center of the circle is within the polygon,
  // the circle is not outside of the polygon completely.
  // so return false.
  if (pointInPolygon(circle.pos, polygon)) {
    return false;
  }

  // Necessary add polygon pos to points
  const points = map(polygon.calcPoints, ({ x, y }: SATVector) => ({
    x: x + polygon.pos.x,
    y: y + polygon.pos.y,
  })) as SATVector[];

  // If the center of the circle is within the polygon,
  // the circle is not outside of the polygon completely.
  // so return false.
  if (
    some(
      points,point => pointInCircle(point, circle) || pointOnCircle(point, circle),
    )
  ) {
    return false;
  }

  // If any line-segment of the polygon intersects the circle,
  // the circle is not "contained"
  // so return false
  if (
    some(points, (end, index) => {
      const start: Vector = index
        ? points[index - 1]
        : points[points.length - 1];

      return intersectLineCircle({ start, end }, circle).length > 0;
    })
  ) {
    return false;
  }

  return true;
}

/**
 * https://stackoverflow.com/a/37225895/1749528
 *
 * @param line
 * @param circle
 */
export function intersectLineCircle(
  line: Pick<Line, "start" | "end">,
  { pos, r }: Pick<Circle, "pos" | "r">,
): Vector[] {
  const v1 = { x: line.end.x - line.start.x, y: line.end.y - line.start.y };
  const v2 = { x: line.start.x - pos.x, y: line.start.y - pos.y };
  const b = (v1.x * v2.x + v1.y * v2.y) * -2;
  const c = (v1.x * v1.x + v1.y * v1.y) * 2;
  const d = Math.sqrt(b * b - (v2.x * v2.x + v2.y * v2.y - r * r) * c * 2);

  if (isNaN(d)) {
    // no intercept
    return [];
  }

  const u1 = (b - d) / c; // these represent the unit distance of point one and two on the line
  const u2 = (b + d) / c;
  const results: Vector[] = []; // return array

  if (u1 <= 1 && u1 >= 0) {
    // add point if on the line segment
    results.push({ x: line.start.x + v1.x * u1, y: line.start.y + v1.y * u1 });
  }

  if (u2 <= 1 && u2 >= 0) {
    // second add point if on the line segment
    results.push({ x: line.start.x + v1.x * u2, y: line.start.y + v1.y * u2 });
  }

  return results;
}

/**
 * helper for intersectLineLineFast
 */
function isTurn(point1: Vector, point2: Vector, point3: Vector) {
  const A = (point3.x - point1.x) * (point2.y - point1.y);
  const B = (point2.x - point1.x) * (point3.y - point1.y);

  return A > B + Number.EPSILON ? 1 : A + Number.EPSILON < B ? -1 : 0;
}

/**
 * faster implementation of intersectLineLine
 * https://stackoverflow.com/a/16725715/1749528
 *
 * @param line1
 * @param line2
 */
export function intersectLineLineFast(
  line1: Pick<Line, "start" | "end">,
  line2: Pick<Line, "start" | "end">,
): boolean {
  return (
    isTurn(line1.start, line2.start, line2.end) !==
      isTurn(line1.end, line2.start, line2.end) &&
    isTurn(line1.start, line1.end, line2.start) !==
      isTurn(line1.start, line1.end, line2.end)
  );
}

/**
 * returns the point of intersection
 * https://stackoverflow.com/a/24392281/1749528
 *
 * @param line1
 * @param line2
 */
export function intersectLineLine(
  line1: Pick<Line, "start" | "end">,
  line2: Pick<Line, "start" | "end">,
): Vector | undefined {
  const dX: number = line1.end.x - line1.start.x;
  const dY: number = line1.end.y - line1.start.y;

  const determinant: number =
    dX * (line2.end.y - line2.start.y) - (line2.end.x - line2.start.x) * dY;

  if (determinant === 0) {
    return;
  }

  const lambda: number =
    ((line2.end.y - line2.start.y) * (line2.end.x - line1.start.x) +
      (line2.start.x - line2.end.x) * (line2.end.y - line1.start.y)) /
    determinant;

  const gamma: number =
    ((line1.start.y - line1.end.y) * (line2.end.x - line1.start.x) +
      dX * (line2.end.y - line1.start.y)) /
    determinant;

  // check if there is an intersection
  if (!(lambda >= 0 && lambda <= 1) || !(gamma >= 0 && gamma <= 1)) {
    return;
  }

  return { x: line1.start.x + lambda * dX, y: line1.start.y + lambda * dY };
}

export function intersectLinePolygon(line: Line, polygon: Polygon): Vector[] {
  const results: Vector[] = [];

  forEach(polygon.calcPoints, (to: Vector, index: number) => {
    const from: Vector = index
      ? polygon.calcPoints[index - 1]
      : polygon.calcPoints[polygon.calcPoints.length - 1];
    const side = {
      start: { x: from.x + polygon.pos.x, y: from.y + polygon.pos.y },
      end: { x: to.x + polygon.pos.x, y: to.y + polygon.pos.y },
    };

    const hit = intersectLineLine(line, side);

    if (hit) {
      results.push(hit);
    }
  });

  return results;
}
