export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface MailerService {
  send(message: MailMessage): Promise<void>;
}

/**
 * Dev adapter: logs the email instead of sending it. Same interface-behind-
 * an-adapter pattern as file storage (see CLAUDE.md's StorageService note) —
 * a real SMTP/SES adapter can be swapped in later without touching callers.
 */
class ConsoleMailer implements MailerService {
  async send(message: MailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[mailer] to=${message.to} subject="${message.subject}"\n${message.body}`);
  }
}

export const mailer: MailerService = new ConsoleMailer();
