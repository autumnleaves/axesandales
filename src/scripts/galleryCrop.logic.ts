/**
 * Pure helpers for cropping gallery photos to a fixed aspect ratio without
 * cutting off the model.
 *
 * The competition photos are a model on a black plinth against a smooth grey
 * backdrop, with the award printed on the plinth below the model. Detection
 * works on a blurred greyscale copy of the photo:
 *   - the backdrop is smooth, so the model's top is the first row with any
 *     real edge detail
 *   - the printed award label is the last band of very strong edges
 *   - the model stops where the plinth's solid dark band begins
 * The crop then keeps the whole model, keeps the label if it can, and
 * otherwise centres the model.
 */

export interface GreyImage {
  data: Uint8Array | Buffer; // One byte per pixel, row-major
  width: number;
  height: number;
}

export interface SubjectBounds {
  /** First row/column of the model. */
  start: number;
  /** Last row/column of the model (top of the plinth, for vertical bounds). */
  end: number;
  /** Last row of the printed award label below the model, if one was found. */
  labelEnd: number | null;
}

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Edge strength above which a row contains part of the model. */
const SUBJECT_EDGE = 12;
/** Edge strength of the printed label (crisp white text on black). */
const LABEL_EDGE = 60;
/** Pixels darker than this count as plinth. */
const PLINTH_DARK = 28;

const borderSkip = (length: number) => Math.max(1, Math.round(length * 0.02));

/** Strongest local gradient in each row, ignoring a thin border. */
export const rowEdgeProfile = ({ data, width, height }: GreyImage): number[] => {
  const skip = borderSkip(width);
  const profile: number[] = [];
  for (let y = 0; y < height - 1; y++) {
    let max = 0;
    for (let x = skip; x < width - skip - 1; x++) {
      const i = y * width + x;
      const gradient = Math.abs(data[i + 1] - data[i]) + Math.abs(data[i + width] - data[i]);
      if (gradient > max) max = gradient;
    }
    profile.push(max);
  }
  return profile;
};

/** Strongest local gradient in each column, ignoring a thin border. */
export const columnEdgeProfile = ({ data, width, height }: GreyImage): number[] => {
  const skip = borderSkip(height);
  const profile: number[] = [];
  for (let x = 0; x < width - 1; x++) {
    let max = 0;
    for (let y = skip; y < height - skip - 1; y++) {
      const i = y * width + x;
      const gradient = Math.abs(data[i + 1] - data[i]) + Math.abs(data[i + width] - data[i]);
      if (gradient > max) max = gradient;
    }
    profile.push(max);
  }
  return profile;
};

const darkFraction = ({ data, width }: GreyImage, y: number): number => {
  let dark = 0;
  for (let x = 0; x < width; x++) if (data[y * width + x] < PLINTH_DARK) dark++;
  return dark / width;
};

const firstIndex = (values: number[], predicate: (v: number) => boolean) => values.findIndex(predicate);
const lastIndex = (values: number[], predicate: (v: number) => boolean) => {
  for (let i = values.length - 1; i >= 0; i--) if (predicate(values[i])) return i;
  return -1;
};

/** Finds the model (and award label) along the vertical axis. Returns null if the image looks blank. */
export const detectVerticalSubject = (image: GreyImage): SubjectBounds | null => {
  const profile = rowEdgeProfile(image);
  const start = firstIndex(profile, v => v > SUBJECT_EDGE);
  if (start === -1) return null;
  const lastDetail = lastIndex(profile, v => v > SUBJECT_EDGE);

  // A label only counts if it's in the lower part of the image, below the model's top.
  const labelRow = lastIndex(profile, v => v > LABEL_EDGE);
  const labelEnd = labelRow > image.height * 0.6 && labelRow > start ? labelRow : null;

  // The plinth: measure how dark it typically is just above the label (or the
  // last detail), then walk up until that dark band ends. That's where the
  // model's base sits.
  const searchEnd = labelEnd ?? lastDetail;
  const bandStart = Math.max(start, searchEnd - Math.round(image.height * 0.2));
  const bandFractions: number[] = [];
  for (let y = bandStart; y <= searchEnd; y++) bandFractions.push(darkFraction(image, y));
  bandFractions.sort((a, b) => a - b);
  const reference = bandFractions[Math.floor(bandFractions.length / 2)] ?? 0;
  let end = lastDetail;
  if (reference >= 0.1) {
    // Step over short breaks such as the printed logo and award text; stop
    // once the band has clearly ended.
    const maxGap = Math.round(image.height * 0.06);
    let gap = 0;
    end = searchEnd;
    for (let y = searchEnd; y > start && gap <= maxGap; y--) {
      if (darkFraction(image, y) >= reference * 0.75) {
        end = y;
        gap = 0;
      } else {
        gap++;
      }
    }
  }
  return { start, end: Math.max(start, end), labelEnd };
};

