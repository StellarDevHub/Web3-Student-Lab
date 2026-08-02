import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContractSearch, SAMPLE_CONTRACTS } from './ContractSearch';

const onSelect = jest.fn();

describe('ContractSearch', () => {
  beforeEach(() => {
    render(<ContractSearch onSelect={onSelect} />);
  });

  it('renders search input and type filter', () => {
    expect(screen.getByLabelText('Search contracts')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
  });

  it('filtering by text reduces results', () => {
    const input = screen.getByLabelText('Search contracts');
    fireEvent.change(input, { target: { value: 'Token' } });
    const results = SAMPLE_CONTRACTS.filter((c) =>
      c.name.toLowerCase().includes('token')
    );
    expect(screen.getAllByRole('button').length).toBe(results.length);
  });

  it('filtering by type reduces results', () => {
    const select = screen.getByLabelText('Filter by type');
    fireEvent.change(select, { target: { value: 'DeFi' } });
    const results = SAMPLE_CONTRACTS.filter((c) => c.type === 'DeFi');
    expect(screen.getAllByRole('button').length).toBe(results.length);
  });
});
