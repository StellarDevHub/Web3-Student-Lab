export interface Certificate {
    symbol: string;
    student: string;
    course_name: string;
    issue_date: number;
}
/**
 * Fetch certificate data from the Soroban contract by its symbol.
 * @param symbol The symbol of the certificate to retrieve.
 * @returns The certificate data if found, or null.
 */
export declare function getCertificate(symbol: string): Promise<Certificate | null>;
/**
 * Verify a certificate by checking if on-chain data matches the student name.
 * @param symbol The certificate symbol.
 * @param studentName The name to verify.
 * @returns True if the certificate is valid and matches the student name.
 */
export declare function verifyCertificate(symbol: string, studentName: string): Promise<boolean>;
//# sourceMappingURL=certificateService.d.ts.map