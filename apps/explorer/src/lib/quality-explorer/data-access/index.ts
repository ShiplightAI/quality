import { QcOperationError, isQcOperationError } from "@shiplightai/quality-core/operations";
import { localFsDataAccess } from "./local-fs";

export async function getQcDataAccessForRequest() {
  return localFsDataAccess;
}

export { QcOperationError, isQcOperationError };
export type { QcOperationError as QcOperationErrorType } from "@shiplightai/quality-core/operations";
export type { QcDataAccess } from "./types";
