'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, RefreshCw } from 'lucide-react';

/**
 * Capture a photo of the problem — either live from the device camera
 * (getUserMedia, works on phone + laptop) or by choosing an existing image.
 * Emits a File via onChange; the parent uploads it to Cloudinary.
 */
export default function PhotoCapture({
  value,
  onChange,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep an object URL preview in sync with the selected file.
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Clean up the camera stream on unmount.
  useEffect(() => () => stopStream(), []);

  async function openCamera() {
    setCamError(null);
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCamError('Camera not available on this device. Use “Upload” instead.');
      return;
    }
    if (!window.isSecureContext) {
      setCamError('Camera needs a secure connection — open via http://localhost, or use “Upload”.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Attach after the modal renders.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCamError('Could not access the camera. Check permissions, or use “Upload”.');
    }
  }

  function closeCamera() {
    stopStream();
    setCameraOpen(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${canvas.width}x${canvas.height}.jpg`, { type: 'image/jpeg' });
        onChange(file);
        closeCamera();
      },
      'image/jpeg',
      0.9,
    );
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) onChange(f);
  }

  return (
    <div>
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-line-strong">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Selected problem photo preview" className="max-h-64 w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-2">
            <button type="button" onClick={openCamera} className="btn-secondary px-2.5 py-1.5 text-xs shadow">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retake
            </button>
            <button type="button" onClick={() => onChange(null)} className="btn-secondary px-2.5 py-1.5 text-xs shadow" aria-label="Remove photo">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={openCamera} className="btn-primary">
            <Camera className="h-4 w-4" aria-hidden /> Take photo
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
            <Upload className="h-4 w-4" aria-hidden /> Upload
          </button>
        </div>
      )}

      {/* Hidden file input. `capture` hints mobile browsers to open the camera. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={onFile}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />

      {camError ? <p className="mt-2 text-xs text-red-700">{camError}</p> : null}

      {/* Live camera modal */}
      {cameraOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink-900" role="dialog" aria-modal="true" aria-label="Camera">
          <div className="flex items-center justify-between p-4">
            <span className="font-heading text-sm font-semibold text-white">Take a photo of the problem</span>
            <button type="button" onClick={closeCamera} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Close camera">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />
          </div>
          <div className="flex items-center justify-center gap-4 p-6">
            <button type="button" onClick={capture} className="grid h-16 w-16 cursor-pointer place-items-center rounded-full border-4 border-white bg-white/20 transition-colors hover:bg-white/40" aria-label="Capture photo">
              <span className="h-12 w-12 rounded-full bg-white" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
