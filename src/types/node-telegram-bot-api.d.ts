declare module "node-telegram-bot-api" {
  namespace TelegramBot {
    interface Chat {
      id: number;
    }

    interface Message {
      chat: Chat;
      message_id: number;
      text?: string;
    }

    interface SendMessageOptions {
      parse_mode?: string;
    }
  }

  class TelegramBot {
    constructor(token: string, options?: { polling?: boolean });
    on(event: "message", listener: (message: TelegramBot.Message) => void | Promise<void>): void;
    onText(regexp: RegExp, listener: (message: TelegramBot.Message) => void): void;
    sendMessage(chatId: number, text: string, options?: TelegramBot.SendMessageOptions): Promise<unknown>;
    stopPolling(): void;
  }

  export = TelegramBot;
}
