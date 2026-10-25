import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

if (typeof window !== 'undefined') {
  try {
    loader.config({ monaco });
  } catch (err) {
    console.warn('Failed to configure local Monaco loader:', err);
  }
}

export { monaco, loader };
