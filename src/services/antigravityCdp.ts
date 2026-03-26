interface CdpTarget {
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface CdpCommandResult<T = unknown> {
  result?: T;
  error?: {
    message?: string;
  };
}

interface RuntimeEvaluateResult<T = unknown> {
  result?: {
    value?: T;
  };
}

export interface AntigravityVisibleEditorSnapshot {
  id: string | null;
  role: string | null;
  ariaLabel: string | null;
  className: string;
  text: string;
}

export interface AntigravityVisibleButtonSnapshot {
  text: string;
  ariaLabel: string | null;
  title: string | null;
  className: string;
}

export interface AntigravityVisibleSessionSnapshot {
  title: string;
  url: string;
  bodyText: string;
  activityLine: string | null;
  editors: AntigravityVisibleEditorSnapshot[];
  buttons: AntigravityVisibleButtonSnapshot[];
}

export class AntigravityCdpBridge {
  private readonly endpoint = (process.env.ANTIGRAVITY_CDP_ENDPOINT ?? "http://127.0.0.1:9222").replace(/\/$/, "");
  private readonly targetTitle = process.env.ANTIGRAVITY_CDP_PAGE_TITLE ?? "Antigravity";
  private readonly inputRootId = process.env.ANTIGRAVITY_CDP_INPUT_ROOT_ID ?? "antigravity.agentSidePanelInputBox";

  async injectPrompt(prompt: string) {
    const target = await this.resolveTarget();

    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Pagina do Antigravity nao encontrada no CDP.");
    }

    const client = new CdpClient(target.webSocketDebuggerUrl);

    try {
      await client.connect();
      await client.send("Page.bringToFront");
      await client.send("Runtime.enable");
      const value = await this.focusEditor(client);

      if (!value?.ok) {
        throw new Error(value?.reason ?? "Nao consegui focar o editor do Antigravity.");
      }

      await this.clearDraft(client);
      await this.delay(80);
      await client.send("Input.insertText", { text: prompt });
      await this.delay(120);
      await this.pressEnter(client);

      return value;
    } finally {
      client.close();
    }
  }

  async isAvailable() {
    try {
      const target = await this.resolveTarget();
      return Boolean(target?.webSocketDebuggerUrl);
    } catch {
      return false;
    }
  }

  async readVisibleSession() {
    const target = await this.resolveTarget();

    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Pagina do Antigravity nao encontrada no CDP.");
    }

    const client = new CdpClient(target.webSocketDebuggerUrl);

    try {
      await client.connect();
      await client.send("Runtime.enable");
      const snapshot = await this.evaluate<AntigravityVisibleSessionSnapshot>(client, this.buildVisibleSessionExpression());

      if (!snapshot) {
        throw new Error("Nao consegui ler o estado visivel do Antigravity via CDP.");
      }

      return snapshot;
    } finally {
      client.close();
    }
  }

  private async resolveTarget() {
    const response = await fetch(`${this.endpoint}/json/list`);

    if (!response.ok) {
      throw new Error(`CDP indisponivel: ${response.status} ${response.statusText}`);
    }

    const targets = (await response.json()) as CdpTarget[];

    return targets.find((target) =>
      target.type === "page"
      && target.title?.includes(this.targetTitle)
      && target.url?.includes("workbench.html"))
      ?? targets.find((target) =>
        target.type === "page"
        && target.title?.includes(this.targetTitle))
      ?? null;
  }

  private async focusEditor(client: CdpClient) {
    return this.evaluate<{ ok: boolean; reason?: string }>(client, this.buildFocusExpression());
  }

  private async clearDraft(client: CdpClient) {
    await this.dispatchKey(client, {
      type: "rawKeyDown",
      key: "Control",
      code: "ControlLeft",
      windowsVirtualKeyCode: 17,
      nativeVirtualKeyCode: 17,
      modifiers: 2,
    });

    await this.dispatchKey(client, {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2,
      text: "a",
      unmodifiedText: "a",
    });

    await this.dispatchKey(client, {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2,
    });

    await this.dispatchKey(client, {
      type: "keyUp",
      key: "Control",
      code: "ControlLeft",
      windowsVirtualKeyCode: 17,
      nativeVirtualKeyCode: 17,
    });

    await this.dispatchKey(client, {
      type: "keyDown",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });

    await this.dispatchKey(client, {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
  }

  private async pressEnter(client: CdpClient) {
    await this.dispatchKey(client, {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: "\r",
      unmodifiedText: "\r",
    });

    await this.dispatchKey(client, {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
  }

  private dispatchKey(client: CdpClient, params: Record<string, unknown>) {
    return client.send("Input.dispatchKeyEvent", params);
  }

  private async evaluate<T>(client: CdpClient, expression: string) {
    const evaluation = await client.send<CdpCommandResult<RuntimeEvaluateResult<T>>>("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });

    return evaluation.result?.result?.value;
  }

  private buildFocusExpression() {
    return `(() => {
      const root = document.getElementById(${JSON.stringify(this.inputRootId)});
      if (!root) return { ok: false, reason: "input root not found" };

      const editor = root.querySelector('[contenteditable="true"][role="textbox"]');
      if (!editor) return { ok: false, reason: "textbox not found" };

      editor.focus();
      editor.click();

      return { ok: true };
    })()`;
  }

  private buildVisibleSessionExpression() {
    return `(() => {
      const bodyText = (document.body?.innerText || "").replace(/\\u00a0/g, " ").trim();
      const lines = bodyText.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
      const activityLine = lines.find((line) =>
        /thought for\\s+\\d+s/i.test(line)
        || /building\\s+/i.test(line)
        || /running\\s+/i.test(line)
        || /working\\s+/i.test(line)
      ) || null;
      const editors = Array.from(document.querySelectorAll('[contenteditable="true"]'))
        .map((element) => ({
          id: element.id || null,
          role: element.getAttribute("role"),
          ariaLabel: element.getAttribute("aria-label"),
          className: typeof element.className === "string" ? element.className : "",
          text: ((element.innerText || element.textContent || "").trim()).slice(0, 600),
        }));
      const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
        .map((element) => ({
          text: ((element.innerText || element.textContent || "").trim()).slice(0, 160),
          ariaLabel: element.getAttribute("aria-label"),
          title: element.getAttribute("title"),
          className: typeof element.className === "string" ? element.className : "",
        }))
        .filter((item) => item.text || item.ariaLabel || item.title)
        .slice(0, 40);

      return {
        title: document.title,
        url: location.href,
        bodyText: bodyText.slice(0, 6000),
        activityLine,
        editors,
        buttons,
      };
    })()`;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class CdpClient {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: CdpCommandResult) => void;
    reject: (error: Error) => void;
  }>();

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Falha ao conectar no websocket do CDP.")), { once: true });
      this.socket.addEventListener("message", (event) => this.handleMessage(event));
    });
  }

  close() {
    if (this.socket.readyState === this.socket.OPEN || this.socket.readyState === this.socket.CONNECTING) {
      this.socket.close();
    }
  }

  send<T = CdpCommandResult>(method: string, params?: Record<string, unknown>) {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId;
      this.nextId += 1;

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });

      this.socket.send(JSON.stringify({
        id,
        method,
        params,
      }));
    });
  }

  private handleMessage(event: MessageEvent) {
    const message = JSON.parse(String(event.data)) as { id?: number; error?: { message?: string } };

    if (!message.id) {
      return;
    }

    const pending = this.pending.get(message.id);

    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message ?? "Erro desconhecido do CDP."));
      return;
    }

    pending.resolve(message as CdpCommandResult);
  }
}
