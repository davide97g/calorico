export type CameraPermissionResult =
  | { ok: true }
  | { ok: false; message: string }

/** The browser, not the app, persists camera grants. */
export async function requestCameraPermission(): Promise<CameraPermissionResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: 'Fotocamera non supportata da questo browser.' }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    stream.getTracks().forEach((track) => track.stop())
    return { ok: true }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    return {
      ok: false,
      message:
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Fotocamera bloccata. Abilitala nelle impostazioni del browser o dell’app.'
          : 'Fotocamera non disponibile. Controlla che nessun’altra app la stia usando.',
    }
  }
}
