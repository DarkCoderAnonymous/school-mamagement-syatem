import mongoose from 'mongoose';
import { env } from '../config/env';

mongoose.set('strictQuery', true);

export async function connectDB(uri: string = env.MONGO_URI): Promise<typeof mongoose> {
  mongoose.connection.on('connected', () => {
    // eslint-disable-next-line no-console
    console.log('[db] mongoose connected');
  });
  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] mongoose connection error', err);
  });
  return mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
