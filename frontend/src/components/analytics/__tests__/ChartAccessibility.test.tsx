import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ProgressChart from '../ProgressChart';
import CompletionPie from '../CompletionPie';
import SkillRadar from '../SkillRadar';
import TrendChart from '../TrendChart';
import TimeDistributionChart from '../TimeDistributionChart';

// Recharts renders SVG elements; no mocks needed since jsdom supports SVG.

const MOCK_PROGRESS_DATA = [
  { date: 'Jan 01', completed: 5, inProgress: 3, notStarted: 2 },
  { date: 'Jan 02', completed: 7, inProgress: 2, notStarted: 1 },
];

const MOCK_COMPLETION_DATA = [
  { name: 'Completed', value: 45, color: '#10b981' },
  { name: 'In Progress', value: 30, color: '#f59e0b' },
  { name: 'Not Started', value: 25, color: '#6b7280' },
];

const MOCK_SKILL_DATA = [
  { skill: 'Rust', level: 68, maxLevel: 100 },
  { skill: 'Web3', level: 90, maxLevel: 100 },
];

const MOCK_TREND_DATA = [
  { week: 'Jan 01', score: 75, velocity: 3.5 },
  { week: 'Jan 08', score: 82, velocity: 4.2 },
];

const MOCK_TIME_DATA = [
  { hour: '09:00', sessions: 12 },
  { hour: '10:00', sessions: 8 },
];

describe('ProgressChart accessibility', () => {
  it('has role="img" with an aria-label describing the chart', () => {
    render(<ProgressChart data={MOCK_PROGRESS_DATA} />);
    const img = document.querySelector('[role="img"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label');
    expect(img!.getAttribute('aria-label')).toMatch(/line chart/i);
  });

  it('renders a toggle button with aria-expanded and aria-controls', () => {
    render(<ProgressChart data={MOCK_PROGRESS_DATA} />);
    const button = screen.getByRole('button', { name: /show data table/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'progress-chart-table');
  });

  it('shows the data table when toggle is clicked and hides on second click', () => {
    render(<ProgressChart data={MOCK_PROGRESS_DATA} />);

    const button = screen.getByRole('button', { name: /show data table/i });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveTextContent(/hide data table/i);

    fireEvent.click(button);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent(/show data table/i);
  });

  it('renders chart data in the table matching the input data', () => {
    render(<ProgressChart data={MOCK_PROGRESS_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /show data table/i }));

    expect(screen.getByText('Jan 01')).toBeInTheDocument();
    expect(screen.getByText('Jan 02')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('CompletionPie accessibility', () => {
  it('has role="img" with an aria-label describing the chart', () => {
    render(<CompletionPie data={MOCK_COMPLETION_DATA} />);
    const img = document.querySelector('[role="img"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label');
    expect(img!.getAttribute('aria-label')).toMatch(/pie chart/i);
  });

  it('renders a toggle button for the data table', () => {
    render(<CompletionPie data={MOCK_COMPLETION_DATA} />);
    const button = screen.getByRole('button', { name: /show data table/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-controls', 'completion-pie-table');
  });

  it('shows chart data in the table when toggled', () => {
    render(<CompletionPie data={MOCK_COMPLETION_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /show data table/i }));

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Not Started')).toBeInTheDocument();
  });
});

describe('SkillRadar accessibility', () => {
  it('has role="img" with an aria-label describing the chart', () => {
    render(<SkillRadar data={MOCK_SKILL_DATA} />);
    const img = document.querySelector('[role="img"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label');
    expect(img!.getAttribute('aria-label')).toMatch(/radar chart/i);
  });

  it('renders the toggle button with aria-controls', () => {
    render(<SkillRadar data={MOCK_SKILL_DATA} />);
    const button = screen.getByRole('button', { name: /show data table/i });
    expect(button).toHaveAttribute('aria-controls', 'skill-radar-table');
  });

  it('shows skill data in the table', () => {
    render(<SkillRadar data={MOCK_SKILL_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /show data table/i }));
    expect(screen.getByText('Rust')).toBeInTheDocument();
    expect(screen.getByText('Web3')).toBeInTheDocument();
    expect(screen.getByText('68/100')).toBeInTheDocument();
    expect(screen.getByText('90/100')).toBeInTheDocument();
  });
});

describe('TrendChart accessibility', () => {
  it('has role="img" with an aria-label describing the chart', () => {
    render(<TrendChart data={MOCK_TREND_DATA} />);
    const img = document.querySelector('[role="img"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label');
    expect(img!.getAttribute('aria-label')).toMatch(/composed bar/i);
  });

  it('shows trend data in the table', () => {
    render(<TrendChart data={MOCK_TREND_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /show data table/i }));
    expect(screen.getByText('Jan 01')).toBeInTheDocument();
    expect(screen.getByText('Jan 08')).toBeInTheDocument();
  });
});

describe('TimeDistributionChart accessibility', () => {
  it('has role="img" with an aria-label describing the chart', () => {
    render(<TimeDistributionChart data={MOCK_TIME_DATA} />);
    const img = document.querySelector('[role="img"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label');
    expect(img!.getAttribute('aria-label')).toMatch(/area chart/i);
  });

  it('shows time data in the table', () => {
    render(<TimeDistributionChart data={MOCK_TIME_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /show data table/i }));
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });
});
