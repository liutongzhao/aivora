import { describe, expect, it } from "vitest";
import { mergeTaskResult } from "./task-result";

describe("任务结果合并", () => {
  it("完成事件没有图片时保留初始详情中的截图", () => {
    const current = {
      content: "处理中",
      images: [{ id: "image-1", url: "https://storage.test/image-1.png" }],
    };
    const completed = {
      content: "最终答案",
      parsed: { answer: "A" },
    };

    expect(mergeTaskResult(current, completed)).toEqual({
      content: "最终答案",
      parsed: { answer: "A" },
      images: current.images,
    });
  });
});
