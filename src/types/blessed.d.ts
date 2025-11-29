// Extended type declarations for blessed
// The @types/blessed package covers most usage, but some patterns need extension

import 'blessed';

declare module 'blessed' {
  namespace Widgets {
    interface ListElement {
      selected: number;
      childBase: number;
    }

    interface Screen {
      program: BlessedProgram;
      // Override to support string arrays
      key(keys: string | string[], callback: () => void): void;
      unkey(keys: string | string[], callback: () => void): void;
      onceKey(keys: string | string[], callback: () => void): void;
    }

    interface BlessedProgram {
      on(event: 'keypress', callback: (ch: string | null, key: KeyEventData) => void): this;
      removeListener(event: 'keypress', callback: (ch: string | null, key: KeyEventData) => void): this;
    }

    interface KeyEventData {
      name: string;
      ctrl: boolean;
      meta: boolean;
      shift: boolean;
      sequence: string;
      full: string;
    }
  }
}
