export interface TranslationRecord {
  locale: string;
  namespace: string;
  key: string;
  value: string;
}

export interface TranslationRepository {
  getTranslations(locale: string, namespace: string): Promise<Record<string, string>>;
}

export class PrismaTranslationRepository implements TranslationRepository {
  async getTranslations(locale: string, namespace: string): Promise<Record<string, string>> {
    const { default: prisma } = await import('../../db/index.js');

    const rows = await prisma.translationEntry.findMany({
      where: {
        locale,
        namespace,
      },
      select: {
        key: true,
        value: true,
      },
    });

    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }
}

export class InMemoryTranslationRepository implements TranslationRepository {
  private readonly table = new Map<string, string>();

  constructor(rows: TranslationRecord[] = []) {
    for (const row of rows) {
      this.table.set(this.makeKey(row.locale, row.namespace, row.key), row.value);
    }
  }

  async getTranslations(locale: string, namespace: string): Promise<Record<string, string>> {
    const prefix = `${locale}:${namespace}:`;
    const result: Record<string, string> = {};

    for (const [compositeKey, value] of this.table.entries()) {
      if (compositeKey.startsWith(prefix)) {
        result[compositeKey.slice(prefix.length)] = value;
      }
    }

    return result;
  }

  private makeKey(locale: string, namespace: string, key: string): string {
    return `${locale}:${namespace}:${key}`;
  }
}
