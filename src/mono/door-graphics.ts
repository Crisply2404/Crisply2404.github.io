import type { DoorGraphicId, DoorGraphics } from '../types';
import notesTitle from './icons/notes-title.svg?raw';
import essaysTitle from './icons/essays-title.svg?raw';
import chuanZiTitle from './icons/chuan-zi-title.svg?raw';
import notesSymbol from './icons/notes-symbol.svg?raw';
import essaysSymbol from './icons/essays-symbol.svg?raw';
import chuanZiSymbol from './icons/chuan-zi-symbol.svg?raw';

export const doorGraphics: Record<DoorGraphicId, DoorGraphics> = {
  notes: { title: notesTitle, titleHeight: 14, symbol: notesSymbol },
  essays: { title: essaysTitle, titleHeight: 14, symbol: essaysSymbol },
  'chuan-zi': { title: chuanZiTitle, titleHeight: 20, symbol: chuanZiSymbol },
};
