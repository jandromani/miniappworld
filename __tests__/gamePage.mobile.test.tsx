/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import GamePage from '@/app/game/page';

jest.mock('@worldcoin/minikit-js', () => ({
  MiniKit: {
    commandsAsync: {
      sendHapticFeedback: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('@/lib/useHapticsPreference', () => ({
  useHapticsPreference: () => ({ hapticsEnabled: false }),
}));

describe('GamePage responsive layout', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as jest.Mock;
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: () => 'session-test-id' },
      configurable: true,
    });
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
});