/** Finds the model along the horizontal axis (for photos wider than the target ratio). */
export const detectHorizontalSubject = (image: GreyImage): SubjectBounds | null => {
  const profile = columnEdgeProfile(image);
  const start = firstIndex(profile, v => v > SUBJECT_EDGE);
  if (start === -1) return null;
  return { start, end: lastIndex(profile, v => v > SUBJECT_EDGE), labelEnd: null };
};

export interface CropOffsetResult {
  offset: number;
  warnings: string[];
}

/**
 * Chooses where a crop window of `cropLength` starts along an axis of `length`.
 * Keeps the whole subject (plus a margin) in frame, then the label if possible,
 * then centres the subject as closely as those allow.
 */
export const chooseCropOffset = (length: number, cropLength: number, subject: SubjectBounds | null): CropOffsetResult => {
  const maxOffset = length - cropLength;
  const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
  if (maxOffset <= 0) return { offset: 0, warnings: [] };
  if (!subject) return { offset: Math.round(maxOffset / 2), warnings: ['no subject detected; centre-cropped'] };

  const margin = Math.round(cropLength * 0.025);
  const ideal = Math.round((subject.start + subject.end) / 2 - cropLength / 2);
  let lo = Math.max(0, subject.end + margin - cropLength);
  const hi = Math.min(maxOffset, subject.start - margin);

  if (lo > hi) {
    // Subject plus margins is taller than the crop: keep it whole if at all possible, centred.
    const tightLo = Math.max(0, subject.end - cropLength + 1);
    const tightHi = Math.min(maxOffset, subject.start);
    if (tightLo > tightHi) {
      return { offset: clamp(ideal, 0, maxOffset), warnings: ['model is larger than the crop and will be cut off'] };
    }
    return { offset: clamp(ideal, tightLo, tightHi), warnings: ['model fills the crop with little or no margin'] };
  }

  const warnings: string[] = [];
  if (subject.labelEnd !== null) {
    const labelLo = subject.labelEnd + margin - cropLength;
    if (labelLo <= hi) lo = Math.max(lo, labelLo);
    else warnings.push('award label will be cut off to keep the model whole');
  }
  return { offset: clamp(ideal, lo, hi), warnings };
};

/** Parses "4:5" into a width/height ratio. */
export const parseAspectRatio = (value: string): number => {
  const match = value.match(/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
  const ratio = match ? Number(match[1]) / Number(match[2]) : NaN;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Invalid aspect ratio "${value}"; expected e.g. "4:5"`);
  return ratio;
};

/** The largest crop of the given ratio, and which axis it cuts. */
export const cropSize = (width: number, height: number, ratio: number) => {
  if (width / height > ratio) {
    return { axis: 'horizontal' as const, width: Math.round(height * ratio), height };
  }
  return { axis: 'vertical' as const, width, height: Math.min(height, Math.round(width / ratio)) };
};

/**
 * Crop rectangle for a photo. `analysed` is the greyscale analysis copy (any
 * scale); `override` is a manual offset in source pixels along the cropped axis.
 */
export const computeCrop = (
  width: number,
  height: number,
  ratio: number,
  analysed: GreyImage,
  override?: number,
): CropOffsetResult & { rect: CropRect } => {
  const size = cropSize(width, height, ratio);
  const vertical = size.axis === 'vertical';
  const length = vertical ? height : width;
  const cropLength = vertical ? size.height : size.width;
  const maxOffset = length - cropLength;

  let result: CropOffsetResult;
  if (override !== undefined) {
    result = { offset: Math.min(maxOffset, Math.max(0, Math.round(override))), warnings: [] };
  } else {
    const scale = length / (vertical ? analysed.height : analysed.width);
    const detected = vertical ? detectVerticalSubject(analysed) : detectHorizontalSubject(analysed);
    const subject = detected && {
      start: Math.floor(detected.start * scale),
      end: Math.ceil(detected.end * scale),
      labelEnd: detected.labelEnd === null ? null : Math.ceil(detected.labelEnd * scale),
    };
    result = chooseCropOffset(length, cropLength, subject);
  }

  const rect = vertical
    ? { left: 0, top: result.offset, width: size.width, height: size.height }
    : { left: result.offset, top: 0, width: size.width, height: size.height };
  return { ...result, rect };
};
