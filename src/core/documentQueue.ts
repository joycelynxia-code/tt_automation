import type { CanonicalDocument, PageGroup } from "../types/index.js";

const GROUP_TO_DOC_TYPE: Record<string, string> = {
  W2: "W2",
  "1099_INT": "1099_INT",
  "1099_R": "1099_R",
  "1099_DIV": "1099_DIV",
  "1099_B": "1099_B",
  "1098_T": "1098_T"
};

export class DocumentQueue {
  constructor(
    private readonly documents: CanonicalDocument[]
  ) {}

  getNext(group: PageGroup): CanonicalDocument | undefined {
    const docType = GROUP_TO_DOC_TYPE[group];

    if (!docType) {
      return undefined;
    }

    return this.documents.find(
      d =>
        d.type === docType &&
        !d.status?.filled
    );
  }

  markFilled(id: string) {
    const doc = this.documents.find(
      d => d.id === id
    );

    if (!doc) {
      return;
    }

    doc.status = {
      filled: true,
      filledAt: new Date().toISOString()
    };
  }

  hasMore(group: PageGroup): boolean {
    return Boolean(this.getNext(group));
  }
}