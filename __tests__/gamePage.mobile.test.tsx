/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GamePage from '@/app/game/page';

const sendHapticFeedbackMock = jest.fn().mockResolvedValue(undefined);
const useHapticsPreferenceMock = jest.fn(() => ({ hapticsEnabled: true }));

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

describe('GamePage responsive layout', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as jest.Mock;
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: () => 'session-test-id' },
      configurable: true,
    });
    sendHapticFeedbackMock.mockClear();
    useHapticsPreferenceMock.mockReturnValue({ hapticsEnabled: true });
  });

  it('displays mobile-friendly score grid and session info', () => {
    render(<GamePage />);

    expect(screen.getByTestId('score-grid')).toHaveClass('grid-cols-2');
    expect(screen.getByTestId('session-id')).toHaveTextContent('session-test-id');
  });

  it('renders answer buttons with full-width tap targets', () => {
    render(<GamePage />);

    const optionButtons = screen.getAllByRole('button', { name: /Madrid|París|Roma|Lisboa/ });
    expect(optionButtons[0]).toHaveClass('w-full');
  });

  it('triggers success haptics on correct answer when enabled', async () => {
    const user = userEvent.setup();
    render(<GamePage />);

    const correctOption = screen.getByRole('button', { name: 'París' });
    await user.click(correctOption);

    await waitFor(() =>
      expect(sendHapticFeedbackMock).toHaveBeenCalledWith({ hapticsType: 'notification', style: 'success' }),
    );
  });

  it('triggers error haptics on incorrect answer when enabled', async () => {
    const user = userEvent.setup();
    render(<GamePage />);

    const incorrectOption = screen.getByRole('button', { name: 'Madrid' });
    await user.click(incorrectOption);

    await waitFor(() =>
      expect(sendHapticFeedbackMock).toHaveBeenCalledWith({ hapticsType: 'notification', style: 'error' }),
    );
  });
});
