import { describe, it, expect } from 'vitest';
import {
  chooseCropOffset,
  computeCrop,
  cropSize,
  detectHorizontalSubject,
  detectVerticalSubject,
  parseAspectRatio,
  type GreyImage,
} from '../scripts/galleryCrop.logic';

const BACKDROP = 120;

const blankImage = (width: number, height: number): GreyImage =>
  ({ data: new Uint8Array(width * height).fill(BACKDROP), width, height });

const paint = (image: GreyImage, x0: number, x1: number, y0: number, y1: number, value: (x: number, y: number) => number) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) image.data[y * image.width + x] = value(x, y);
};

/** A detailed "model" (checkerboard) on a black plinth with soft edges, and white "label" text on the plinth. */
const competitionPhoto = (): GreyImage => {
  const image = blankImage(100, 200);
  // Plinth: solid black in the middle, ramping smoothly to the backdrop at the sides.
  paint(image, 20, 80, 80, 200, x => {
    const distance = Math.min(x - 20, 79 - x);
    return distance >= 15 ? 10 : Math.round(BACKDROP - (BACKDROP - 10) * (distance / 15));
  });
  paint(image, 40, 60, 40, 80, (x, y) => ((x + y) % 2 ? 0 : 250)); // Model, rows 40-79
  paint(image, 40, 60, 150, 156, (x, y) => ((x + y) % 2 ? 10 : 250)); // Label text, rows 150-155
  return image;
};

describe('parseAspectRatio', () => {
  it('parses width:height', () => {
    expect(parseAspectRatio('4:5')).toBeCloseTo(0.8);
    expect(parseAspectRatio(' 16 : 9 ')).toBeCloseTo(16 / 9);
  });

  it('rejects invalid ratios', () => {
    expect(() => parseAspectRatio('4x5')).toThrow(/Invalid aspect ratio/);
    expect(() => parseAspectRatio('0:5')).toThrow(/Invalid aspect ratio/);
  });
});

describe('cropSize', () => {
  it('trims height from photos taller than the ratio', () => {
    expect(cropSize(1365, 2048, 0.8)).toEqual({ axis: 'vertical', width: 1365, height: 1706 });
  });

  it('trims width from photos wider than the ratio', () => {
    expect(cropSize(2000, 1000, 0.8)).toEqual({ axis: 'horizontal', width: 800, height: 1000 });
  });

  it('leaves photos already at the ratio alone', () => {
    expect(cropSize(800, 1000, 0.8)).toEqual({ axis: 'vertical', width: 800, height: 1000 });
  });
});

describe('chooseCropOffset', () => {
  it('centres the subject when nothing else constrains it', () => {
    expect(chooseCropOffset(1000, 500, { start: 400, end: 600, labelEnd: null })).toEqual({ offset: 250, warnings: [] });
  });

  it('never cuts the top of the model', () => {
    // Centring would start at 275, cutting the top at 300 too close; keep a margin above it.
    const { offset } = chooseCropOffset(1000, 500, { start: 290, end: 760, labelEnd: null });
    expect(offset).toBeLessThanOrEqual(290 - 13);
    expect(offset + 500).toBeGreaterThanOrEqual(760);
  });

  it('keeps the label in frame at the expense of centring', () => {
    const { offset, warnings } = chooseCropOffset(1000, 500, { start: 400, end: 600, labelEnd: 800 });
    expect(offset + 500).toBeGreaterThanOrEqual(800 + 13);
    expect(offset).toBeLessThanOrEqual(400 - 13);
    expect(warnings).toEqual([]);
  });

  it('gives up the label rather than the model', () => {
    const { offset, warnings } = chooseCropOffset(1000, 500, { start: 100, end: 500, labelEnd: 900 });
    expect(offset).toBeLessThanOrEqual(100);
    expect(warnings.join()).toMatch(/label will be cut off/);
  });

  it('warns when the model is taller than the crop', () => {
    expect(chooseCropOffset(1000, 500, { start: 100, end: 590, labelEnd: null }).warnings.join()).toMatch(/little or no margin/);
    expect(chooseCropOffset(1000, 500, { start: 100, end: 900, labelEnd: null }).warnings.join()).toMatch(/will be cut off/);
  });

  it('centre-crops when no subject was found, and does nothing when there is nothing to trim', () => {
    expect(chooseCropOffset(1000, 500, null).offset).toBe(250);
    expect(chooseCropOffset(500, 500, null)).toEqual({ offset: 0, warnings: [] });
  });
});

describe('detectVerticalSubject', () => {
  it('finds the model top, the top of the plinth and the label', () => {
    const subject = detectVerticalSubject(competitionPhoto());
    expect(subject?.start).toBeGreaterThanOrEqual(38);
    expect(subject?.start).toBeLessThanOrEqual(40);
    expect(subject?.end).toBeGreaterThanOrEqual(79);
    expect(subject?.end).toBeLessThanOrEqual(82);
    expect(subject?.labelEnd).toBeGreaterThanOrEqual(154);
    expect(subject?.labelEnd).toBeLessThanOrEqual(156);
  });

  it('returns null for a blank image', () => {
    expect(detectVerticalSubject(blankImage(50, 100))).toBeNull();
  });
});

describe('detectHorizontalSubject', () => {
  it('finds the columns the model occupies', () => {
    const image = blankImage(200, 100);
    paint(image, 150, 170, 30, 70, (x, y) => ((x + y) % 2 ? 0 : 250));
    const subject = detectHorizontalSubject(image);
    expect(subject?.start).toBeGreaterThanOrEqual(148);
    expect(subject?.end).toBeLessThanOrEqual(170);
  });
});

describe('computeCrop', () => {
  it('crops a portrait photo to keep the whole model and label', () => {
    const { rect, warnings } = computeCrop(100, 200, 0.8, competitionPhoto());
    expect(rect).toMatchObject({ left: 0, width: 100, height: 125 });
    expect(rect.top).toBeLessThanOrEqual(38); // Model top at ~39 stays in frame
    expect(rect.top + rect.height).toBeGreaterThanOrEqual(157); // Label bottom at ~155 stays in frame
    expect(warnings).toEqual([]);
  });

  it('maps detections from a smaller analysis copy back to full size', () => {
    const { rect } = computeCrop(400, 800, 0.8, competitionPhoto());
    expect(rect).toMatchObject({ left: 0, width: 400, height: 500 });
    expect(rect.top).toBeLessThanOrEqual(152);
    expect(rect.top + rect.height).toBeGreaterThanOrEqual(628);
  });

  it('crops a landscape photo horizontally around the model', () => {
    const image = blankImage(200, 100);
    paint(image, 150, 170, 30, 70, (x, y) => ((x + y) % 2 ? 0 : 250));
    const { rect } = computeCrop(200, 100, 0.8, image);
    expect(rect).toMatchObject({ top: 0, width: 80, height: 100 });
    expect(rect.left).toBeLessThanOrEqual(148);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual(171);
  });

  it('uses a manual offset when given, clamped to the photo', () => {
    expect(computeCrop(100, 200, 0.8, competitionPhoto(), 10).rect.top).toBe(10);
    expect(computeCrop(100, 200, 0.8, competitionPhoto(), 999).rect.top).toBe(75);
  });
});
