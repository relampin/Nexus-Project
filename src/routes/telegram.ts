import { Router } from "express";
import { telegramRelaySchema } from "../core/schema";
import { TelegramBridge } from "../services/telegram";

export function createTelegramRouter(telegram: TelegramBridge) {
  const router = Router();

  router.post("/relay", async (req, res, next) => {
    try {
      const parsed = telegramRelaySchema.parse(req.body);
      const command = await telegram.relay(parsed);

      res.status(201).json({
        id: command.id,
        status: command.status,
        target: command.target,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
