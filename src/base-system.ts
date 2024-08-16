import {
  Body,
  BodyOptions,
  ChildrenData,
  Data,
  InTest,
  Leaf,
  PotentialVector,
  RBush,
  TraverseFunction,
  Vector,
} from "./model";
import { bodyMoved, drawBVH } from "./utils";
import { filter, forEach } from "./optimized";

import { Box } from "./bodies/box";
import { Circle } from "./bodies/circle";
import { Ellipse } from "./bodies/ellipse";
import { Line } from "./bodies/line";
import { Point } from "./bodies/point";
import { Polygon } from "./bodies/polygon";

/**
 * very base collision system (create, insert, update, draw, remove)
 */
export class BaseSystem<TBody extends Body = Body>
  extends RBush
  implements Data<TBody>
{
  data!: ChildrenData<TBody>;

  /**
   * create point at position with options and add to system
   */
  createPoint(position: PotentialVector, options?: BodyOptions): Point {
    const point = new Point(position, options);

    this.insert(point as TBody);

    return point;
  }

  /**
   * create line at position with options and add to system
   */
  createLine(start: Vector, end: Vector, options?: BodyOptions): Line {
    const line = new Line(start, end, options);

    this.insert(line as TBody);

    return line;
  }

  /**
   * create circle at position with options and add to system
   */
  createCircle(
    position: PotentialVector,
    radius: number,
    options?: BodyOptions,
  ): Circle {
    const circle = new Circle(position, radius, options);

    this.insert(circle as TBody);

    return circle;
  }

  /**
   * create box at position with options and add to system
   */
  createBox(
    position: PotentialVector,
    width: number,
    height: number,
    options?: BodyOptions,
  ): Box {
    const box = new Box(position, width, height, options);

    this.insert(box as TBody);

    return box;
  }

  /**
   * create ellipse at position with options and add to system
   */
  createEllipse(
    position: PotentialVector,
    radiusX: number,
    radiusY: number = radiusX,
    step?: number,
    options?: BodyOptions,
  ): Ellipse {
    const ellipse = new Ellipse(position, radiusX, radiusY, step, options);

    this.insert(ellipse as TBody);

    return ellipse;
  }

  /**
   * create polygon at position with options and add to system
   */
  createPolygon(
    position: PotentialVector,
    points: PotentialVector[],
    options?: BodyOptions,
  ): Polygon {
    const polygon = new Polygon(position, points, options);

    this.insert(polygon as TBody);

    return polygon;
  }

  /**
   * re-insert body into collision tree and update its bbox
   * every body can be part of only one system
   */
  insert(body: TBody): this {
    body.bbox = body.getAABBAsBBox();

    if (body.system) {
      // allow end if body inserted and not moved
      if (!bodyMoved(body)) {
        return this;
      }

      // old bounding box *needs* to be removed
      body.system.remove(body);
    }

    // only then we update min, max
    body.minX = body.bbox.minX - body.padding;
    body.minY = body.bbox.minY - body.padding;
    body.maxX = body.bbox.maxX + body.padding;
    body.maxY = body.bbox.maxY + body.padding;

    // reinsert bounding box to collision tree
    return super.insert(body);
  }

  /**
   * updates body in collision tree
   */
  updateBody(body: TBody): void {
    body.updateBody();
  }

  /**
   * update all bodies aabb
   */
  update(): void {
    forEach(this.all(), (body: TBody) => {
      this.updateBody(body);
    });
  }

  /**
   * draw exact bodies colliders outline
   */
  draw(context: CanvasRenderingContext2D): void {
    forEach(this.all(), (body: TBody) => {
      body.draw(context);
    });
  }

  /**
   * draw bounding boxes hierarchy outline
   */
  drawBVH(context: CanvasRenderingContext2D, isTrigger = true): void {
    const drawChildren = (body: Leaf<TBody>) => {
      drawBVH(context, body, isTrigger);
      if (body.children) {
        forEach(body.children, drawChildren);
      }
    };

    forEach(this.data.children, drawChildren);
  }

  /**
   * remove body aabb from collision tree
   */
  remove(body: TBody, equals?: InTest<TBody>): this {
    body.system = undefined;

    return super.remove(body, equals);
  }

  /**
   * get object potential colliders
   * @deprecated because it's slower to use than checkOne() or checkAll()
   */
  getPotentials(body: TBody): TBody[] {
    // filter here is required as collides with self
    return filter(this.search(body), (candidate: TBody) => candidate !== body);
  }

  /**
   * used to find body deep inside data with finder function returning boolean found or not
   *
   * @param traverseFunction
   * @param tree
   */
  traverse(
    traverseFunction: TraverseFunction<TBody>,
    { children }: { children?: Leaf<TBody>[] } = this.data,
  ): TBody | undefined {
    return children?.find((body, index) => {
      if (!body) {
        return false;
      }

      if (body.typeGroup && traverseFunction(body, children, index)) {
        return true;
      }

      // if callback returns true, ends forEach
      if (body.children) {
        this.traverse(traverseFunction, body);
      }
    });
  }
}
