import { renderHook, act } from '@testing-library/react';
import { useBulkCertificateExport } from '@/hooks/useBulkCertificateExport';

describe('useBulkCertificateExport Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default idle state', () => {
    const { result } = renderHook(() => useBulkCertificateExport());

    expect(result.current.isExporting).toBe(false);
    expect(result.current.progress.current).toBe(0);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should handle empty input validation', async () => {
    const { result } = renderHook(() => useBulkCertificateExport());

    await act(async () => {
      await result.current.startExport([]);
    });

    expect(result.current.error).toBe('No certificates provided for export');
    expect(result.current.isExporting).toBe(false);
  });
});
