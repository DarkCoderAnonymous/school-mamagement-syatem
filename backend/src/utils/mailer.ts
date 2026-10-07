import { env } from '../config/env';

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
 *
 * The body is printed only in development and test. Bodies carry password
 * reset tokens and temporary passwords, and a production log (shipped to a
 * log service, visible in a hosting dashboard) is no place for a credential:
 * anyone who could read it could take over the account. In production this
 * logs that a message was due, to whom and about what — nothing more.
 */
export class ConsoleMailer implements MailerService {
  constructor(private readonly showBody: boolean = env.NODE_ENV !== 'production') {}

  async send(message: MailMessage): Promise<void> {
    if (this.showBody) {
      // eslint-disable-next-line no-console
      console.log(`[mailer] to=${message.to} subject="${message.subject}"\n${message.body}`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[mailer] to=${message.to} subject="${message.subject}" (body withheld — console driver delivers no email)`);
  }
}

export const mailer: MailerService = new ConsoleMailer();

/**
 * Header values may not span lines: a CR/LF inside a subject or address
 * (e.g. from a student or exam name) would start a new header in SMTP.
 * Applied to every message on its way into the queue.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
