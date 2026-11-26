// backend/src/services/audit.service.ts
import { createHash } from 'node:crypto';

export type AuditArchiveListener = (entry: AuditLogEntry) => void;

export interface AuditLogEntry {
    id: string;
    sequenceNumber: number;
    previousHash: string;
    sessionId: string;
    ledgerSequence: number;
    action: string;
    payload: string;
    timestamp: number;
    hash: string;
}

export class AuditService {
    private chain: AuditLogEntry[] = [];
    private archiveListeners: AuditArchiveListener[] = [];

    constructor() {
        // Initialize genesis block if empty
        if (this.chain.length === 0) {
            const genesis: AuditLogEntry = {
                id: 'genesis-0',
                sequenceNumber: 0,
                previousHash: '0'.repeat(64),
                sessionId: 'system',
                ledgerSequence: 0,
                action: 'GENESIS',
                payload: 'Initial audit log root',
                timestamp: Date.now(),
                hash: '',
            };
            genesis.hash = this.computeHash(genesis);
            this.chain.push(genesis);
        }
    }

    private computeHash(entry: Omit<AuditLogEntry, 'hash'>): string {
        const rawData = `${entry.previousHash}|${entry.sequenceNumber}|${entry.sessionId}|${entry.ledgerSequence}|${entry.action}|${entry.payload}|${entry.timestamp}`;
        return createHash('sha256').update(rawData).digest('hex');
    }

    public recordDeployment(sessionId: string, ledgerSequence: number, action: string, payload: object): AuditLogEntry {
        const previousEntry = this.chain[this.chain.length - 1];
        if (!previousEntry) {
            throw new Error('Genesis block missing in audit chain');
        }
        const sequenceNumber = previousEntry.sequenceNumber + 1;
        const timestamp = Date.now();
        const payloadString = JSON.stringify(payload);

        const newEntryData = {
            id: `audit-${sequenceNumber}-${timestamp}`,
            sequenceNumber,
            previousHash: previousEntry.hash,
            sessionId,
            ledgerSequence,
            action,
            payload: payloadString,
            timestamp,
        };

        const hash = this.computeHash(newEntryData);
        const entry: AuditLogEntry = { ...newEntryData, hash };

        this.chain.push(entry);
        for (const listener of this.archiveListeners) {
            try {
                listener(entry);
            } catch {
                // Archival listeners must never break audit recording
            }
        }
        return entry;
    }

    public verifyChain(): { isValid: boolean; brokenAtSequence?: number; error?: string } {
        for (let i = 1; i < this.chain.length; i++) {
            const current = this.chain[i];
            const previous = this.chain[i - 1];
            if (!current || !previous) {
                continue;
            }

            // Verify previous hash link
            if (current.previousHash !== previous.hash) {
                return {
                    isValid: false,
                    brokenAtSequence: current.sequenceNumber,
                    error: `Broken hash link at sequence ${current.sequenceNumber}: previousHash does not match prior block hash.`,
                };
            }

            // Verify current block hash integrity
            const recalculatedHash = this.computeHash({
                id: current.id,
                sequenceNumber: current.sequenceNumber,
                previousHash: current.previousHash,
                sessionId: current.sessionId,
                ledgerSequence: current.ledgerSequence,
                action: current.action,
                payload: current.payload,
                timestamp: current.timestamp,
            });

            if (current.hash !== recalculatedHash) {
                return {
                    isValid: false,
                    brokenAtSequence: current.sequenceNumber,
                    error: `Tampering detected at sequence ${current.sequenceNumber}: stored hash does not match recalculated hash.`,
                };
            }
        }

        return { isValid: true };
    }

    public getChain(): AuditLogEntry[] {
        return [...this.chain];
    }

    public onEntryRecorded(listener: AuditArchiveListener): void {
        this.archiveListeners.push(listener);
    }
}
