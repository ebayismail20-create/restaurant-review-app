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
  window.localStorage.clear();
  // notifyManager POSTs to /api/submissions; stub fetch with a 201 so the
  // flow reaches the success screens. The endpoint itself is covered by the
  // schema test and the live integration check.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'test-id' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
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

describe('back navigation (state preservation)', () => {
  it('Back keeps the rating lit — no reset to the blank logo screen', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    expect(isActive('screenImprove')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    // Rating screen again, but the choice survives: stars lit, brand mark
    // collapsed (.rated), and Continue ready — not the disabled blank state.
    expect(isActive('screenRating')).toBe(true);
    expect(document.getElementById('ratingContent')).toHaveClass('rated');
    expect(screen.getByRole('radio', { name: 'Rate 4 out of 5 stars' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('adjusting within the same bucket (4→3) keeps the drafted reason', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    await user.click(within(getScreen('screenImprove')).getByRole('button', { name: 'Food' }));

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('radio', { name: 'Rate 3 out of 5 stars' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(isActive('screenImprove')).toBe(true);
    expect(within(getScreen('screenImprove')).getByRole('button', { name: 'Food' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('changing across buckets (4→2) drops the now-stale reason tags', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    await user.click(within(getScreen('screenImprove')).getByRole('button', { name: 'Food' }));
    expect(getScreen('screenImprove')).toHaveClass('has-selection');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('radio', { name: 'Rate 2 out of 5 stars' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // The sorry screen starts clean — a positive tag must not leak across.
    expect(isActive('screenSorry')).toBe(true);
    expect(getScreen('screenSorry')).not.toHaveClass('has-selection');
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

describe('offline resilience (submission retry)', () => {
  const ok201 = () =>
    new Response(JSON.stringify({ id: 'x' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  it('retries a transient network failure, then succeeds', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('network blip')).mockResolvedValue(ok201());

    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    await user.click(within(getScreen('screenImprove')).getByRole('button', { name: 'Send to manager' }));

    await waitFor(
      () => expect(screen.getByText('Thank you for telling us')).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2); // retried
  });

  it('does NOT retry a permanent 4xx, and surfaces an error', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    const improve = within(getScreen('screenImprove'));
    await user.click(improve.getByRole('button', { name: 'Send to manager' }));

    await waitFor(() => expect(improve.getByText(/Couldn.t send/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry on 4xx
  });
});

describe('platforms flow (5 stars)', () => {
  it('skip ("Maybe next time") shows the honest rated copy, not a posted claim', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 5);

    await user.click(screen.getByRole('button', { name: 'Maybe next time' }));
    await waitFor(() =>
      expect(screen.getByText('Thanks for visiting!')).toBeInTheDocument(),
    );
    // Copy answers the decline graciously — no dishonest "posted a public
    // review" claim, and no awkward "thank you for the rating" non-sequitur.
    expect(screen.queryByText(/Thank you for sharing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Thank you for the rating/)).not.toBeInTheDocument();
  });

  it('platform card opens the window synchronously and falls back on PLACEHOLDER urls', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 5);

    await user.click(screen.getByRole('button', { name: /Google/ }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0];
    expect(String(url)).not.toContain('PLACEHOLDER'); // demo venue is unconfigured → fallback
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    expect(warn).toHaveBeenCalled(); // misconfiguration noted for devs
  });
});

describe('public review available to every guest (no review gating)', () => {
  it('offers a public review on the 1-2★ success screen, then routes to neutral platforms', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 1);
    const sorry = within(getScreen('screenSorry'));
    await user.click(sorry.getByRole('button', { name: /Food quality/ }));
    await user.click(sorry.getByRole('button', { name: 'Send to manager' }));

    // The unhappy guest is still OFFERED the public option (compliance).
    const share = await screen.findByRole('button', { name: 'Share your experience publicly' });
    await user.click(share);

    // Lands on platforms with NEUTRAL copy — no celebratory headline, and the
    // public review is genuinely reachable.
    expect(isActive('screenPlatforms')).toBe(true);
    const platforms = within(getScreen('screenPlatforms'));
    expect(platforms.getByText('Share your experience')).toBeInTheDocument();
    expect(platforms.queryByText(/made our day/)).not.toBeInTheDocument();
    expect(platforms.getByRole('button', { name: /Google/ })).toBeInTheDocument();
  });

  it('offers a public review on the 3-4★ success screen too', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 4);
    await user.click(
      within(getScreen('screenImprove')).getByRole('button', { name: 'Send to manager' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Share your experience publicly' }),
    ).toBeInTheDocument();
  });

  it('does not re-offer it on the 5★ skip success (already declined)', async () => {
    const user = userEvent.setup();
    render(<RestaurantReviewApp />);
    await rateAndContinue(user, 5);
    await user.click(screen.getByRole('button', { name: 'Maybe next time' }));
    await waitFor(() => expect(screen.getByText('Thanks for visiting!')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Share your experience publicly' }),
    ).not.toBeInTheDocument();
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
