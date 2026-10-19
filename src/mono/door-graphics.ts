import type { DoorGraphicId, DoorGraphics } from '../types';
import notesSymbol from './icons/notes-symbol.svg?raw';
import essaysSymbol from './icons/essays-symbol.svg?raw';
import chuanZiSymbol from './icons/chuan-zi-symbol.svg?raw';
import hockeySymbol from './icons/hockey-symbol.svg?raw';

export const doorGraphics: Record<DoorGraphicId, DoorGraphics> = {
  notes: { title: 'Notes', symbol: notesSymbol },
  essays: { title: 'Essays', symbol: essaysSymbol },
  'chuan-zi': { symbol: chuanZiSymbol },
  hockey: { symbol: hockeySymbol },
};
