import qrcode from "qrcode-terminal";

/** Build the deep-link payload encoded into the pairing QR code. */
export function buildPairPayload(url: string, token: string): string {
  return `mobilebridge://pair?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
}

/** Render a scannable QR code for the payload to the terminal. */
export async function renderQr(payload: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(payload, { small: true }, (qr) => resolve(qr));
  });
}
