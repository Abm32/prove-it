export interface CaptureStatus { fps: number; latencyMs: number | null; watching: boolean; message: string }
export interface CaptureController { stop(): void }

export async function startCapture(onStatus: (status: CaptureStatus) => void): Promise<CaptureController> {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: true });
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = display;
  await video.play();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  const displayAudio = display.getAudioTracks();
  let mic: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let mixed: MediaStream | null = null;
  const audioTracks = [...displayAudio];
  if (!displayAudio.length) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(mic).connect(destination);
      mixed = destination.stream;
      audioTracks.push(...mixed.getAudioTracks());
    } catch { onStatus({ fps: 0, latencyMs: null, watching: true, message: 'Screen shared; microphone unavailable' }); }
  }
  let active = true;
  let frames = 0;
  let frameStarted = Date.now();
  const audioStream = audioTracks.length && typeof MediaRecorder !== 'undefined' ? new MediaStream(audioTracks) : null;
  const audioMime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  let audioRecorder: MediaRecorder | null = null;
  let audioTimer: ReturnType<typeof setInterval> | null = null;
  const stop = (): void => {
    if (!active) return;
    active = false;
    clearInterval(frameTimer);
    if (audioTimer) clearInterval(audioTimer);
    audioTimer = null;
    display.getTracks().forEach((track) => track.stop());
    mic?.getTracks().forEach((track) => track.stop());
    mixed?.getTracks().forEach((track) => track.stop());
    if (audioRecorder?.state === 'recording') audioRecorder.stop();
    void audioContext?.close();
    video.srcObject = null;
    onStatus({ fps: 0, latencyMs: null, watching: false, message: 'Referee idle' });
  };
  const startAudioRecorder = (): void => {
    if (!active || !audioStream) return;
    const recorder = new MediaRecorder(audioStream, { mimeType: audioMime });
    audioRecorder = recorder;
    recorder.addEventListener('dataavailable', (event) => {
      if (!active || event.data.size < 1024) return;
      void event.data.arrayBuffer().then((buffer) => fetch('/api/capture/audio', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': recorder.mimeType || audioMime },
        body: buffer,
      })).catch(() => undefined);
    });
    recorder.addEventListener('stop', () => {
      if (audioRecorder === recorder) audioRecorder = null;
      if (active) startAudioRecorder();
    }, { once: true });
    recorder.start();
  };
  startAudioRecorder();
  if (audioStream) {
    audioTimer = setInterval(() => {
      if (active && audioRecorder?.state === 'recording') audioRecorder.stop();
    }, 5000);
  }
  const frameTimer = setInterval(() => {
    if (!active || video.videoWidth === 0) return;
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!active || !blob) return;
      try {
        const sentAt = performance.now();
        const response = await fetch('/api/capture/frame', { method: 'POST', credentials: 'include', headers: { 'content-type': 'image/jpeg' }, body: blob });
        frames += 1;
        const now = Date.now();
        const elapsed = now - frameStarted;
        const latency = Math.round(performance.now() - sentAt);
        onStatus({ fps: elapsed >= 5000 ? Math.round(frames * 1000 / elapsed * 10) / 10 : 1, latencyMs: latency, watching: true, message: response.ok ? 'Referee watching' : 'Capture upload failed' });
        if (elapsed >= 5000) { frames = 0; frameStarted = now; }
      } catch { onStatus({ fps: 0, latencyMs: null, watching: active, message: 'Capture connection lost' }); }
    }, 'image/jpeg', 0.6);
  }, 1000);
  display.getVideoTracks()[0]?.addEventListener('ended', stop, { once: true });
  onStatus({ fps: 0, latencyMs: null, watching: true, message: 'Referee watching' });
  return { stop };
}
