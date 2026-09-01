import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageRef } from './PageRef';

describe('PageRef', () => {
  it('renders a single page', () => {
    render(<PageRef pages={41} />);

    expect(screen.getByText(/pg\.\s*41/)).toBeInTheDocument();
  });

  it('renders a range', () => {
    render(<PageRef pages="38–39" />);

    expect(screen.getByText(/pg\.\s*38–39/)).toBeInTheDocument();
  });

  /**
   * The abbreviation is for the eye only. Read aloud, "pg." is either spelled
   * out or mangled, so the announced text is a sentence and the visible text is
   * hidden from the accessibility tree.
   */
  it('announces a sentence rather than the abbreviation', () => {
    render(<PageRef pages={41} />);

    expect(screen.getByText('Rulebook page 41')).toBeInTheDocument();
    expect(screen.getByText(/pg\./)).toHaveAttribute('aria-hidden', 'true');
  });
});
