import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 4000 });
    console.log('MongoDB connected');
    return;
  } catch (err) {
    if (env.nodeEnv === 'production') throw err;
    console.warn(`MongoDB at ${env.mongoUri} is unavailable (${err.message}). Starting an in-memory database for local development.`);
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri());
  console.log('In-memory MongoDB connected');
}
