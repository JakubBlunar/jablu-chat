let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function playTone(freq1: number, freq2: number, volume = 0.25) {
  const ac = getCtx();
  if (!ac) return;

  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.15);

  const osc1 = ac.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = freq1;
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.08);

  const osc2 = ac.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq2;
  osc2.connect(gain);
  osc2.start(now + 0.07);
  osc2.stop(now + 0.15);
}

export function playJoinSound() {
  playTone(440, 580);
}

export function playLeaveSound() {
  playTone(580, 440);
}
