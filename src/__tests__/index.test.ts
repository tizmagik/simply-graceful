import Graceful from "../";
import type { Express } from "express";

const SG_READY = "__sg_ready";

describe("Graceful", () => {
  const realProcessOn = process.on;

  const app = {
    set: jest.fn(),
    get: jest.fn(),
  } as unknown as Express;

  beforeAll(() => {
    process.on = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.on = realProcessOn;
  });

  it("can be configured to skip process signals", () => {
    new Graceful({ skipProcessSignals: true });
    expect(process.on).not.toHaveBeenCalled();
  });

  it("can be configured with custom livePath and readyPath", () => {
    new Graceful({ app, livePath: "/foo", readyPath: "/bar" });
    expect(app.get).toHaveBeenCalledWith("/foo", expect.any(Function));
    expect(app.get).toHaveBeenCalledWith("/bar", expect.any(Function));
  });

  it("can be configured to use a custom logger", () => {
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    expect(() => {
      new Graceful({ logger });
    }).not.toThrow();
  });

  it("signals ready when all indicators are ready", () => {
    const graceful = new Graceful({ app, skipProcessSignals: true });

    graceful.waitForReady("one"); // 1 app.set(SG_READY, false)
    graceful.waitForReady("two"); // 2
    graceful.waitForReady("three"); // 3

    graceful.signalReady("one");
    graceful.signalReady("two");
    graceful.signalReady("three"); // 4 app.set(SG_READY, true)

    expect(app.set).toHaveBeenCalledTimes(4);
    expect(app.set).toHaveBeenNthCalledWith(1, SG_READY, false);
    expect(app.set).toHaveBeenNthCalledWith(2, SG_READY, false);
    expect(app.set).toHaveBeenNthCalledWith(3, SG_READY, false);
    expect(app.set).toHaveBeenLastCalledWith(SG_READY, true);
  });

  it("does not signal ready when at least 1 indicator is not yet ready", () => {
    const graceful = new Graceful({ app, skipProcessSignals: true });

    graceful.waitForReady("one"); // 1 app.set(SG_READY, false)
    graceful.waitForReady("two"); // 2
    graceful.waitForReady("three"); // 3

    graceful.signalReady("one");
    graceful.signalReady("two");

    expect(app.set).toHaveBeenCalledTimes(3);
    expect(app.set).toHaveBeenNthCalledWith(1, SG_READY, false);
    expect(app.set).toHaveBeenNthCalledWith(2, SG_READY, false);
    expect(app.set).toHaveBeenNthCalledWith(3, SG_READY, false);
    expect(app.set).not.toHaveBeenLastCalledWith(SG_READY, true);
  });

  it("throws if an indicator is signaled as ready before being waited on", () => {
    const graceful = new Graceful({ skipProcessSignals: true });
    expect(() => {
      graceful.signalReady("boom");
    }).toThrowError(
      "[SimplyGraceful] Indicator boom has not yet been waited on. Did you forget to call waitForReady('boom')?"
    );
  });

  it("throws if an indicator is waited on more than once", () => {
    const graceful = new Graceful({ skipProcessSignals: true });
    graceful.waitForReady("whoop");
    expect(() => {
      graceful.waitForReady("whoop");
    }).toThrowError(
      "[SimplyGraceful] Indicator 'whoop' has already been waited on."
    );
  });

  it("sets up process signal listeners by default", () => {
    new Graceful();

    expect(process.on).toHaveBeenCalledTimes(5);
    expect(process.on).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGHUP", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith(
      "uncaughtException",
      expect.any(Function)
    );
    expect(process.on).toHaveBeenCalledWith(
      "unhandledRejection",
      expect.any(Function)
    );
  });
});
