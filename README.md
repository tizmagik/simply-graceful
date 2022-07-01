# simply-graceful :hibiscus: [![npm version](https://badge.fury.io/js/simply-graceful.svg)](https://badge.fury.io/js/simply-graceful)

A simple utility that provides asynchronous liveness and readiness probe management. It also handles graceful server close/process exiting to allow current requests in flight to complete in a best effort.

## Installation

```bash
npm i simply-graceful
```

or

```bash
yarn add simply-graceful
```

## Usage

```ts
import express from "express";
import type { Server } from "http";
import SimplyGraceful from "simply-graceful";
import { someMiddleware, anotherMiddleware } from "./middlewares";

export default async function Server(): Promise<Server> {
  const { PORT = 3000, ENV = "development" } = process.env;

  const app = express();

  const graceful = new SimplyGraceful({
    app,
    skipProcessSignals: !ENV.includes("production"),
  });

  // someMiddleware here may do async stuff, so we have it return a callback
  // to signal ready when it's done
  graceful.waitForReady("someMiddleware"); // wait for someMiddleware to signal ready
  app.use(
    someMiddleware(() => {
      graceful.signalReady("someMiddleware"); // signal ready when someMiddleware is ready
    })
  );

  // similarly, anotherMiddleware may do async stuff, but we'll use a promise pattern
  // instead of a callback (just to illustrate)
  graceful.waitForReady("anotherMiddleware");
  app.use(
    anotherMiddleware().then(() => {
      graceful.signalReady("anotherMiddleware"); // signal ready when anotherMiddleware is ready
    })
  );

  const server = app.listen({ port: PORT }, (): void => {
    console.log(`🚀  Server ready at http://localhost:${PORT}/`);
  });

  // Pass `server` to graceful so it can shutdown when it receives a signal
  graceful.setServer(server);

  return server;
}
```

## Config

Configuration options can be seen in [SimplyGracefulConfig](./src/index.ts#L13) type. More docs TK.
