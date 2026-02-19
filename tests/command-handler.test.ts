import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { handleCommand } from "../src/handlers/command-handler";
import * as xpHandler from "../src/handlers/handle-xp-command";
import { ContextPlugin } from "../src/types";

type TestContextOverrides = Record<string, unknown>;

type LogMock = ReturnType<typeof mock>;

function createTestContext(overrides: TestContextOverrides = {}) {
  const warn = mock(() => {});
  const debug = mock(() => {});
  const context = {
    eventName: "issue_comment.created",
    command: { name: "xp", parameters: { username: [] } },
    logger: { warn, debug } as unknown as ContextPlugin["logger"],
  };
  return { context: { ...context, ...overrides } as unknown as ContextPlugin, warn: warn as LogMock, debug: debug as LogMock };
}

describe("handleCommand", () => {
  afterEach(() => {
    mock.restore();
  });

  it("warns when the event is not an issue comment", async () => {
    const xpSpy = spyOn(xpHandler, "handleXpCommand").mockResolvedValue();
    const { context, debug } = createTestContext({ eventName: "issues.unassigned" });

    await handleCommand(context);

    expect(debug).toHaveBeenCalledWith("Received unsupported event for command handling, won't proceed with the LLM command.");
    expect(xpSpy).not.toHaveBeenCalled();
  });

  it("warns when the command payload is missing", async () => {
    const xpSpy = spyOn(xpHandler, "handleXpCommand").mockResolvedValue();
    const { context, debug } = createTestContext({ command: null });

    await handleCommand(context);

    expect(debug).toHaveBeenCalledWith("Received command without content, won't proceed with the LLM command.");
    expect(xpSpy).not.toHaveBeenCalled();
  });

  it("warns when the command name is unknown", async () => {
    const xpSpy = spyOn(xpHandler, "handleXpCommand").mockResolvedValue();
    const { context, warn } = createTestContext({ command: { name: "other" } });

    await handleCommand(context);

    expect(warn).toHaveBeenCalledWith("Received unknown command: other");
    expect(xpSpy).not.toHaveBeenCalled();
  });

  it("delegates to the XP handler when the command is recognized", async () => {
    const xpSpy = spyOn(xpHandler, "handleXpCommand").mockResolvedValue();
    const { context, warn } = createTestContext();

    await handleCommand(context);

    expect(xpSpy).toHaveBeenCalledWith(context);
    expect(warn).not.toHaveBeenCalled();
  });

  it("delegates to the XP handler for review thread commands", async () => {
    const xpSpy = spyOn(xpHandler, "handleXpCommand").mockResolvedValue();
    const { context } = createTestContext({ eventName: "pull_request_review_comment.created" });

    await handleCommand(context);

    expect(xpSpy).toHaveBeenCalledWith(context);
  });
});
