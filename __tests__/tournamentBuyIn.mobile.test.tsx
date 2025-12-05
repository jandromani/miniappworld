/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TournamentBuyInPage from '@/app/tournament/buy-in/page';

const sendHapticFeedbackMock = jest.fn().mockResolvedValue(undefined);
const useHapticsPreferenceMock = jest.fn(() => ({ hapticsEnabled: true }));
const payForQuickMatch = jest.fn().mockResolvedValue(undefined);
const payForTournament = jest.fn().mockResolvedValue(undefined);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@worldcoin/minikit-js', () => ({
  MiniKit: {
    commandsAsync: {
      sendHapticFeedback: (...args: any[]) => sendHapticFeedbackMock(...args),
    },
  },
}));

jest.mock('@/lib/useHapticsPreference', () => ({
  useHapticsPreference: () => useHapticsPreferenceMock(),
}));

jest.mock('@/lib/paymentService', () => ({
  payForQuickMatch: (...args: any[]) => payForQuickMatch(...args),
  payForTournament: (...args: any[]) => payForTournament(...args),
}));

jest.mock('@/lib/haptics', () => ({
  sendNotificationHaptics: jest.fn(),
}));

jest.mock('@/lib/useHapticsPreference', () => ({
  useHapticsPreference: () => ({ hapticsEnabled: true }),
}));

describe('Tournament buy-in mobile experience', () => {
  beforeEach(() => {
    sendHapticFeedbackMock.mockClear();
    useHapticsPreferenceMock.mockReturnValue({ hapticsEnabled: true });
    payForQuickMatch.mockResolvedValue(undefined);
    payForTournament.mockResolvedValue(undefined);
  });

  it('shows stacked mode selector and CTA ready for mobile', () => {
    render(<TournamentBuyInPage />);

    expect(screen.getByRole('button', { name: /Partida rápida/i })).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /Pagar y Jugar/i });
    expect(cta).toHaveClass('w-full');
  });

  it('renders token grid optimized for small screens', () => {
    render(<TournamentBuyInPage />);

    fireEvent.click(screen.getByRole('button', { name: /Torneo/i }));
    const tokenGrid = screen.getByTestId('token-grid');
    expect(tokenGrid).toHaveClass('grid-cols-2');
  });

  it('sends success haptics when payment completes', async () => {
    const user = userEvent.setup();
    render(<TournamentBuyInPage />);

    await user.click(screen.getByRole('button', { name: /Pagar y Jugar/i }));

    await waitFor(() =>
      expect(sendHapticFeedbackMock).toHaveBeenCalledWith({ hapticsType: 'notification', style: 'success' }),
    );
    expect(payForQuickMatch).toHaveBeenCalled();
  });

  it('sends error haptics when payment fails', async () => {
    const user = userEvent.setup();
    payForQuickMatch.mockRejectedValueOnce(new Error('test error'));

    render(<TournamentBuyInPage />);
    await user.click(screen.getByRole('button', { name: /Pagar y Jugar/i }));

    await waitFor(() =>
      expect(sendHapticFeedbackMock).toHaveBeenCalledWith({ hapticsType: 'notification', style: 'error' }),
    );
  });
});
