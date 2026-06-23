import type {
  CanonicalDocument,
  PageContext
} from "../types/index.js";

import { DocumentQueue } from "./documentQueue.js";

export function selectDocumentForPage(
  context: PageContext,
  queue: DocumentQueue
): CanonicalDocument | undefined {
  return queue.getNext(context.group);
}