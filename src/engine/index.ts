// The engine's public surface.
export { frame, mixModels, envelope, VIEW, RADIUS, type RenderModel, type FrameInput, type Layer, type Trail } from './frame';
export { DEFAULT_STATE, DEFAULT_CYCLE, IDLE_CYCLE, PALETTE, MAX_CLIPS, cloneState, loopLength, SHAPES, EXPRESSIONS, ANIMS, type BlobState, type Clip, type Shape, type Expression, type Anim } from './state';
export { DEFAULT_DUR, SHOW_AT, PART_SLOTS, TRAIL_SLOTS, TRAIL_POINTS } from './animations';
export { autoEyeColor, mixHex, isHex } from './color';
