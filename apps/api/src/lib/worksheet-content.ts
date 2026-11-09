/**
 * The api's door to the worksheet definition.
 *
 * The checks themselves live in `@okuvu/shared-types/worksheet` because the
 * portal runs the same ones: if the portal could preview a worksheet the api
 * would refuse to serve, the therapist would be shown something the client
 * never sees. This file exists so api code has one local import path and so a
 * future api-only rule has an obvious home.
 */
export {
  InvalidWorksheetError,
  assertClientServable,
  parseWorksheetRow,
  toClientWorksheetView,
  worksheetRowProblems,
  type ClientWorksheetView,
  type ParsedWorksheet,
  type WorksheetRegistryRow,
} from '@okuvu/shared-types/worksheet';
