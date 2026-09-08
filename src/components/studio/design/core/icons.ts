/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Icon name registry
 *
 * Every icon name used in the v2 design canvas is centralized here so we
 * can verify them against the `@iconify-json/ci` (coolicons) collection in
 * one place. If coolicons doesn't ship a glyph for a concept, we substitute
 * the closest match (verified to exist in the set).
 *
 * Verified against `node_modules/@iconify-json/ci/icons.json` (715 icons).
 */
export const ICON = {
  // tool rail
  select: 'move',
  hand: 'mouse',
  frame: 'grid-big',
  rect: 'add-plus-square',
  ellipse: 'add-plus-circle',
  triangle: 'triangle',
  line: 'slider-01',
  polygon: 'add-plus-square', // no hexagon in coolicons; reuse square
  star: 'star',
  text: 'text',
  pen: 'edit-pencil-01',
  comment: 'message-circle',

  // history / edit
  undo: 'arrow-left-md',
  redo: 'arrow-right-md',
  duplicate: 'copy',
  delete: 'trash-empty',
  group: 'group',
  ungroup: 'group', // coolicons has no ungroup; reuse group
  refresh: 'refresh',

  // navigation / ui
  chevronDown: 'chevron-down',
  chevronRight: 'chevron-right',
  close: 'close-md',
  search: 'search',
  plus: 'plus',
  minus: 'minus',
  play: 'play',
  share: 'share',
  download: 'download',
  code: 'code',
  image: 'image-01',
  file: 'file-blank',
  fileUpload: 'file-upload',
  folderUpload: 'folder-download',
  layers: 'layers',
  layer: 'layer',
  shapes: 'add-plus-square',
  grid: 'grid-big',
  show: 'show',
  hide: 'hide',
  lock: 'lock',
  lockOpen: 'lock-open',
  copy: 'copy',

  // zoom
  zoomIn: 'magnifying-glass-plus',
  zoomOut: 'magnifying-glass-minus',

  // align / arrange (coolicons only has the four text-align glyphs, so we
  // reuse them for alignment and use arrow icons for distribute + arrange)
  alignLeft: 'text-align-left',
  alignCenter: 'text-align-center',
  alignRight: 'text-align-right',
  alignTop: 'arrow-up-md',
  alignMiddle: 'text-align-center',
  alignBottom: 'arrow-down-md',
  distributeH: 'arrow-left-right',
  distributeV: 'arrow-down-up',
  bringFront: 'forward',
  bringForward: 'forward',
  sendBackward: 'skip-back',
  sendBack: 'skip-back',

  // effects / misc
  shadow: 'add-plus',
  blur: 'search-small',
  flip: 'refresh',
  bold: 'text',
  italic: 'text',
  underline: 'text',
} as const;

export type IconName = keyof typeof ICON;