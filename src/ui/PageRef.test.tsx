import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageRef } from './PageRef';

describe('PageRef', () => {
  it('renders a single page', () => {
    render(<PageRef pages={8} />);

    expect(screen.getByText(/pg\.\s*8/)).toBeInTheDocument();
  });

  it('renders a range', () => {
    render(<PageRef pages="13–14" />);

    expect(screen.getByText(/pg\.\s*13–14/)).toBeInTheDocument();
  });

  /**
   * The abbreviation is for the eye only. Read aloud, "pg." is either spelled
   * out or mangled, so the announced text is a sentence and the visible text is
   * hidden from the accessibility tree.
   */
  it('announces a sentence rather than the abbreviation', () => {
    render(<PageRef pages={8} />);

    expect(screen.getByText('Rulebook page 8')).toBeInTheDocument();
    expect(screen.getByText(/pg\./)).toHaveAttribute('aria-hidden', 'true');
  });
});
