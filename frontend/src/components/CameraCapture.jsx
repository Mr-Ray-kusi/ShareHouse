import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export default function CameraCapture({ value, onChange, label = 'Photo (optional)' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previewRef = useRef('');
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    if (!live || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play?.().catch(() => {});
  }, [live]);

  function setPhoto(file) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    if (!file) {
      previewRef.current = '';
      setPreview('');
      onChange?.(null);
      return;
    }
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);
    onChange?.(file);
  }

  async function openCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This phone cannot open the camera here. Use Take photo below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      streamRef.current = stream;
      setLive(true);
    } catch (_err) {
      setError('Could not open the camera. Allow camera access, or use Take photo.');
    }
  }

  function closeCamera() {
    stopStream(streamRef.current);
    streamRef.current = null;
    setLive(false);
  }

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('Could not capture that photo. Try again.');
        return;
      }
      const file = new File([blob], `walk-in-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPhoto(file);
      closeCamera();
    }, 'image/jpeg', 0.86);
  }

  return (
    <div>
      <label className="label">{label}</label>
      {live ? (
        <div className="space-y-2">
          <video
            ref={videoRef}
            className="h-56 w-full rounded-2xl bg-ink object-cover"
            autoPlay
            playsInline
            muted
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={snap}>
              Capture
            </button>
            <button type="button" className="btn-ghost" onClick={closeCamera}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {preview ? (
            <img src={preview} alt="Walk-in student" className="h-56 w-full rounded-2xl object-cover" />
          ) : (
            <button
              type="button"
              onClick={openCamera}
              className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-forest-300 bg-mist text-sm font-semibold text-forest-800"
            >
              <Camera size={28} />
              Open camera
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            {preview ? (
              <>
                <button type="button" className="btn-primary text-xs" onClick={openCamera}>
                  Retake photo
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={() => setPhoto(null)}>
                  Remove
                </button>
              </>
            ) : (
              <label className="btn-ghost text-xs cursor-pointer">
                Take photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>
          {value && !preview ? (
            <p className="text-xs text-ink/60">Photo ready to send.</p>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
