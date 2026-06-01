import {
  DEFAULT_GRG_OUTPUT_SUBFOLDER,
  DEFAULT_GRG_TEMPLATE_SUBFOLDER,
  resolveGrgOutputFolderPath,
  resolveGrgTemplateFolderPath,
} from "./grg-drive";

{
  const path = resolveGrgTemplateFolderPath();
  const expected = `church-planning-buddy/Get Ready Guide/${DEFAULT_GRG_TEMPLATE_SUBFOLDER}`;
  if (path.join("/") !== expected) {
    throw new Error(`unexpected default template path: ${path.join("/")} (want ${expected})`);
  }
}

{
  const path = resolveGrgOutputFolderPath();
  const expected = `church-planning-buddy/Get Ready Guide/${DEFAULT_GRG_OUTPUT_SUBFOLDER}`;
  if (path.join("/") !== expected) {
    throw new Error(`unexpected default output path: ${path.join("/")} (want ${expected})`);
  }
}

console.log("grg-drive config tests ok");
