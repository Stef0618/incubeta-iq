// @types/pdf-parse only covers the package root; the lib path skips
// v1's debug-mode entrypoint but ships no types of its own.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
