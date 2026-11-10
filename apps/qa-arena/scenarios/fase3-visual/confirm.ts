import { confirmUiFlags } from "../helpers.ts";

/**
 * The defect is purely visual (a CSS class on <body>), so the API can only see that the flag is
 * announced: a tautological check (review M2). What it does prove is that the scenario activates
 * the flag and the baseline does not. The render is tested in `web/src/test/ui-flags`.
 */
export default confirmUiFlags("ui.visual_regression");
