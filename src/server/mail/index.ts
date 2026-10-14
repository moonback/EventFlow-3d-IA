import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Résultat d'envoi. "sent" uniquement si le fournisseur SMTP a accepté le message ;
 * "stored" = écrit dans la boîte locale de développement ; "disabled" = non envoyé.
 */
export type MailResult =
  | { status: "sent"; messageId: string }
  | { status: "stored"; file: string }
  | { status: "disabled" }
  | { status: "failed"; error: string };

let transport: nodemailer.Transporter | null = null;

function smtpTransport() {
  const e = env();
  transport ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT ?? 587,
    secure: e.SMTP_SECURE === "true",
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  return transport;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const e = env();
  try {
    switch (e.MAIL_DRIVER) {
      case "disabled":
        return { status: "disabled" };
      case "file": {
        const dir = path.resolve(process.cwd(), "storage", "mail-outbox");
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `${Date.now()}-${message.to.replace(/[^a-z0-9@.]/gi, "_")}.eml.txt`);
        const attached = (message.attachments ?? []).map((a) => a.filename).join(", ");
        await writeFile(
          file,
          `From: ${e.MAIL_FROM}\nTo: ${message.to}\nSubject: ${message.subject}\n${attached ? `Attachments: ${attached}\n` : ""}\n${message.text}\n`,
          { mode: 0o600 },
        );
        for (const a of message.attachments ?? []) {
          await writeFile(`${file}.${a.filename.replace(/[^a-z0-9._-]/gi, "_")}`, a.content, { mode: 0o600 });
        }
        return { status: "stored", file };
      }
      case "smtp": {
        const info = await smtpTransport().sendMail({ from: e.MAIL_FROM, ...message });
        if (info.accepted.length === 0) return { status: "failed", error: "Aucun destinataire accepté" };
        return { status: "sent", messageId: info.messageId };
      }
    }
  } catch (error) {
    console.error("[mail] delivery failed", error instanceof Error ? error.message : error);
    return { status: "failed", error: "Échec de l'envoi" };
  }
}
