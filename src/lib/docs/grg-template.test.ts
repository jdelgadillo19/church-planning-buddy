import { findTextRange } from "./grg-template";
import { GRG_PLACEHOLDER_DATE } from "@/lib/config/grg";

const mockDoc = {
  body: {
    content: [
      { startIndex: 1, endIndex: 2, sectionBreak: { sectionStyle: {} } },
      {
        startIndex: 2,
        endIndex: 30,
        paragraph: {
          elements: [{ textRun: { content: `Get Ready Guide\n` } }],
        },
      },
      {
        startIndex: 30,
        endIndex: 50,
        paragraph: {
          elements: [{ textRun: { content: `${GRG_PLACEHOLDER_DATE}\n` } }],
        },
      },
    ],
  },
} as Parameters<typeof findTextRange>[0];

const range = findTextRange(mockDoc, GRG_PLACEHOLDER_DATE);
if (!range || range.end - range.start !== GRG_PLACEHOLDER_DATE.length) {
  throw new Error("findTextRange failed");
}

console.log("grg-template tests ok");
