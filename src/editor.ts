import { VisualEditor as PackageEditor } from "@fsaldivar.dev/planning/editor";
import type { RichNode } from "@codaru/planning-core";
import { icon } from "./icons";
import "@fsaldivar.dev/planning/editor.css";
export { validContent } from "@fsaldivar.dev/planning/editor";
export class VisualEditor extends PackageEditor {
  constructor(host: HTMLElement, content: RichNode, change: (content: RichNode) => void, readOnly = false) {
    super(host, content, change, { readOnly, icon });
  }
}
