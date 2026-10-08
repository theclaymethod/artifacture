import type { AlignedWord } from './narration-cues';

export type RecognizedWord = Readonly<{ text: string; start: number; end: number }>;
export type ScriptLine = Readonly<{ id: string; text: string }>;
export type ScriptWordTiming = Readonly<{ text: string; start: number; end: number; alignment: 'measured' | 'interpolated' }>;
export type AlignedScriptLine = Readonly<{ id: string; start: number; end: number; words: readonly ScriptWordTiming[] }>;
export type TranscriptDifference = Readonly<{ kind: 'missing' | 'added' | 'changed'; script: string; heard: string }>;
export type SpeechMatchOptions = Readonly<{
  /** Recognized words that carry no script word, such as "dot" when SKILL.md is read aloud. */
  ignore?: readonly string[];
  /** Normalized spoken form → normalized script form, applied before matching. */
  aliases?: Readonly<Record<string, string>>;
}>;

export function normalizeSpokenWord(word: string, options?: SpeechMatchOptions): string;
export function alignScript(lines: readonly ScriptLine[], recognized: readonly RecognizedWord[], options?: SpeechMatchOptions): readonly AlignedScriptLine[];
export function toAlignedWords(line: AlignedScriptLine): readonly AlignedWord[];
export function compareTranscript(scriptText: string, recognized: readonly RecognizedWord[], options?: SpeechMatchOptions): readonly TranscriptDifference[];
