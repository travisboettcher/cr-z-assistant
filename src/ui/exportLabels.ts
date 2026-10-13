/**
 * Words for where the campaign is kept, shared by the screens that say it.
 */

/**
 * Whether the browser's copy matches an exported file, in a few words — for
 * the header menu, which repeats it where it cannot be missed.
 */
export function exportState(everExported: boolean, unsavedChanges: boolean): string {
  if (!everExported) return 'Never exported';
  return unsavedChanges ? 'Changed since your last export' : 'Matches your last export';
}
