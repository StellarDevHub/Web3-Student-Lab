import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import VestingDashboard from '../VestingDashboard';
import { vestingAPI } from '@/lib/api';

// Mock the API library
vi.mock('@/lib/api', () => ({
  vestingAPI: {
    getByProjectId: vi.fn(),
    create: vi.fn(),
    claim: vi.fn(),
  },
}));

describe('VestingDashboard Component', () => {
  const mockProjectId = 'test-project';
  const mockProjectTitle = 'Test Project Title';

  const mockSchedule = {
    id: 'vest-123',
    workspaceId: 'default',
    projectId: mockProjectId,
    tokenName: 'Test Token',
    tokenSymbol: 'TST',
    amount: 120000,
    cliffMonths: 6,
    durationMonths: 24,
    beneficiary: 'GB2P4X7B2UXK6D5J4LNVO37GLV2WMVMOUVM2ATCSJJRZ74UCE7IPJLAO',
    claimedAmount: 10000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders configuration form when no schedule is found (404)', async () => {
    (vestingAPI.getByProjectId as any).mockRejectedValueOnce({
      response: { status: 404 },
    });

    render(<VestingDashboard projectId={mockProjectId} projectTitle={mockProjectTitle} />);

    // Should see loading spinner/status initially, then form
    await waitFor(() => {
      expect(screen.getByLabelText(/Token Name/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Symbol/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Total Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cliff \(Months\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Duration \(Months\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Beneficiary Stellar Address/i)).toBeInTheDocument();

    // Presets should be present
    expect(screen.getByText(/Standard/i)).toBeInTheDocument();
    expect(screen.getByText(/Founder/i)).toBeInTheDocument();
    expect(screen.getByText(/Advisor/i)).toBeInTheDocument();
  });

  it('autofills preset values when preset buttons are clicked', async () => {
    (vestingAPI.getByProjectId as any).mockRejectedValueOnce({
      response: { status: 404 },
    });

    render(<VestingDashboard projectId={mockProjectId} projectTitle={mockProjectTitle} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Token Name/i)).toBeInTheDocument();
    });

    const founderPresetBtn = screen.getByText(/Founder/i);
    const advisorPresetBtn = screen.getByText(/Advisor/i);

    const cliffInput = screen.getByLabelText(/Cliff \(Months\)/i) as HTMLInputElement;
    const durationInput = screen.getByLabelText(/Duration \(Months\)/i) as HTMLInputElement;

    // Apply founder preset
    fireEvent.click(founderPresetBtn);
    expect(cliffInput.value).toBe('12');
    expect(durationInput.value).toBe('36');

    // Apply advisor preset
    fireEvent.click(advisorPresetBtn);
    expect(cliffInput.value).toBe('0');
    expect(durationInput.value).toBe('12');
  });

  it('calls create API on deployment form submission', async () => {
    (vestingAPI.getByProjectId as any).mockRejectedValueOnce({
      response: { status: 404 },
    });
    (vestingAPI.create as any).mockResolvedValueOnce(mockSchedule);

    render(<VestingDashboard projectId={mockProjectId} projectTitle={mockProjectTitle} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Token Name/i)).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Deploy Vesting Schedule/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(vestingAPI.create).toHaveBeenCalledWith({
        projectId: mockProjectId,
        tokenName: 'Community Token',
        tokenSymbol: 'COMM',
        amount: 100000,
        cliffMonths: 6,
        durationMonths: 24,
        beneficiary: 'GB2P4X7B2UXK6D5J4LNVO37GLV2WMVMOUVM2ATCSJJRZ74UCE7IPJLAO',
      });
    });

    // Dashboard should render once deployed
    expect(screen.getByText(/Total Allocation/i)).toBeInTheDocument();
    expect(screen.getByText(/120,000 TST/i)).toBeInTheDocument();
  });

  it('renders dashboard directly if schedule already exists', async () => {
    (vestingAPI.getByProjectId as any).mockResolvedValueOnce(mockSchedule);

    render(<VestingDashboard projectId={mockProjectId} projectTitle={mockProjectTitle} />);

    await waitFor(() => {
      expect(screen.getByText(/Total Allocation/i)).toBeInTheDocument();
    });

    expect(screen.getByText('120,000 TST')).toBeInTheDocument();
    expect(screen.getByText('6 Months')).toBeInTheDocument();
    expect(screen.getByText('24 Months')).toBeInTheDocument();
    expect(screen.getByText('10,000 TST')).toBeInTheDocument();
  });

  it('handles simulated progression calculations correctly', async () => {
    (vestingAPI.getByProjectId as any).mockResolvedValueOnce(mockSchedule);

    render(<VestingDashboard projectId={mockProjectId} projectTitle={mockProjectTitle} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Timeline Simulation Scrubber/i)).toBeInTheDocument();
    });

    const slider = screen.getByLabelText(/Timeline Simulation Scrubber/i);

    // Initial simulated month is 0. 0 < cliff (6 months), so vested is 0
    expect(screen.getByText(/Remaining Locked/i).nextSibling?.textContent).toBe('120,000');
    expect(screen.getByText(/Claimable Now/i).nextSibling?.textContent).toBe('0');

    // Scrutinize month 12 (halfway through 24 month duration).
    // Vested amount = 120,000 * (12/24) = 60,000.
    // Claimed = 10,000.
    // Claimable = 60,000 - 10,000 = 50,000.
    // Remaining Locked = 120,000 - 60,000 = 60,000.
    fireEvent.change(slider, { target: { value: '12' } });

    expect(screen.getByText(/Remaining Locked/i).nextSibling?.textContent).toBe('60,000');
    expect(screen.getByText(/Claimable Now/i).nextSibling?.textContent).toBe('50,000');
  });

  it('calls claim API with simulated months when claim forms are submitted', async () => {
    (vestingAPI.getByProjectId as any).mockResolvedValueOnce(mockSchedule);
    const updatedSchedule = {
      ...mockSchedule,
      claimedAmount: 40000,
    };
    (vestingAPI.claim as any).mockResolvedValueOnce(updatedSchedule);

    render(<VestingDashboard projectId={mockProjectId} projectTitle={mockProjectTitle} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Timeline Simulation Scrubber/i)).toBeInTheDocument();
    });

    const slider = screen.getByLabelText(/Timeline Simulation Scrubber/i);
    // Scrub to month 12 so we have 50,000 claimable
    fireEvent.change(slider, { target: { value: '12' } });

    const amountInput = screen.getByPlaceholderText(/Amount to claim.../i);
    const claimBtn = screen.getByRole('button', { name: /Claim Tokens/i });

    // Try claiming 30,000
    fireEvent.change(amountInput, { target: { value: '30000' } });
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(vestingAPI.claim).toHaveBeenCalledWith(mockProjectId, 30000, 12);
    });

    // Verify claimed state updates
    expect(screen.getByText('40,000 TST')).toBeInTheDocument();
  });
});
