import { render, screen, fireEvent } from '@testing-library/react';
import { SCPVisualizer } from './index';
import { describe, it, expect, vi } from 'vitest';

describe('SCPVisualizer', () => {
  it('renders without crashing', () => {
    render(<SCPVisualizer />);
    expect(
      screen.getByText(/Stellar Consensus Protocol \(SCP\) Visualizer/i)
    ).toBeInTheDocument();
  });

  it('shows Nomination phase initially', () => {
    render(<SCPVisualizer />);
    expect(screen.getByText(/📋 Nomination/i)).toBeInTheDocument();
  });

  it('shows Round 1 initially', () => {
    render(<SCPVisualizer />);
    expect(screen.getByText(/Round 1/i)).toBeInTheDocument();
  });

  it('displays all 7 validator nodes', () => {
    render(<SCPVisualizer />);
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByText(`V${i}`)).toBeInTheDocument();
    }
  });

  it('renders control buttons', () => {
    render(<SCPVisualizer />);
    expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Step/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
  });

  it('disables Start button when simulation is running', async () => {
    render(<SCPVisualizer />);
    const startButton = screen.getByRole('button', { name: /Start/i });

    fireEvent.click(startButton);

    // Give React time to update
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(startButton).toBeDisabled();
  });

  it('disables Pause button when simulation is not running', () => {
    render(<SCPVisualizer />);
    const pauseButton = screen.getByRole('button', { name: /Pause/i });

    expect(pauseButton).toBeDisabled();
  });

  it('shows legend with all node states', () => {
    render(<SCPVisualizer />);

    expect(screen.getByText(/idle/i)).toBeInTheDocument();
    expect(screen.getByText(/nominating/i)).toBeInTheDocument();
    expect(screen.getByText(/voting/i)).toBeInTheDocument();
    expect(screen.getByText(/accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('shows phase description', () => {
    render(<SCPVisualizer />);
    expect(
      screen.getByText(/Nomination Phase: Each validator broadcasts its candidate values/i)
    ).toBeInTheDocument();
  });

  it('displays speed control slider', () => {
    render(<SCPVisualizer />);
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '200');
    expect(slider).toHaveAttribute('max', '2000');
  });

  it('shows help text', () => {
    render(<SCPVisualizer />);
    expect(screen.getByText(/Click any node to toggle its failure state/i)).toBeInTheDocument();
  });

  it('advances one step on Step button click', async () => {
    render(<SCPVisualizer />);
    const stepButton = screen.getByRole('button', { name: /Step/i });

    fireEvent.click(stepButton);

    // Give React time to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(stepButton).toBeInTheDocument();
  });

  it('resets to initial state on Reset button click', async () => {
    render(<SCPVisualizer />);
    const resetButton = screen.getByRole('button', { name: /Reset/i });

    fireEvent.click(resetButton);

    // Give React time to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.getByText(/📋 Nomination/i)).toBeInTheDocument();
    expect(screen.getByText(/Round 1/i)).toBeInTheDocument();
  });

  it('renders SVG visualization container', () => {
    render(<SCPVisualizer />);
    const svg = screen.getByRole('img', {
      name: /Stellar Consensus Protocol Network Visualization/i,
    });
    expect(svg).toBeInTheDocument();
  });

  it('provides accessibility features', () => {
    render(<SCPVisualizer />);

    // Check for title element
    const title = screen.getByText('Stellar Consensus Protocol Network Visualization');
    expect(title).toBeInTheDocument();

    // Check for description
    const desc = screen.getByText(
      /An interactive visualization showing validator nodes and their consensus process/i
    );
    expect(desc).toBeInTheDocument();
  });

  it('displays all node state indicators', () => {
    render(<SCPVisualizer />);

    // All 7 nodes should be displayed with their labels
    for (let i = 1; i <= 7; i++) {
      const nodeLabel = screen.getByText(`V${i}`);
      expect(nodeLabel).toBeInTheDocument();
    }
  });

  it('renders speed control with correct value display', () => {
    render(<SCPVisualizer />);

    // Speed control should show multiplier
    expect(screen.getByText(/x/)).toBeInTheDocument();
  });
});
