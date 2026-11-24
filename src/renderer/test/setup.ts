import { cleanup } from '@testing-library/react';
import { mockConvertFileSrc } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, vi } from 'vitest';

// jsdom has no layout engine or OS color scheme.
window.matchMedia = (media) =>
  Object.assign(new EventTarget(), {
    media,
    matches: false,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });
Range.prototype.getClientRects = () => document.body.getClientRects();
Range.prototype.getBoundingClientRect = () => new DOMRect();
beforeEach(() => mockConvertFileSrc('windows'));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});
