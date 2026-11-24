import { describe, expect, it } from 'vitest';
import { escapeCsvField, generateDemoAuditLogs, toAuditLogCsv } from '../useAuditLogs';

describe('generateDemoAuditLogs', () => {
  it('is deterministic and sized as requested', () => {
    const first = generateDemoAuditLogs(500);
    const second = generateDemoAuditLogs(500);
    expect(first).toHaveLength(500);
    expect(first).toEqual(second);
    expect(new Set(first.map((log) => log.id)).size).toBe(500);
  });
});

describe('escapeCsvField', () => {
  it('quotes separators, quotes and newlines', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvField(null)).toBe('');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(escapeCsvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvField('+1')).toBe("'+1");
    expect(escapeCsvField('@cmd')).toBe("'@cmd");
  });

  it('serialises objects as JSON', () => {
    expect(escapeCsvField({ ok: true })).toBe('"{""ok"":true}"');
  });
});

describe('toAuditLogCsv', () => {
  it('emits a header plus one CRLF-separated line per row', () => {
    const rows = generateDemoAuditLogs(3);
    const lines = toAuditLogCsv(rows).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('ID,Timestamp,Action,User ID,User Email,Entity,Entity ID,IP Address,User Agent,Details');
    expect(lines[1]?.startsWith(`${rows[0]?.id},`)).toBe(true);
  });
});
