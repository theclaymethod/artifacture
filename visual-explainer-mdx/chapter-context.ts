import { createContext } from 'react';

/** The id of the Section that a component renders in, or null outside a Section. */
export const ChapterContext = createContext<string | null>(null);
