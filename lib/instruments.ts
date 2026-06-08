import type { Instrument } from './music-model';

export const INSTRUMENTS: Instrument[] = [
  // Keyboard
  { id: 'piano',       name: 'Piano',           abbreviation: 'Pno.',  family: 'keyboard',   defaultClef: 'treble', secondaryClef: 'bass', midiProgram: 0,   transposition: 0 },
  { id: 'organ',       name: 'Organ',            abbreviation: 'Org.',  family: 'keyboard',   defaultClef: 'treble', secondaryClef: 'bass', midiProgram: 19,  transposition: 0 },
  { id: 'harpsichord', name: 'Harpsichord',      abbreviation: 'Hpd.', family: 'keyboard',   defaultClef: 'treble', secondaryClef: 'bass', midiProgram: 6,   transposition: 0 },
  { id: 'celesta',     name: 'Celesta',          abbreviation: 'Cel.', family: 'keyboard',   defaultClef: 'treble',                        midiProgram: 8,   transposition: 0 },

  // Strings
  { id: 'violin',      name: 'Violin',           abbreviation: 'Vln.', family: 'strings',    defaultClef: 'treble',                        midiProgram: 40,  transposition: 0 },
  { id: 'viola',       name: 'Viola',            abbreviation: 'Vla.', family: 'strings',    defaultClef: 'alto',                          midiProgram: 41,  transposition: 0 },
  { id: 'cello',       name: 'Cello',            abbreviation: 'Vc.',  family: 'strings',    defaultClef: 'bass',                          midiProgram: 42,  transposition: 0 },
  { id: 'doublebass',  name: 'Double Bass',      abbreviation: 'Db.',  family: 'strings',    defaultClef: 'bass',                          midiProgram: 43,  transposition: -12 },
  { id: 'harp',        name: 'Harp',             abbreviation: 'Hp.',  family: 'strings',    defaultClef: 'treble', secondaryClef: 'bass', midiProgram: 46,  transposition: 0 },
  { id: 'guitar',      name: 'Guitar',           abbreviation: 'Gtr.', family: 'strings',    defaultClef: 'treble',                        midiProgram: 25,  transposition: -12 },

  // Woodwinds
  { id: 'flute',       name: 'Flute',            abbreviation: 'Fl.',  family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 73,  transposition: 0 },
  { id: 'piccolo',     name: 'Piccolo',          abbreviation: 'Picc.',family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 72,  transposition: 12 },
  { id: 'oboe',        name: 'Oboe',             abbreviation: 'Ob.',  family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 68,  transposition: 0 },
  { id: 'corAnglais',  name: 'Cor Anglais',      abbreviation: 'C.A.', family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 69,  transposition: -7 },
  { id: 'clarinet',    name: 'Clarinet (Bb)',     abbreviation: 'Cl.',  family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 71,  transposition: -2 },
  { id: 'bassClari',   name: 'Bass Clarinet',    abbreviation: 'B.Cl.',family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 71,  transposition: -14 },
  { id: 'bassoon',     name: 'Bassoon',          abbreviation: 'Bsn.', family: 'woodwinds',  defaultClef: 'bass',                          midiProgram: 70,  transposition: 0 },
  { id: 'altoSax',     name: 'Alto Saxophone',   abbreviation: 'A.Sx.',family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 65,  transposition: -9 },
  { id: 'tenorSax',    name: 'Tenor Saxophone',  abbreviation: 'T.Sx.',family: 'woodwinds',  defaultClef: 'treble',                        midiProgram: 66,  transposition: -14 },

  // Brass
  { id: 'trumpet',     name: 'Trumpet (Bb)',     abbreviation: 'Tpt.', family: 'brass',      defaultClef: 'treble',                        midiProgram: 56,  transposition: -2 },
  { id: 'frenchHorn',  name: 'French Horn',      abbreviation: 'Hn.',  family: 'brass',      defaultClef: 'treble',                        midiProgram: 60,  transposition: -7 },
  { id: 'trombone',    name: 'Trombone',         abbreviation: 'Tbn.', family: 'brass',      defaultClef: 'bass',                          midiProgram: 57,  transposition: 0 },
  { id: 'tuba',        name: 'Tuba',             abbreviation: 'Tba.', family: 'brass',      defaultClef: 'bass',                          midiProgram: 58,  transposition: 0 },
  { id: 'flugelhorn',  name: 'Flugelhorn',       abbreviation: 'Flg.', family: 'brass',      defaultClef: 'treble',                        midiProgram: 56,  transposition: -2 },

  // Percussion
  { id: 'snare',       name: 'Snare Drum',       abbreviation: 'S.D.', family: 'percussion', defaultClef: 'percussion',                    midiProgram: 0,   transposition: 0 },
  { id: 'bassDrum',    name: 'Bass Drum',        abbreviation: 'B.D.', family: 'percussion', defaultClef: 'percussion',                    midiProgram: 0,   transposition: 0 },
  { id: 'timpani',     name: 'Timpani',          abbreviation: 'Timp.',family: 'percussion', defaultClef: 'bass',                          midiProgram: 47,  transposition: 0 },
  { id: 'xylophone',   name: 'Xylophone',        abbreviation: 'Xyl.', family: 'percussion', defaultClef: 'treble',                        midiProgram: 13,  transposition: 12 },
  { id: 'marimba',     name: 'Marimba',          abbreviation: 'Mar.', family: 'percussion', defaultClef: 'treble',                        midiProgram: 12,  transposition: 0 },

  // Voice
  { id: 'soprano',     name: 'Soprano',          abbreviation: 'S.',   family: 'voice',      defaultClef: 'treble',                        midiProgram: 52,  transposition: 0 },
  { id: 'mezzosop',    name: 'Mezzo-Soprano',    abbreviation: 'M.S.', family: 'voice',      defaultClef: 'treble',                        midiProgram: 52,  transposition: 0 },
  { id: 'tenor',       name: 'Tenor',            abbreviation: 'T.',   family: 'voice',      defaultClef: 'treble',                        midiProgram: 52,  transposition: 0 },
  { id: 'baritone',    name: 'Baritone',         abbreviation: 'Bar.', family: 'voice',      defaultClef: 'bass',                          midiProgram: 52,  transposition: 0 },
  { id: 'bass',        name: 'Bass',             abbreviation: 'B.',   family: 'voice',      defaultClef: 'bass',                          midiProgram: 52,  transposition: 0 },
];

export const FAMILY_LABELS: Record<string, string> = {
  keyboard:   'Keyboard',
  strings:    'Strings',
  woodwinds:  'Woodwinds',
  brass:      'Brass',
  percussion: 'Percussion',
  voice:      'Voice',
};

export function getInstrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find(i => i.id === id);
}

export function getInstrumentsByFamily(family: string): Instrument[] {
  return INSTRUMENTS.filter(i => i.family === family);
}
