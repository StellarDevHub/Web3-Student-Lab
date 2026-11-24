export interface CertificateTemplateInput {
  studentName: string;
  courseTitle: string;
  instructor: string;
  issuedAt: string;
  certificateId: string;
  grade?: string;
  issuerName?: string;
  verificationBaseUrl?: string;
}

export function renderCertificateTemplate(input: CertificateTemplateInput): CertificateTemplateInput {
  return {
    ...input,
    issuerName: input.issuerName ?? 'Web3 Student Lab',
    verificationBaseUrl: input.verificationBaseUrl ?? process.env.API_BASE_URL ?? 'https://web3-student-lab.vercel.app',
  };
}
