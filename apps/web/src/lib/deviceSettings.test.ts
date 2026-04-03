import {
  migrateSettings,
  getSavedAudioInput,
  setSavedAudioInput,
  getSavedAudioOutput,
  setSavedAudioOutput,
  getSavedCamera,
  setSavedCamera,
  getSavedCameraQuality,
  setSavedCameraQuality,
  getSavedBlurEnabled,
  setSavedBlurEnabled,
  validateDeviceId,
  getValidatedDevices,
  CAMERA_PRESETS
} from './deviceSettings'

beforeEach(() => {
  localStorage.clear()
})

describe('migrateSettings', () => {
  it('stamps version on fresh install', () => {
    migrateSettings()
    expect(localStorage.getItem('chat:settings-version')).toBe('1')
  })

  it('no-ops when already at current version', () => {
    localStorage.setItem('chat:settings-version', '1')
    migrateSettings()
    expect(localStorage.getItem('chat:settings-version')).toBe('1')
  })
})

describe('audio input get/set', () => {
  it('returns empty string by default', () => {
    expect(getSavedAudioInput()).toBe('')
  })

  it('persists and retrieves device id', () => {
    setSavedAudioInput('device-123')
    expect(getSavedAudioInput()).toBe('device-123')
  })
})

describe('audio output get/set', () => {
  it('returns empty string by default', () => {
    expect(getSavedAudioOutput()).toBe('')
  })

  it('persists and retrieves device id', () => {
    setSavedAudioOutput('out-456')
    expect(getSavedAudioOutput()).toBe('out-456')
  })
})

describe('camera get/set', () => {
  it('returns empty string by default', () => {
    expect(getSavedCamera()).toBe('')
  })

  it('persists and retrieves device id', () => {
    setSavedCamera('cam-789')
    expect(getSavedCamera()).toBe('cam-789')
  })
})

describe('camera quality', () => {
  it('defaults to 720p', () => {
    expect(getSavedCameraQuality()).toBe('720p')
  })

  it('persists and retrieves quality setting', () => {
    setSavedCameraQuality('1080p')
    expect(getSavedCameraQuality()).toBe('1080p')
  })

  it('returns 720p for invalid stored value', () => {
    localStorage.setItem('chat:voice:camera-quality', 'invalid')
    expect(getSavedCameraQuality()).toBe('720p')
  })
})

describe('background blur', () => {
  it('defaults to false', () => {
    expect(getSavedBlurEnabled()).toBe(false)
  })

  it('persists and retrieves blur setting', () => {
    setSavedBlurEnabled(true)
    expect(getSavedBlurEnabled()).toBe(true)
  })
})

describe('CAMERA_PRESETS', () => {
  it('has all expected quality levels', () => {
    expect(Object.keys(CAMERA_PRESETS)).toEqual(['360p', '480p', '720p', '1080p'])
  })

  it('720p has correct dimensions', () => {
    expect(CAMERA_PRESETS['720p']).toEqual({ width: 1280, height: 720, fps: 30 })
  })
})

describe('validateDeviceId', () => {
  it('returns empty string for empty saved id', async () => {
    expect(await validateDeviceId('', 'audioinput')).toBe('')
  })

  it('returns device id when it exists', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'dev-1' },
          { kind: 'audioinput', deviceId: 'dev-2' }
        ])
      },
      configurable: true
    })

    expect(await validateDeviceId('dev-1', 'audioinput')).toBe('dev-1')
  })

  it('returns empty string when device no longer exists', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'other' }
        ])
      },
      configurable: true
    })

    expect(await validateDeviceId('missing', 'audioinput')).toBe('')
  })

  it('returns empty string when enumerateDevices throws', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: jest.fn().mockRejectedValue(new Error('no access'))
      },
      configurable: true
    })

    expect(await validateDeviceId('dev-1', 'audioinput')).toBe('')
  })
})

describe('getValidatedDevices', () => {
  it('validates all three device types', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'mic-1' },
          { kind: 'audiooutput', deviceId: 'spk-1' },
          { kind: 'videoinput', deviceId: 'cam-1' }
        ])
      },
      configurable: true
    })

    setSavedAudioInput('mic-1')
    setSavedAudioOutput('spk-1')
    setSavedCamera('cam-1')

    const result = await getValidatedDevices()

    expect(result).toEqual({
      audioInput: 'mic-1',
      audioOutput: 'spk-1',
      camera: 'cam-1'
    })
  })
})
