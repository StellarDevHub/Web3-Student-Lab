import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CryptoVisualizer } from '../CryptoVisualizer';

describe('CryptoVisualizer', () => {
  it('renders the component with header and operation tabs', () => {
    render(<CryptoVisualizer />);
    expect(screen.getByText('Interactive')).toBeInTheDocument();
    expect(screen.getByText('Cryptography')).toBeInTheDocument();
    expect(screen.getByText('Visualizer')).toBeInTheDocument();
  });

  it('renders all operation tabs', () => {
    render(<CryptoVisualizer />);
    expect(screen.getByText('SHA-256 Hash')).toBeInTheDocument();
    expect(screen.getByText('AES-256-GCM')).toBeInTheDocument();
    expect(screen.getByText('RSA-2048 OAEP')).toBeInTheDocument();
    expect(screen.getByText('HMAC-SHA256')).toBeInTheDocument();
    expect(screen.getByText('ECDSA P-256')).toBeInTheDocument();
  });

  it('renders input textarea', () => {
    render(<CryptoVisualizer />);
    expect(screen.getByLabelText('Input message for cryptographic operation')).toBeInTheDocument();
  });

  it('renders the run button', () => {
    render(<CryptoVisualizer />);
    expect(screen.getByRole('button', { name: /Run SHA-256 Hash/i })).toBeInTheDocument();
  });

  it('shows the placeholder message when no operation has been run', () => {
    render(<CryptoVisualizer />);
    expect(screen.getByText('Select an operation and click Run')).toBeInTheDocument();
  });
});
