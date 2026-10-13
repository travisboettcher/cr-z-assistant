import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppVersion } from './AppVersion';

describe('AppVersion', () => {
  it('shortens a commit SHA and links to the commit', () => {
    const sha = '66ede8c0123456789abcdef0123456789abcdef0';
    render(<AppVersion version={sha} />);

    const link = screen.getByRole('link', { name: '66ede8c' });
    expect(link).toHaveAttribute(
      'href',
      `https://github.com/travisboettcher/cr-z-assistant/commit/${sha}`,
    );
  });

  it('shows any other label as it is, without a link', () => {
    render(<AppVersion version="local-test" />);

    expect(screen.getByText('local-test')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([undefined, '', '  '])('calls a build given %j a development build', (version) => {
    render(<AppVersion version={version} />);

    expect(screen.getByText('development')).toBeVisible();
  });
});
