import { AssemblyAI } from 'assemblyai';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

let client: AssemblyAI | null = null;

function getClient(): AssemblyAI | null {
  if (client) return client;
  const envVars = readEnvFile(['ASSEMBLYAI_API_KEY']);
  const apiKey =
    process.env.ASSEMBLYAI_API_KEY || envVars.ASSEMBLYAI_API_KEY || '';
  if (!apiKey) {
    logger.warn('ASSEMBLYAI_API_KEY not set — voice transcription disabled');
    return null;
  }
  client = new AssemblyAI({ apiKey });
  return client;
}

/**
 * Transcribe an audio file from a URL using AssemblyAI.
 * Returns the transcript text, or null if transcription fails or is unavailable.
 */
export async function transcribeAudio(
  audioUrl: string,
): Promise<string | null> {
  const aai = getClient();
  if (!aai) return null;

  try {
    const transcript = await aai.transcripts.transcribe({ audio: audioUrl });
    if (transcript.status === 'error') {
      logger.error(
        { error: transcript.error },
        'AssemblyAI transcription failed',
      );
      return null;
    }
    logger.info(
      { chars: transcript.text?.length ?? 0 },
      'Transcribed voice message',
    );
    return transcript.text || null;
  } catch (err) {
    logger.error({ err }, 'AssemblyAI transcription request failed');
    return null;
  }
}
