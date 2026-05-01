'use client';

import { useThemeMode } from '@/hooks/useThemeMode';
import {
    getChartAxisStyle,
    getChartStyles,
    getLineChartStyle
} from '@/lib/theme/chartTheme';
import { 
  select, 
  scaleLinear, 
  scaleBand, 
  max, 
  line, 
  area, 
  axisBottom, 
  axisLeft 
} from 'd3';
import { useEffect, useRef } from 'react';

interface D3ChartProps {
  data: Array<{ name: string; value: number }>;
  title?: string;
  height?: number;
  width?: number;
}

// Example D3 Line Chart with theme support
export const ThemedLineChart: React.FC<D3ChartProps> = ({
  data,
  title,
  height = 300,
  width = 600,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme, mounted } = useThemeMode();

  useEffect(() => {
    if (!mounted || !svgRef.current || !data.length) return;

    const chartStyles = getChartStyles(theme as 'light' | 'dark');
    const lineStyles = getLineChartStyle(theme as 'light' | 'dark');
    const axisStyles = getChartAxisStyle(theme as 'light' | 'dark');

    const margin = { top: 20, right: 30, bottom: 30, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous
    select(svgRef.current).selectAll('*').remove();

    const svg = select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = scaleLinear()
      .domain([0, data.length - 1])
      .range([0, innerWidth]);

    const yScale = scaleLinear()
      .domain([0, max(data, (d) => d.value) || 100])
      .range([innerHeight, 0]);

    // Line generator
    const lineGenerator = line<(typeof data)[0]>()
      .x((d, i) => xScale(i))
      .y((d) => yScale(d.value));

    // Background
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', chartStyles.backgroundColor)
      .attr('rx', 4);

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .attr('stroke', chartStyles.gridColor);

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).tickFormat((d) => data[d as number]?.name || ''))
      .attr('color', axisStyles.color)
      .selectAll('text')
      .attr('fill', axisStyles.textFill)
      .attr('font-size', '12px');

    // Y Axis
    g.append('g')
      .call(axisLeft(yScale))
      .attr('color', axisStyles.color)
      .selectAll('text')
      .attr('fill', axisStyles.textFill)
      .attr('font-size', '12px');

    // Area (optional)
    const areaGenerator = area<(typeof data)[0]>()
      .x((d, i) => xScale(i))
      .y0(innerHeight)
      .y1((d) => yScale(d.value));

    g.append('path')
      .datum(data)
      .attr('fill', chartStyles.colors[0])
      .attr('fill-opacity', lineStyles.areaOpacity)
      .attr('d', areaGenerator);

    // Line path
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', chartStyles.colors[0])
      .attr('stroke-width', lineStyles.lineWidth)
      .attr('d', lineGenerator);

    // Points
    g.selectAll('.dot')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', (d, i) => xScale(i))
      .attr('cy', (d) => yScale(d.value))
      .attr('r', lineStyles.pointRadius)
      .attr('fill', chartStyles.colors[0])
      .attr('stroke', chartStyles.backgroundColor)
      .attr('stroke-width', lineStyles.pointStroke)
      .style('cursor', 'pointer')
      .on('mouseover', function () {
        select(this)
          .transition()
          .duration(200)
          .attr('r', lineStyles.pointRadius * 1.5);
      })
      .on('mouseout', function () {
        select(this)
          .transition()
          .duration(200)
          .attr('r', lineStyles.pointRadius);
      });

    // Title
    if (title) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', chartStyles.textColor)
        .text(title);
    }
  }, [data, theme, mounted, height, width, title]);

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: 'auto' }}
      className="rounded-lg"
    />
  );
};

// Example D3 Bar Chart with theme support
export const ThemedBarChart: React.FC<D3ChartProps> = ({
  data,
  title,
  height = 300,
  width = 600,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme, mounted } = useThemeMode();

  useEffect(() => {
    if (!mounted || !svgRef.current || !data.length) return;

    const chartStyles = getChartStyles(theme as 'light' | 'dark');
    const axisStyles = getChartAxisStyle(theme as 'light' | 'dark');

    const margin = { top: 20, right: 30, bottom: 30, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous
    select(svgRef.current).selectAll('*').remove();

    const svg = select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = scaleBand()
      .domain(data.map((d) => d.name))
      .range([0, innerWidth])
      .padding(0.1);

    const yScale = scaleLinear()
      .domain([0, max(data, (d) => d.value) || 100])
      .range([innerHeight, 0]);

    // Background
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', chartStyles.backgroundColor)
      .attr('rx', 4);

    // Bars
    g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(d.name) || 0)
      .attr('y', (d) => yScale(d.value))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => innerHeight - yScale(d.value))
      .attr('fill', chartStyles.colors[0])
      .attr('fill-opacity', 0.8)
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('mouseover', function () {
        select(this)
          .transition()
          .duration(200)
          .attr('fill-opacity', 1)
          .attr('fill', chartStyles.colors[1]);
      })
      .on('mouseout', function () {
        select(this)
          .transition()
          .duration(200)
          .attr('fill-opacity', 0.8)
          .attr('fill', chartStyles.colors[0]);
      });

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale))
      .attr('color', axisStyles.color)
      .selectAll('text')
      .attr('fill', axisStyles.textFill)
      .attr('font-size', '12px');

    // Y Axis
    g.append('g')
      .call(axisLeft(yScale))
      .attr('color', axisStyles.color)
      .selectAll('text')
      .attr('fill', axisStyles.textFill)
      .attr('font-size', '12px');

    // Title
    if (title) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', chartStyles.textColor)
        .text(title);
    }
  }, [data, theme, mounted, height, width, title]);

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: 'auto' }}
      className="rounded-lg"
    />
  );
};
