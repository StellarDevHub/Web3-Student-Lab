import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NetworkLedgerStreamer, {
  formatValueForDisplay,
  safeDecodeScVal,
} from './page';

describe('NetworkLedgerStreamer & Event Decoder Helpers', () => {
  describe('safeDecodeScVal', () => {
    it('decodes base64 symbol XDR for transfer', () => {
      // "transfer" symbol ScVal in base64: AAAADAAAAAh0cmFuc2Zlcg==
      const decoded = safeDecodeScVal('AAAADAAAAAh0cmFuc2Zlcg==');
      expect(decoded).toBe('transfer');
    });

    it('returns raw string when invalid XDR string is provided', () => {
      const decoded = safeDecodeScVal('invalid_base64_string');
      expect(decoded).toBe('invalid_base64_string');
    });

    it('returns null when empty string is provided', () => {
      const decoded = safeDecodeScVal('');
      expect(decoded).toBeNull();
    });
  });

  describe('formatValueForDisplay', () => {
    it('formats null and undefined as "null"', () => {
      expect(formatValueForDisplay(null)).toBe('null');
      expect(formatValueForDisplay(undefined)).toBe('null');
    });

    it('formats numbers and strings directly', () => {
      expect(formatValueForDisplay(123)).toBe('123');
      expect(formatValueForDisplay('transfer')).toBe('transfer');
    });

    it('formats objects as JSON string', () => {
      expect(formatValueForDisplay({ amount: '100 STLR' })).toBe('{"amount":"100 STLR"}');
    });
  });

  describe('NetworkLedgerStreamer UI Component', () => {
    it('renders the Stellar Event Streaming Console title and tabs', () => {
      render(<NetworkLedgerStreamer />);
      expect(screen.getByText('Stellar Event Streaming Console')).toBeInTheDocument();
      expect(screen.getByText('FE-HARD-21')).toBeInTheDocument();
      expect(screen.getByText('Contract Events')).toBeInTheDocument();
      expect(screen.getByText('Topology Graph')).toBeInTheDocument();
    });

    it('renders search and regex filter inputs', () => {
      render(<NetworkLedgerStreamer />);
      expect(screen.getByLabelText(/Contract ID Filter/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Topic Regex Filter/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Event Type/i)).toBeInTheDocument();
    });

    it('allows typing into contract search and topic regex inputs', () => {
      render(<NetworkLedgerStreamer />);
      const contractInput = screen.getByLabelText(/Contract ID Filter/i) as HTMLInputElement;
      const regexInput = screen.getByLabelText(/Topic Regex Filter/i) as HTMLInputElement;

      fireEvent.change(contractInput, { target: { value: 'CCW67TSB' } });
      expect(contractInput.value).toBe('CCW67TSB');

      fireEvent.change(regexInput, { target: { value: 'transfer|mint' } });
      expect(regexInput.value).toBe('transfer|mint');
    });

    it('shows invalid regex error indicator when regex is malformed', () => {
      render(<NetworkLedgerStreamer />);
      const regexInput = screen.getByLabelText(/Topic Regex Filter/i);

      fireEvent.change(regexInput, { target: { value: '[invalid' } });
      expect(screen.getByText(/Invalid Regex/i)).toBeInTheDocument();
    });
  });
});
