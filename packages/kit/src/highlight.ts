import {
  type BundledLanguage,
  type BundledTheme,
  bundledLanguages,
  bundledThemes,
  codeToHtml,
} from 'shiki';

export type HighlightTheme = BundledTheme | 'github-light' | 'github-dark';

/**
 * Highlights source code to safe HTML using Shiki on a dedicated lazy subpath.
 */
export async function highlightCode(
  code: string,
  lang: string,
  theme: string = 'github-light',
): Promise<string> {
  const resolvedLang = (lang in bundledLanguages ? lang : 'text') as BundledLanguage | 'text';
  const resolvedTheme = (theme in bundledThemes ? theme : 'github-light') as BundledTheme;
  return codeToHtml(code, {
    lang: resolvedLang,
    theme: resolvedTheme,
  });
}
