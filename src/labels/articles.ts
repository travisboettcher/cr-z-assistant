/**
 * "a" or "an", and the names that take neither.
 *
 * Sixteen lines of the permanent, uneditable campaign log read "a Extra Bed",
 * "a Restraints" or "rolling a 8" by turn 17 of a twenty-turn campaign (#173).
 * The article was fixed text beside an interpolation, which is right for most
 * of the catalogue and wrong for the rest — and a log is the one part of this
 * app a player cannot go back and correct.
 *
 * Presentation only, like the rest of the label modules.
 */

/**
 * Names that are plural or mass nouns, so "a" is wrong and "an" no better.
 *
 * Listed rather than detected. "Restraints" ends in an s and "Ropes Course"
 * does not, and a rule about suffixes would get one of them wrong the day the
 * catalogue grows — while a name added here is a decision somebody made on
 * purpose.
 */
const TAKES_NO_ARTICLE = new Set(['Restraints', 'Containment', 'Refrigeration', 'Shelving']);

/** A name with the article it takes, or alone where it takes none. */
export function withArticle(name: string): string {
  if (TAKES_NO_ARTICLE.has(name)) return name;

  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * The article a number takes, which is about how it is *said*.
 *
 * Eight and the numbers that start with it, eleven and eighteen: "an 8 against
 * a Siege Threat of 11". A d10 reaches the first and a Siege Threat the others.
 */
export function articleForNumber(value: number): 'a' | 'an' {
  return /^(8|11|18)/.test(String(value)) ? 'an' : 'a';
}
