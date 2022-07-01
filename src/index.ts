import type { Server } from "http";
import type { Express } from "express";

const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGHUP", "SIGTERM"];
const GRACE = 5_000; // 5 second grace before closing server connection
const DELAY = 30_000; // 30 second force exit deadline

interface Logger {
  log: (msg?: any, ...data: any[]) => void;
  error: (msg?: any, ...data: any[]) => void;
}

export type SimplyGracefulConfig = {
  /** Express app */
  app?: Express;

  /** Node HTTP Server */
  server?: Server;

  /** Skip process signals */
  skipProcessSignals?: boolean;

  /** Console-like interface to log messaes, defaults to `console` */
  logger?: Logger;

  /** Liveness path, default: /.live */
  livePath?: string;

  /** Readiness path, default: /.ready */
  readyPath?: string;

  /** Grace period, default: 5 seconds */
  grace?: number;

  /** Force exit deadline, default: 30 seconds */
  delay?: number;
};

export default class SimplyGraceful {
  // Express App
  private app?: Express;

  // Node HTTP Service
  private server?: Server;

  // Ready indicators to wait on
  private indicators: { [name: string]: boolean } = {};

  // logger interface
  private logger: Logger;

  // full config
  private config: SimplyGracefulConfig = {};

  /**
   * Graceful sets up:
   * - liveness and readiness probes
   * - process exception handling
   * - graceful server close & process exiting
   *
   */
  constructor({
    app,
    server,
    skipProcessSignals = false,
    logger = console,
    livePath = "/.live",
    readyPath = "/.ready",
    grace = GRACE,
    delay = DELAY,
  }: SimplyGracefulConfig = {}) {
    if (app) this.setApp(app);
    if (server) this.setServer(server);
    this.logger = logger;

    Object.assign(this.config, {
      livePath,
      readyPath,
      grace,
      delay,
    });

    if (skipProcessSignals) return;

    // setup our process signal listeners
    for (const signal of SIGNALS) {
      process.on(signal, () => {
        // log out as an Error
        this.logger.log(`${signal} - Starting shutdown...`);
        this.shutdown();
      });
    }

    // process exception handler
    process.on("uncaughtException", (err) => {
      this.logger.error(err);
      this.shutdown(1);
    });

    // process rejection handler
    process.on("unhandledRejection", (reason, promise) => {
      this.logger.error("[unhandledRejection]", reason, promise);
      this.shutdown(1);
    });
  }

  public setServer(server: Server): void {
    this.server = server;
  }

  public setApp(app: Express): void {
    this.app = app;

    // setup status probes
    this.app.get("/.live", (_req, res) => res.sendStatus(200));
    this.app.get("/.ready", (_req, res) =>
      this.app?.get("ready") ? res.sendStatus(200) : res.sendStatus(503)
    );
  }

  public waitForReady(indicator: string): void {
    // make sure we're not ready yet
    this.setNotReady();

    if (indicator in this.indicators) {
      throw new Error(`Indicator ${indicator} has already been waited on.`);
    }

    // default to false for the given indicator
    this.indicators[indicator] = false;
  }

  public setNotReady(): void {
    this.app?.set("ready", false);
  }

  public signalReady(indicator: string): void {
    if (!(indicator in this.indicators)) {
      throw new Error(
        `Indicator ${indicator} has not yet been waited on. Did you forget to call waitForReady(${indicator})?`
      );
    }

    // signal this indicator as ready
    this.indicators[indicator] = true;

    // potentially set app as ready
    this.setAsReady();
  }

  private setAsReady(): void {
    // As long as all indicators are ready, we can signal we're ready
    const anyNotReady = Object.entries(this.indicators).find(
      ([, status]) => !status
    );

    if (anyNotReady) return;

    this.app?.set("ready", true);
  }

  private shutdown(exitCode = 0): void {
    // immediately set server as not ready
    this.setNotReady();

    // grace before server close to give requests a chance to complete
    setTimeout(() => {
      this.server?.close((err) => {
        if (err) this.logger.error(err);
        this.logger.log("Server closed cleanly, exiting...");
        process.nextTick(() => process.exit(exitCode));
      });
    }, this.config.grace).unref();

    // force exit deadline
    setTimeout(() => {
      this.logger.log("Server preoccupied, force exiting...");
      process.nextTick(() => process.exit(exitCode));
    }, this.config.delay).unref();
  }
}
