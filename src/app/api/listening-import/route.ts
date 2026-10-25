import {
  createListeningImportReceiptHandlers,
  listeningImportReceipts,
} from "../../../lib/server/listening-import-receipts";
export const runtime = "nodejs";
export const { GET, POST } = createListeningImportReceiptHandlers(
  listeningImportReceipts,
);
