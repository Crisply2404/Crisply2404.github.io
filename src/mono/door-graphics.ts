import type { DoorGraphicId, DoorGraphics } from '../types';
import notesSymbol from './icons/notes-symbol.svg?raw';
import essaysSymbol from './icons/essays-symbol.svg?raw';
import chuanZiSymbol from './icons/chuan-zi-symbol.svg?raw';

export const doorGraphics: Record<DoorGraphicId, DoorGraphics> = {
  notes: { title: 'NOTES', symbol: notesSymbol },
  essays: { title: 'ESSAYS', symbol: essaysSymbol },
  'chuan-zi': { symbol: chuanZiSymbol },
};
