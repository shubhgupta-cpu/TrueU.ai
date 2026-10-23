// Reads the transcript file the editor puts next to the long video (PDF, Word, or plain text / SRT / VTT).
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const TRANSCRIPT_FILE = /\.(pdf|docx|txt|srt|vtt)$/i;
export const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

export async function fileText(name: string, data: Uint8Array): Promise<string> {
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase();
  if (ext === 'docx') return (await mammoth.extractRawText({ buffer: Buffer.from(data) })).value;
  if (ext === 'pdf') {
    const pdf = await getDocumentProxy(data);
    return (await extractText(pdf, { mergePages: true })).text;
  }
  return new TextDecoder('utf-8').decode(data);
}
