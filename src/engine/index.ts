// The engine's public surface.
export { frame, VIEW, RADIUS, type RenderModel, type FrameInput, type Layer } from './frame';
export { DEFAULT_STATE, PALETTE, MAX_CLIPS, cloneState, loopLength, SHAPES, EYES, EXPRESSIONS, ANIMS, type BlobState, type Clip, type Background, type Shape, type Eye, type Expression, type Anim } from './state';
export { DEFAULT_DUR } from './animations';
export { autoEyeColor, mixHex, isHex } from './color';
