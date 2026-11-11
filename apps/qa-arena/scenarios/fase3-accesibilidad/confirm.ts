import { confirmUiFlags } from "../helpers.ts";

/**
 * Same limit as `fase3-visual`: the violations are in the DOM, so the API can only see the flag.
 * The real check (accessible name, contrast, Escape and Tab) belongs to the browser confirmer of
 * `reto-3-4` in the evaluator (F3-TPL-0c); the render is tested in `web/src/test/ui-flags`.
 */
export default confirmUiFlags("ui.a11y_violations");
