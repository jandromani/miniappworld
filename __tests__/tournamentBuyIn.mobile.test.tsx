/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import TournamentBuyInPage from '@/app/tournament/buy-in/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/paymentService', () => ({
  payForQuickMatch: jest.fn().mockResolvedValue(undefined),
  payForTournament: jest.fn().mockResolvedValue(undefined),
}));

describe('Tournament buy-in mobile experience', () => {
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
});
