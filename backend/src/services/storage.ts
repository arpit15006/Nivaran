import { v2 as cloudinary } from 'cloudinary';
import { env, hasCloudinary } from '../env.js';

// Cloudinary (Option A): media is uploaded as `authenticated` (private) assets
// directly from the browser using a backend-signed upload signature. The DB
// stores only the public_id; viewing requires a backend-minted signed URL.
if (hasCloudinary) {
  // Reads CLOUDINARY_URL from the environment automatically.
  cloudinary.config({ secure: true });
}

export const storageConfigured = hasCloudinary;

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mpeg', 'audio/mp4']);
export function isAllowedContentType(ct: string): boolean {
  return ALLOWED.has(ct);
}

export type MediaKind = 'photo' | 'voice';
export function resourceTypeFor(kind: MediaKind): 'image' | 'video' {
  // Cloudinary delivers audio through its `video` resource type.
  return kind === 'photo' ? 'image' : 'video';
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  type: 'authenticated';
  resourceType: 'image' | 'video';
  uploadUrl: string;
}

/**
 * Produce a signed upload payload for a direct browser → Cloudinary upload.
 * The browser POSTs the file plus these fields to `uploadUrl`; Cloudinary
 * verifies the signature and stores the asset as authenticated. The signed
 * fields (folder, timestamp, type) must match exactly what the client sends.
 */
export function signUpload(kind: MediaKind): UploadSignature | null {
  if (!hasCloudinary) return null;
  const cfg = cloudinary.config();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = env.CLOUDINARY_FOLDER;
  const type = 'authenticated' as const;
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp, type }, cfg.api_secret as string);
  const resourceType = resourceTypeFor(kind);
  return {
    cloudName: cfg.cloud_name as string,
    apiKey: cfg.api_key as string,
    timestamp,
    signature,
    folder,
    type,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloud_name}/${resourceType}/upload`,
  };
}

/**
 * Mint a signed delivery URL for an authenticated asset (PRD §11/§14).
 * The signature (`s--…--`) authorizes access; without it the asset 404s.
 * Note: true time-expiry requires Cloudinary auth tokens (a paid add-on); the
 * signed authenticated URL here is access-controlled but not time-bounded.
 */
export function signedDeliveryUrl(publicId: string, kind: MediaKind): string | null {
  if (!hasCloudinary) return null;
  return cloudinary.url(publicId, {
    type: 'authenticated',
    resource_type: resourceTypeFor(kind),
    sign_url: true,
    secure: true,
  });
}

/** Delete an asset (used by the retention sweep). */
export async function deleteAsset(publicId: string, kind: MediaKind): Promise<void> {
  if (!hasCloudinary) return;
  await cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: resourceTypeFor(kind) });
}
