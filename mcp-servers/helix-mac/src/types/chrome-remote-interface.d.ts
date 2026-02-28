declare module "chrome-remote-interface" {
  interface Target {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl?: string;
  }

  interface RuntimeEvaluateResult {
    result: {
      type: string;
      value?: any;
      description?: string;
    };
    exceptionDetails?: {
      text: string;
      exception?: any;
    };
  }

  interface Client {
    Browser: {
      getVersion(): Promise<any>;
    };
    Runtime: {
      evaluate(params: {
        expression: string;
        returnByValue?: boolean;
        awaitPromise?: boolean;
      }): Promise<RuntimeEvaluateResult>;
    };
    Page: {
      captureScreenshot(params?: {
        format?: string;
        quality?: number;
      }): Promise<{ data: string }>;
      setDeviceMetricsOverride(params: {
        width: number;
        height: number;
        deviceScaleFactor: number;
        mobile: boolean;
      }): Promise<void>;
      clearDeviceMetricsOverride(): Promise<void>;
    };
    close(): Promise<void>;
  }

  interface CDPOptions {
    port?: number;
    host?: string;
    target?: string;
  }

  function CDP(options?: CDPOptions): Promise<Client>;

  namespace CDP {
    function List(options?: { port?: number; host?: string }): Promise<Target[]>;
    type Client = import("chrome-remote-interface").Client;
    type Target = import("chrome-remote-interface").Target;
  }

  export = CDP;
}
