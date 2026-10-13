/**
 * Which build is on screen, so whoever is looking at a deployment can tell
 * what is on it without asking.
 *
 * The version is the commit SHA the publish workflow passes into the image
 * build. A full SHA is shortened the way git shortens it and links to the
 * commit; anything else — a local build given some other label — is shown as
 * it is, and a build given nothing says it is a development build rather than
 * pretending to be a release.
 */

const REPOSITORY = 'https://github.com/travisboettcher/cr-z-assistant';

const FULL_SHA = /^[0-9a-f]{40}$/;

export function AppVersion({ version }: { readonly version: string | undefined }) {
  const label = version?.trim() ?? '';

  return (
    <p>
      Version{' '}
      {FULL_SHA.test(label) ? (
        <a
          href={`${REPOSITORY}/commit/${label}`}
          className="font-mono underline underline-offset-2 hover:text-stone-900 dark:hover:text-stone-100"
        >
          {label.slice(0, 7)}
        </a>
      ) : (
        <span className="font-mono">{label === '' ? 'development' : label}</span>
      )}
    </p>
  );
}
