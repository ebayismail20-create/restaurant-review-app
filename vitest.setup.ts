import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement layout-dependent APIs the app calls during screen
// transitions. Stub them so flows can be exercised without console noise or
// TypeErrors inside deferred callbacks.
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
Element.prototype.scrollIntoView = vi.fn();
