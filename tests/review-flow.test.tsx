/**
 * Integration tests for the guest review flow state machine.
 *
 * jsdom note: screen gating in the real app is partly CSS (.screen.active,
 * .has-selection display rules) which jsdom does not apply, so these tests
 * assert on the class/attribute state machine — the same contract the CSS
 * consumes — rather than on visual visibility.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RestaurantReviewApp from '../app/page';

function getScreen(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not rendered`);
  return el;
}

const isActive = (id: string) => getScreen(id).classList.contains('active');

async function rateAndContinue(user: ReturnType<typeof userEvent.setup>, stars: 1 | 2 | 3 | 4 | 5) {
  await user.click(screen.getByRole('radio', { name: `Rate ${stars} out of 5 stars` }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  // Silence the dev-mode payload logging so test output stays readable.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  window.localStorage.clear();
});

describe('rating screen', () => {
  it('starts on the rating screen with Continue disabled', () => {
    render(<RestaurantReviewApp />);
    expect(isActive('screenRating')).toBe(true);
    expect(screen.getByRole('button', { name: 'Select a rating to continue' })).toBeDisabled();
  });

  it('selecting a star reveals the mood word and enables Continue', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await user.click(screen.getByRole('radio', { name: 'Rate 2 out of 5 stars' }));
    expect(document.getElementById('ratingContent')).toHaveClass('rated');
    expect(screen.getByText('Underwhelming')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('routes by rating bucket: 5→platforms, 3→improve, 1→sorry', async () => {
    const user = userEvent.setup();

    const { unmount: u1 } = render(<RestaurantReviewApp />);
    await rateAndContinue(user, 5);
    expect(isActive('screenPlatforms')).toBe(true);
    u1();

    const { unmount: u2 } = render(<RestaurantReviewApp />);
    await rateAndContinue(user, 3);
    expect(isActive('screenImprove')).toBe(true);
    u2();

    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 1);
    expect(isActive('screenSorry')).toBe(true);
  });
});

describe('sorry flow (1-2 stars)', () => {
  it('requires at least one tag, but the comment is optional', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 1);
    const sorry = within(getScreen('screenSorry'));

    // Send with no tags → tag-level validation, no submission.
    await user.click(sorry.getByRole('button', { name: 'Send to manager' }));
    expect(
      sorry.getByText('Please pick what went wrong, or message the manager privately.'),
    ).toBeInTheDocument();

    // Picking a tag clears the error and reveals the comment box.
    await user.click(sorry.getByRole('button', { name: /Food quality/ }));
    expect(sorry.queryByText(/Please pick what went wrong/)).not.toBeInTheDocument();
    expect(getScreen('screenSorry')).toHaveClass('has-selection');

    // Send with tags but NO comment → succeeds with the urgent copy.
    await user.click(sorry.getByRole('button', { name: 'Send to manager' }));
    await waitFor(() =>
      expect(screen.getByText('The manager is on it')).toBeInTheDocument(),
    );
  });

  it('preserves tags and draft comment across a contact-screen round trip', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 2);
    const sorry = within(getScreen('screenSorry'));

    await user.click(sorry.getByRole('button', { name: /Long wait/ }));
    // fireEvent.change instead of user.type: the app's deferred autofocus
    // (380ms after the first tag) races per-character typing in jsdom.
    // The subject under test is state preservation, not keystroke handling.
    fireEvent.change(sorry.getByLabelText('Your comment'), {
      target: { value: 'Forty minutes for starters.' },
    });

    // Peek at the anonymous contact screen, then go back.
    await user.click(sorry.getByRole('button', { name: /Contact manager anonymously/ }));
    expect(isActive('screenContact')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Back' }));

    // Draft must survive: tag still pressed, comment still there.
    expect(isActive('screenSorry')).toBe(true);
    expect(sorry.getByRole('button', { name: /Long wait/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(sorry.getByLabelText('Your comment')).toHaveValue('Forty minutes for starters.');
  });
});

describe('improve flow (3-4 stars)', () => {
  it('sends without validation and shows the private-feedback copy', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    const improve = within(getScreen('screenImprove'));

    await user.click(improve.getByRole('button', { name: 'Send to manager' }));
    await waitFor(() =>
      expect(screen.getByText('Thank you for telling us')).toBeInTheDocument(),
    );
  });
});

describe('platforms flow (5 stars)', () => {
  it('skip ("Maybe next time") shows the honest rated copy, not a posted claim', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 5);

    await user.click(screen.getByRole('button', { name: 'Maybe next time' }));
    await waitFor(() =>
      expect(screen.getByText('Thank you for the rating')).toBeInTheDocument(),
    );
    expect(screen.getByText('5-star rating saved')).toBeInTheDocument();
  });

  it('platform card opens the window synchronously and falls back on PLACEHOLDER urls', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 5);

    await user.click(screen.getByRole('button', { name: /Google/ }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0];
    expect(String(url)).not.toContain('PLACEHOLDER'); // demo venue is unconfigured → fallback
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    expect(error).toHaveBeenCalled(); // misconfiguration is loud
  });
});

describe('reset + language', () => {
  it('Done resets to a fresh rating screen', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    await user.click(
      within(getScreen('screenImprove')).getByRole('button', { name: 'Send to manager' }),
    );
    await waitFor(() => expect(screen.getByText('Thank you for telling us')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(isActive('screenRating')).toBe(true);
    expect(screen.getByRole('button', { name: 'Select a rating to continue' })).toBeDisabled();
  });

  it('language switch swaps the dictionary and persists the choice', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await user.click(screen.getByRole('button', { name: 'Vaihda suomeksi' }));
    expect(screen.getByText(/Millainen oli/)).toBeInTheDocument();
    expect(window.localStorage.getItem('bistro-lang')).toBe('fi');
  });
});
