// Shared color palette for the v2 editor UI.
// Tuned from Figma mockups + ScoreSynth editor reference.

// Palette synced with ScoreSynth brand (../ScoreSynth/app/globals.css and
// public/logos/logo-scoresynth-mark.svg).
//   body bg     #211817   warm brown-black
//   accent red  #c0392b   (also used for ::selection)
//   logo edge   #AA3733   secondary red
//   scrollbar   #3d2a28
//   placeholder #6b5452
export const C = {
  // Backgrounds
  bg:           '#211817',          // ScoreSynth body bg
  canvas:       '#2a2524',          // score area (slightly lighter than bg)
  panel:        '#1a1312',          // floating panels: deeper than bg
  panelLighter: '#2a221f',
  topbar:       '#161616',          // matches logo background

  // Borders
  border:      'rgba(255,255,255,0.07)',
  borderLight: 'rgba(255,255,255,0.05)',

  // Text
  text:   '#ffffff',                // ScoreSynth uses pure white
  dimmed: '#9a8a88',
  muted:  '#6b5452',                // ScoreSynth placeholder

  // Accents
  red:       '#c0392b',             // primary brand red
  redDark:   '#AA3733',             // logo border secondary red
  blue:      '#4dabf7',
  yellow:    '#f2c94c',
  scrollbar: '#3d2a28',

  // Buttons
  btnBg:     'rgba(255,255,255,0.06)',
  btnHover:  'rgba(255,255,255,0.10)',
  btnBorder: 'rgba(255,255,255,0.10)',
  activeBg:  'rgba(255,255,255,0.12)',

  // Active state for selected tool button (red highlight)
  activeRed:       'rgba(192,57,43,0.22)',
  activeRedBorder: 'rgba(192,57,43,0.6)',
} as const;

export type ColorKey = keyof typeof C;
