let audio: HTMLAudioElement | null = null;

export function playTaskCompleteChime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    // Two-tone chime: A5 (880 Hz) then C#6 (1108.7 Hz)
    [880, 1108.7].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.start(t);
      osc.stop(t + 0.9);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch (e) {
    console.warn("Task complete chime failed:", e);
  }
}

// Played when a focus interval ends and a break begins: descending, relaxing
export function playBreakStartChime(volume = 0.5): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    // Descending three-tone: C6 → A5 → F5
    [1046.5, 880, 698.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * 0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.start(t);
      osc.stop(t + 0.9);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch (e) {
    console.warn("Break start chime failed:", e);
  }
}

// Played when a break ends and a focus interval begins: ascending, energetic
export function playFocusStartChime(volume = 0.5): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    // Ascending three-tone: E5 → G5 → C6
    [659.3, 784, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.14;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * 0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.start(t);
      osc.stop(t + 0.8);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch (e) {
    console.warn("Focus start chime failed:", e);
  }
}

export function playAmbientSound(sound: string, volume: number): void {
  stopAmbientSound();
  if (sound === "none") return;
  audio = new Audio(`/sounds/${sound}.mp3`);
  audio.loop = true;
  audio.volume = Math.max(0, Math.min(1, volume / 100));
  audio.play().catch(console.warn);
}

export function stopAmbientSound(): void {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio = null;
  }
}

export function setAmbientVolume(volume: number): void {
  if (audio) {
    audio.volume = Math.max(0, Math.min(1, volume / 100));
  }
}
