import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ChartDataTable, type ColumnDef } from '../ChartDataTable';

const SAMPLE_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'value', label: 'Value' },
  { key: 'score', label: 'Score', format: (v) => `${v}/100` },
];

const SAMPLE_DATA: Record<string, unknown>[] = [
  { name: 'Alpha', value: 10, score: 85 },
  { name: 'Beta', value: 20, score: 72 },
  { name: 'Gamma', value: 30, score: 91 },
];

describe('ChartDataTable', () => {
  it('renders a table element with caption', () => {
    render(
      <ChartDataTable columns={SAMPLE_COLUMNS} data={SAMPLE_DATA} caption="Test data" />
    );

    const table = document.querySelector('table');
    expect(table).toBeInTheDocument();

    const caption = document.querySelector('caption');
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveClass('sr-only');
    expect(caption).toHaveTextContent('Test data');
  });

  it('renders column headers with scope attributes', () => {
    render(
      <ChartDataTable columns={SAMPLE_COLUMNS} data={SAMPLE_DATA} caption="Test data" />
    );

    const headers = document.querySelectorAll('th');
    expect(headers).toHaveLength(3);

    headers.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });

    expect(headers[0]).toHaveTextContent('Name');
    expect(headers[1]).toHaveTextContent('Value');
    expect(headers[2]).toHaveTextContent('Score');
  });

  it('renders data rows matching the input data', () => {
    render(
      <ChartDataTable columns={SAMPLE_COLUMNS} data={SAMPLE_DATA} caption="Test data" />
    );

    const rows = document.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent('Alpha');
    expect(rows[0]).toHaveTextContent('10');
    expect(rows[0]).toHaveTextContent('85/100');
  });

  it('applies custom format function to values', () => {
    render(
      <ChartDataTable columns={SAMPLE_COLUMNS} data={SAMPLE_DATA} caption="Test data" />
    );

    expect(screen.getByText('85/100')).toBeInTheDocument();
    expect(screen.getByText('72/100')).toBeInTheDocument();
    expect(screen.getByText('91/100')).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    render(
      <ChartDataTable columns={SAMPLE_COLUMNS} data={[]} caption="Empty data" />
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(document.querySelector('table')).not.toBeInTheDocument();
  });

  it('renders null values as empty strings with default formatting', () => {
    const dataWithNulls: Record<string, unknown>[] = [
      { name: 'Null Item', value: null, score: null },
    ];

    render(
      <ChartDataTable columns={SAMPLE_COLUMNS} data={dataWithNulls} caption="Null test" />
    );

    const cells = document.querySelectorAll('tbody td');
    expect(cells[1]).toHaveTextContent('');
    expect(cells[2]).toHaveTextContent('');
  });

  it('assigns the provided id to the container div', () => {
    render(
      <ChartDataTable columns={SAMPLE_COLUMNS} data={SAMPLE_DATA} caption="Test data" id="my-table" />
    );

    const container = document.querySelector('#my-table');
    expect(container).toBeInTheDocument();
  });

  it('handles boolean values correctly', () => {
    const boolData: Record<string, unknown>[] = [
      { name: 'Item', active: true, flag: false },
    ];
    const boolColumns: ColumnDef[] = [
      { key: 'name', label: 'Name' },
      { key: 'active', label: 'Active' },
      { key: 'flag', label: 'Flag' },
    ];

    render(
      <ChartDataTable columns={boolColumns} data={boolData} caption="Bool test" />
    );

    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
  });
});
