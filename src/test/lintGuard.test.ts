// @vitest-environment node

/**
 * The #138 guard, tested the way a fix is tested.
 *
 * **A guard is a claim about a surface, and the claim needs checking.** A rule
 * that passes because nothing currently violates it looks exactly like a rule
 * that passes because it cannot see the violation — and round three found two
 * independent holes in this one, neither of them a live violation at the time
 * (#166). The rule named `occupants` and not its thin wrapper `occupantAt`, and
 * it was attached to `src/engine` and `src/ui` while `src/state` and
 * `src/persistence` hold whole campaigns too.
 *
 * So this lints probe modules that *should* fail, one per covered directory and
 * one per restricted name, and asserts each one does. It runs the project's own
 * `eslint.config.js` rather than a copy, so a rule that is narrowed or detached
 * fails here rather than going quiet.
 */

import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

/** The rule's own id, so a probe that fails for some other reason is not a pass. */
const RULE = 'no-restricted-imports';

async function messagesFor(filePath: string, source: string): Promise<readonly string[]> {
  const [result] = await eslint.lintText(source, { filePath, warnIgnored: false });

  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
}

/** Every directory the rule claims, and a module in each that would break it. */
const COVERED = [
  ['src/engine/healing.ts', 'the engine'],
  ['src/ui/BaseSheet.tsx', 'the UI'],
  ['src/state/campaignStore.ts', 'the store'],
  ['src/persistence/exportFile.ts', 'persistence'],
] as const;

describe('the raw-occupants rule', () => {
  it.each(COVERED)('refuses `occupants` in %s (%s)', async (filePath) => {
    const said = await messagesFor(filePath, "import { occupants } from '../engine/base';\n");

    expect(said).toHaveLength(1);
    expect(said[0]).toContain('suppliedOccupants');
  });

  /**
   * The first hole. `occupantAt` returns the same raw `Occupant`, and two
   * modules imported it while off the allowlist — free to read `.power` and
   * `.water` with lint exiting 0.
   */
  it.each(COVERED)('refuses `occupantAt` in %s (%s)', async (filePath) => {
    const said = await messagesFor(filePath, "import { occupantAt } from '../engine/base';\n");

    expect(said).toHaveLength(1);
  });

  /** Both at once is one message per name, not one for the import. */
  it('names each restricted import it finds', async () => {
    const said = await messagesFor(
      'src/ui/BaseSheet.tsx',
      "import { occupants, occupantAt } from '../engine/base';\n",
    );

    expect(said).toHaveLength(2);
  });

  /**
   * The rule fires on the *name*, not on the file's own spelling of it. Alias,
   * namespace and re-export evasions were all probed by hand in round three and
   * all errored; the alias is kept here because it is the one a refactor
   * reaches for by accident.
   */
  it('is not fooled by an alias', async () => {
    const said = await messagesFor(
      'src/ui/BaseSheet.tsx',
      "import { occupants as standing } from '../engine/base';\n",
    );

    expect(said).toHaveLength(1);
  });

  /** And the resolved reader is what the rule exists to push callers towards. */
  it('permits `suppliedOccupants` everywhere', async () => {
    for (const [filePath] of COVERED) {
      expect(
        await messagesFor(filePath, "import { suppliedOccupants } from '../engine/utilities';\n"),
        `${filePath} refused the resolved list`,
      ).toEqual([]);
    }
  });

  /**
   * The allowlist is still an allowlist. These four build the resolution and
   * two more ask the narrower layout question, so the rule must *not* fire on
   * them — a guard that refused everything would pass every test above and make
   * the codebase unbuildable.
   */
  it.each([
    'src/engine/base.ts',
    'src/engine/utilities.ts',
    'src/engine/assignments.ts',
    'src/engine/build.ts',
    'src/engine/projects.ts',
    'src/engine/upgrade.ts',
  ])('leaves %s alone, because the resolution is built there', async (filePath) => {
    expect(await messagesFor(filePath, "import { occupants } from './base';\n")).toEqual([]);
  });
});
