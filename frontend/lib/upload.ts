import { api } from './api';

interface UploadSignature {
  storage: 'cloudinary' | 'unconfigured';
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  signature?: string;
  folder?: string;
  type?: string;
  resourceType?: string;
  uploadUrl?: string;
}

/**
 * Upload a photo/voice file directly to Cloudinary as an authenticated asset,
 * using a signature minted by our backend. Returns the public_id to store as
 * photoKey/voiceKey — or null if storage is not configured (dev).
 */
export async function uploadMedia(kind: 'photo' | 'voice', file: File): Promise<string | null> {
  const sig = await api<UploadSignature>('/complaints/upload-url', {
    method: 'POST',
    body: { kind, contentType: file.type },
  });
  if (sig.storage !== 'cloudinary' || !sig.uploadUrl) return null;

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey!);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature!);
  form.append('folder', sig.folder!);
  form.append('type', sig.type!);

  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.public_id as string;
}
