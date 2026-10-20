/**
 * Video Stream and Camera Capture Manager for ChatterBots Remix
 */

export class VideoManager {
  private currentStream: MediaStream | null = null;
  private facingMode: 'user' | 'environment' = 'user';

  // Start webcam video stream
  async startCamera(videoElement?: HTMLVideoElement | null, facing: 'user' | 'environment' = 'user'): Promise<MediaStream> {
    this.stopCamera();
    this.facingMode = facing;

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false, // audio handled via audioManager
    };

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        const notSupportedError = new Error('متصفحك أو بيئة العرض لا تدعم الكاميرا مباشرة.');
        notSupportedError.name = 'NotSupportedError';
        throw notSupportedError;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;

      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.play().catch((err) => console.warn('Video play notice:', err));
      }

      return stream;
    } catch (err: any) {
      console.warn('Camera permission or device notice:', err?.name || err?.message || 'Access denied');
      throw err;
    }
  }

  // Stop camera stream
  stopCamera(videoElement?: HTMLVideoElement | null) {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
      this.currentStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  // Switch between front and back camera
  async flipCamera(videoElement?: HTMLVideoElement | null): Promise<MediaStream> {
    const nextMode = this.facingMode === 'user' ? 'environment' : 'user';
    return this.startCamera(videoElement, nextMode);
  }

  // Capture current video frame as base64 JPEG
  captureFrame(videoElement: HTMLVideoElement | null): string | null {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    // Scale down to max 1024px for quick upload
    const maxDim = 1024;
    let width = videoElement.videoWidth;
    let height = videoElement.videoHeight;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoElement, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  // Check if camera is currently running
  isCameraActive(): boolean {
    return Boolean(this.currentStream && this.currentStream.active);
  }
}

export const videoManager = new VideoManager();
